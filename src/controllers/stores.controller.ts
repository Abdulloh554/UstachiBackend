import { Request, Response } from 'express';
import { Store, Product, Favorite, CartItem, Sale, SaleItem } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import {
  storeSerializer,
  productSerializer,
  favoriteSerializer,
  cartItemSerializer,
  saleSerializer,
  money,
} from '../utils/serializers';
import { parsePage } from '../utils/pagination';
import { toMediaUrl } from '../middleware/upload';

const populateProduct = (query: any) => query.populate('store', 'name');

const paginatedList = (page: number, pageSize: number, total: number, results: any[], baseUrl: string) => ({
  count: total,
  next: page * pageSize < total ? page + 1 : null,
  previous: page > 1 ? page - 1 : null,
  results,
});

const getOrCreateStore = async (user: any) => {
  let store = await Store.findOne({ user: user._id });
  if (!store) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || user.phone;
    store = await Store.create({ user: user._id, name });
  }
  return store;
};

export const productList = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, skip } = parsePage(req);
  const filter: any = { quantity: { $gt: 0 } };
  if (req.query.store) filter.store = req.query.store;
  if (req.query.category) {
    filter.category = {
      $regex: new RegExp(String(req.query.category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    };
  }
  const [total, docs] = await Promise.all([
    Product.countDocuments(filter),
    populateProduct(Product.find(filter)).sort({ created_at: -1 }).skip(skip).limit(pageSize),
  ]);
  res.json(paginatedList(page, pageSize, total, docs.map(productSerializer), req.baseUrl));
});

export const productDetail = asyncHandler(async (req: Request, res: Response) => {
  const product = await populateProduct(Product.findById(req.params.id));
  if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
  res.json(productSerializer(product));
});

export const favoriteList = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, skip } = parsePage(req);
  const [total, docs] = await Promise.all([
    Favorite.countDocuments({ user: req.user._id }),
    Favorite.find({ user: req.user._id })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate({ path: 'product', populate: { path: 'store', select: 'name' } }),
  ]);
  res.json(paginatedList(page, pageSize, total, docs.map(favoriteSerializer), req.baseUrl));
});

export const toggleFavorite = asyncHandler(async (req: Request, res: Response) => {
  const productId = req.body.product_id;
  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, 'Mahsulot topilmadi');

  const existing = await Favorite.findOne({ user: req.user._id, product: product._id });
  if (existing) {
    await existing.deleteOne();
    return res.json({ favorited: false });
  }
  await Favorite.create({ user: req.user._id, product: product._id });
  res.status(201).json({ favorited: true });
});

export const cartGet = asyncHandler(async (req: Request, res: Response) => {
  const items = await CartItem.find({ user: req.user._id }).populate({
    path: 'product',
    populate: { path: 'store', select: 'name' },
  });

  let total = 0;
  let count = 0;
  for (const item of items) {
    total += (item.product.price || 0) * item.quantity;
    count += item.quantity;
  }
  res.json({
    items: items.map(cartItemSerializer),
    total: money(total),
    count,
  });
});

export const cartAdd = asyncHandler(async (req: Request, res: Response) => {
  const productId = req.body.product_id;
  const quantity = parseInt(req.body.quantity, 10) || 1;

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
  if (quantity < 1) throw new ApiError(400, "Miqdor noto'g'ri");
  if (product.quantity < quantity) {
    throw new ApiError(400, `Zaxirada atigi ${product.quantity} dona bor`);
  }

  let item: any = await CartItem.findOne({ user: req.user._id, product: product._id });
  if (item) {
    item.quantity += quantity;
    if (item.quantity > product.quantity) {
      throw new ApiError(400, `Zaxirada atigi ${product.quantity} dona bor`);
    }
    await item.save();
  } else {
    item = await CartItem.create({ user: req.user._id, product: product._id, quantity });
  }

  item = await CartItem.findById(item._id).populate({
    path: 'product',
    populate: { path: 'store', select: 'name' },
  });
  res.status(201).json(cartItemSerializer(item));
});

export const cartRemove = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await CartItem.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!deleted) throw new ApiError(404, 'Topilmadi');
  res.status(204).end();
});

export const checkout = asyncHandler(async (req: Request, res: Response) => {
  const session = await CartItem.startSession();
  try {
    await session.withTransaction(async () => {
      const cart = await CartItem.find({ user: req.user._id }).session(session);
      if (!cart.length) throw new ApiError(400, "Savat bo'sh");

      const groups = new Map();
      for (const item of cart) {
        const product: any = await Product.findById(item.product).session(session);
        if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
        if (item.quantity > product.quantity) {
          throw new ApiError(400, `"${product.name}" uchun zaxirada yetarli mahsulot yo'q`);
        }
        const storeId = String(product.store);
        if (!groups.has(storeId)) groups.set(storeId, []);
        groups.get(storeId).push({ cartItem: item, product });
      }

      const sales: any[] = [];
      for (const [storeId, items] of groups) {
        const store: any = await Store.findById(storeId).session(session);
        if (!store) throw new ApiError(404, "Do'kon topilmadi");
        const total = items.reduce((sum: number, i: any) => sum + i.product.price * i.cartItem.quantity, 0);

        const sale = await Sale.create([{ user: req.user._id, store: store._id, total }], { session });
        for (const item of items) {
          await SaleItem.create(
            [
              {
                sale: sale[0]._id,
                product: item.product._id,
                quantity: item.cartItem.quantity,
                unit_price: item.product.price,
                unit_cost: item.product.cost_price,
              },
            ],
            { session }
          );
          item.product.quantity -= item.cartItem.quantity;
          await item.product.save({ session });
        }
        store.balance += total;
        await store.save({ session });
        sales.push(sale[0]);
      }

      await CartItem.deleteMany({ user: req.user._id }, { session });

      const populatedSales = await Sale.find({ _id: { $in: sales.map((s) => s._id) } })
        .session(session)
        .populate('store', 'name')
        .populate({ path: 'items', populate: { path: 'product', select: 'name' } });

      const grandTotal = sales.reduce((sum: number, s: any) => sum + s.total, 0);
      res.json({
        message: 'Xarid muvaffaqiyatli amalga oshirildi',
        sales: populatedSales.map(saleSerializer),
        total: money(grandTotal),
      });
    });
  } finally {
    await session.endSession();
  }
});

export const myStoreGet = asyncHandler(async (req: Request, res: Response) => {
  const store = await getOrCreateStore(req.user).then((s) =>
    Store.findById(s._id).populate('user', 'first_name last_name')
  );
  res.json(storeSerializer(store));
});

export const myStoreUpdate = asyncHandler(async (req: Request, res: Response) => {
  let store: any = await getOrCreateStore(req.user);
  const allowed = ['name', 'description', 'category', 'phone', 'address'];
  for (const field of allowed) {
    if (field in req.body) store[field] = req.body[field];
  }
  if (req.file) store.logo = toMediaUrl(req.file);
  await store.save();
  store = await Store.findById(store._id).populate('user', 'first_name last_name');
  res.json(storeSerializer(store));
});

export const myProductList = asyncHandler(async (req: Request, res: Response) => {
  const store = await Store.findOne({ user: req.user._id });
  if (!store) return res.json([]);
  const docs = await populateProduct(Product.find({ store: store._id }).sort({ created_at: -1 }));
  res.json(docs.map(productSerializer));
});

export const myProductCreate = asyncHandler(async (req: Request, res: Response) => {
  const store = await getOrCreateStore(req.user);
  const { name, description = '', category = '', price, cost_price = 0, quantity = 0 } = req.body;
  if (!name) throw new ApiError(400, 'Mahsulot nomi talab qilinadi.');
  if (price === undefined || price === null || isNaN(Number(price))) {
    throw new ApiError(400, 'Narx talab qilinadi.');
  }
  const product = await Product.create({
    store: store._id,
    name,
    description,
    category,
    price: Number(price),
    cost_price: Number(cost_price) || 0,
    quantity: parseInt(quantity, 10) || 0,
    image: req.file ? toMediaUrl(req.file) : null,
  });
  const populated = await populateProduct(Product.findById(product._id));
  res.status(201).json(productSerializer(populated));
});

export const myProductDetail = asyncHandler(async (req: Request, res: Response) => {
  const store = await Store.findOne({ user: req.user._id });
  const product = await populateProduct(
    Product.findOne({ _id: req.params.id, store: store ? store._id : null })
  );
  if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
  res.json(productSerializer(product));
});

export const myProductUpdate = asyncHandler(async (req: Request, res: Response) => {
  const store = await Store.findOne({ user: req.user._id });
  const product: any = await Product.findOne({ _id: req.params.id, store: store ? store._id : null });
  if (!product) throw new ApiError(404, 'Mahsulot topilmadi');

  const allowed = ['name', 'description', 'category', 'price', 'cost_price', 'quantity'];
  for (const field of allowed) {
    if (field in req.body) {
      if (field === 'price' || field === 'cost_price') {
        product[field] = Number(req.body[field]);
      } else if (field === 'quantity') {
        product[field] = parseInt(req.body[field], 10) || 0;
      } else {
        product[field] = req.body[field];
      }
    }
  }
  if (req.file) product.image = toMediaUrl(req.file);
  await product.save();
  const populated = await populateProduct(Product.findById(product._id));
  res.json(productSerializer(populated));
});

export const myProductDelete = asyncHandler(async (req: Request, res: Response) => {
  const store = await Store.findOne({ user: req.user._id });
  const product = await Product.findOne({ _id: req.params.id, store: store ? store._id : null });
  if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
  await product.deleteOne();
  res.status(204).end();
});

export const statistics = asyncHandler(async (req: Request, res: Response) => {
  const store = await Store.findOne({ user: req.user._id });
  if (!store) {
    return res.json({
      store_exists: false,
      total_revenue: '0.00',
      total_expense: '0.00',
      net_profit: '0.00',
      total_units_sold: 0,
      sales_count: 0,
      product_stats: [],
      top_products: [],
      least_products: [],
      recent_sales: [],
    });
  }

  const storeProductIds = (await Product.find({ store: store._id }).select('_id')).map((p) => p._id);

  const [sales, items, products, recentSales] = await Promise.all([
    Sale.find({ store: store._id }),
    SaleItem.find({ product: { $in: storeProductIds } }),
    Product.find({ store: store._id }),
    Sale.find({ store: store._id })
      .sort({ created_at: -1 })
      .limit(10)
      .populate('store', 'name')
      .populate('user', 'first_name last_name phone')
      .populate({ path: 'items', populate: { path: 'product', select: 'name' } }),
  ]);

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const totalExpense = items.reduce((sum, i) => sum + (i.unit_cost || 0) * i.quantity, 0);
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
  const netProfit = totalRevenue - totalExpense;

  const productStats = products.map((product) => {
    const sold = items.filter((i) => String(i.product) === String(product._id));
    const qty = sold.reduce((sum, i) => sum + i.quantity, 0);
    const revenue = sold.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    return {
      product_id: String(product._id),
      name: product.name,
      quantity_sold: qty,
      revenue: money(revenue),
      units_in_stock: product.quantity,
    };
  });

  const ranked = [...productStats].sort((a, b) => b.quantity_sold - a.quantity_sold);
  const topProducts = ranked.filter((p) => p.quantity_sold > 0).slice(0, 5);
  const leastProducts = [...ranked].reverse().filter((p) => p.quantity_sold > 0).slice(0, 5);

  res.json({
    store_exists: true,
    store_name: store.name,
    balance: money(store.balance),
    total_revenue: money(totalRevenue),
    total_expense: money(totalExpense),
    net_profit: money(netProfit),
    total_units_sold: totalUnits,
    sales_count: sales.length,
    product_stats: productStats,
    top_products: topProducts,
    least_products: leastProducts,
    recent_sales: recentSales.map(saleSerializer),
  });
});
