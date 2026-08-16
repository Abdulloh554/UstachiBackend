import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, Staff, Service, Order, Sale, Product } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import {
  workshopSerializer,
  staffSerializer,
  serviceSerializer,
  productSerializer,
  orderSerializer,
  money,
} from '../utils/serializers';
import { populateOrder, attachOrderMeta } from './orders.controller';
import {
  requireWorkshop,
  requireOwnerWorkshop,
  parseDate,
  dayRange,
  reassignPendingOrders,
  toDateKey,
} from '../utils/workshop';
import { ORDER_STATUSES, ACTIVE_ORDER_STATUSES } from '../config/constants';
import { toMediaUrl } from '../middleware/upload';

const PHONE_REGEX = /^\+998\d{9}$/;

// ============================== WORKSHOP ==============================

export const myWorkshop = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const populated = await workshop.populate('owner', 'first_name last_name phone');
  res.json(workshopSerializer(populated));
});

export const updateMyWorkshop = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const allowed = ['name', 'address', 'phone', 'work_schedule'];
  for (const field of allowed) {
    if (field in req.body) workshop[field] = req.body[field];
  }
  await workshop.save();
  const populated = await workshop.populate('owner', 'first_name last_name phone');
  res.json(workshopSerializer(populated));
});

// ============================== DASHBOARD ("bugun") ==============================

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const isOwner = req.user.role === 'owner' || req.user.is_staff;
  const date = parseDate(req.query.date) || new Date();
  const { start, end } = dayRange(date);

  const [orders, sales, products, staffList] = await Promise.all([
    Order.find({ workshop: workshop._id, created_at: { $gte: start, $lte: end } }),
    Sale.find({ workshop: workshop._id, created_at: { $gte: start, $lte: end } }),
    Product.find({ workshop: workshop._id }),
    isOwner ? Staff.find({ workshop: workshop._id }).populate('user', 'first_name last_name phone') : [],
  ]);

  const byStatus: Record<string, number> = {};
  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] || 0) + 1;
  }
  const revenue = sales.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);

  const lowStock = products
    .filter((p: any) => p.min_threshold > 0 && p.quantity <= p.min_threshold)
    .map(productSerializer);

  const activeOrders = await populateOrder(
    Order.find({
      workshop: workshop._id,
      status: { $in: ACTIVE_ORDER_STATUSES },
      created_at: { $gte: start, $lte: end },
    }).sort({ scheduled_at: 1, queue_number: 1 })
  );
  await attachOrderMeta(activeOrders);

  let staffOverview: any[] = [];
  if (isOwner) {
    const staffCounts = await Promise.all(
      staffList.map(async (s: any) => {
        const userId = s.user._id;
        const [active, completed, staffSales] = await Promise.all([
          Order.countDocuments({
            workshop: workshop._id,
            assigned_staff: userId,
            status: { $in: ACTIVE_ORDER_STATUSES },
            created_at: { $gte: start, $lte: end },
          }),
          Order.countDocuments({
            workshop: workshop._id,
            assigned_staff: userId,
            status: ORDER_STATUSES.COMPLETED,
            created_at: { $gte: start, $lte: end },
          }),
          Sale.find({ workshop: workshop._id, staff: userId, created_at: { $gte: start, $lte: end } }),
        ]);
        const rev = staffSales.reduce((sum: number, x: any) => sum + (x.amount || 0), 0);
        return {
          id: String(s._id),
          staff_name: s.user
            ? [s.user.first_name, s.user.last_name].filter(Boolean).join(' ').trim() || s.user.phone
            : '',
          phone: s.user ? s.user.phone : '',
          is_available: s.is_available,
          active_orders: active,
          completed_today: completed,
          revenue_today: money(rev),
        };
      })
    );
    staffOverview = staffCounts;
  }

  res.json({
    date: toDateKey(date),
    workshop: workshopSerializer(workshop),
    today: {
      total_orders: orders.length,
      queued: byStatus[ORDER_STATUSES.QUEUED] || 0,
      assigned: byStatus[ORDER_STATUSES.ASSIGNED] || 0,
      in_progress: byStatus[ORDER_STATUSES.IN_PROGRESS] || 0,
      completed: byStatus[ORDER_STATUSES.COMPLETED] || 0,
      no_show: byStatus[ORDER_STATUSES.NO_SHOW] || 0,
      cancelled: byStatus[ORDER_STATUSES.CANCELLED] || 0,
      revenue: money(revenue),
    },
    queue: activeOrders.map(orderSerializer),
    staff: staffOverview,
    low_stock: lowStock,
  });
});

// ============================== STAFF MANAGEMENT ==============================

export const staffList = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const docs = await Staff.find({ workshop: workshop._id }).populate('user', 'first_name last_name phone');
  res.json(docs.map(staffSerializer));
});

export const staffCreate = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const { phone, password, first_name = '', last_name = '', specializations = [], experience_years = 0 } = req.body;

  if (!PHONE_REGEX.test(String(phone || ''))) {
    throw new ApiError(400, 'Telefon raqam formati: +998 XX XXX XX XX (masalan +998901234567)');
  }
  if (!password || String(password).length < 6) {
    throw new ApiError(400, "Parol kamida 6 belgidan iborat bo'lishi kerak.");
  }
  const existing = await User.findOne({ phone });
  if (existing) {
    throw new ApiError(400, "Bu telefon raqam allaqachon ro'yxatdan o'tgan.");
  }

  const hashed = await bcrypt.hash(String(password), 10);
  const user = await User.create({
    phone: String(phone),
    username: String(phone),
    first_name,
    last_name,
    role: 'staff',
    password: hashed,
  });

  const staff = await Staff.create({
    user: user._id,
    workshop: workshop._id,
    specializations: Array.isArray(specializations) ? specializations.map(String) : [],
    experience_years: parseInt(experience_years, 10) || 0,
  });

  const populated = await Staff.findById(staff._id).populate('user', 'first_name last_name phone');
  res.status(201).json(staffSerializer(populated));
});

export const staffUpdate = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const staff = await Staff.findOne({ _id: req.params.id, workshop: workshop._id }).populate('user');
  if (!staff) throw new ApiError(404, 'Xodim topilmadi');

  if ('is_available' in req.body) {
    const wasAvailable = staff.is_available;
    staff.is_available = Boolean(req.body.is_available);
    if (wasAvailable && !staff.is_available) {
      await reassignPendingOrders(workshop._id, staff.user._id);
    }
  }
  if ('specializations' in req.body && Array.isArray(req.body.specializations)) {
    staff.specializations = req.body.specializations.map(String);
  }
  if ('experience_years' in req.body) {
    staff.experience_years = parseInt(req.body.experience_years, 10) || 0;
  }
  await staff.save();

  const user: any = staff.user;
  if (user) {
    const allowed = ['first_name', 'last_name'];
    for (const field of allowed) {
      if (field in req.body) user[field] = req.body[field];
    }
    if ('password' in req.body && String(req.body.password).length >= 6) {
      user.password = await bcrypt.hash(String(req.body.password), 10);
    }
    await user.save();
  }

  const refreshed = await Staff.findById(staff._id).populate('user', 'first_name last_name phone');
  res.json(staffSerializer(refreshed));
});

export const staffRemove = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const staff = await Staff.findOne({ _id: req.params.id, workshop: workshop._id });
  if (!staff) throw new ApiError(404, 'Xodim topilmadi');

  await reassignPendingOrders(workshop._id, staff.user);
  await Staff.deleteOne({ _id: staff._id });
  res.status(204).end();
});

// ============================== SERVICES ==============================

export const serviceList = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const docs = await Service.find({ workshop: workshop._id }).sort({ created_at: 1 });
  res.json(docs.map(serviceSerializer));
});

export const serviceCreate = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const name = String(req.body.name || '').trim();
  const price = Number(req.body.price);
  if (!name) throw new ApiError(400, 'Xizmat nomi talab qilinadi');
  if (isNaN(price) || price < 0) throw new ApiError(400, "Xizmat narxi noto'g'ri");

  const service = await Service.create({
    workshop: workshop._id,
    name,
    price,
    duration_minutes: parseInt(req.body.duration_minutes, 10) || 60,
    is_active: req.body.is_active !== false,
  });
  res.status(201).json(serviceSerializer(service));
});

export const serviceUpdate = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const service = await Service.findOne({ _id: req.params.id, workshop: workshop._id });
  if (!service) throw new ApiError(404, 'Xizmat topilmadi');

  if ('name' in req.body) service.name = String(req.body.name).trim() || service.name;
  if ('price' in req.body) {
    const price = Number(req.body.price);
    if (isNaN(price) || price < 0) throw new ApiError(400, "Xizmat narxi noto'g'ri");
    service.price = price;
  }
  if ('duration_minutes' in req.body) service.duration_minutes = parseInt(req.body.duration_minutes, 10) || 60;
  if ('is_active' in req.body) service.is_active = Boolean(req.body.is_active);
  await service.save();
  res.json(serviceSerializer(service));
});

export const serviceRemove = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const service = await Service.findOne({ _id: req.params.id, workshop: workshop._id });
  if (!service) throw new ApiError(404, 'Xizmat topilmadi');
  await service.deleteOne();
  res.status(204).end();
});

// ============================== INVENTORY ==============================

export const inventoryList = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const docs = await Product.find({ workshop: workshop._id }).sort({ created_at: -1 });
  res.json(docs.map(productSerializer));
});

export const inventoryCreate = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const { name, description = '', category = '', price, cost_price = 0, quantity = 0, min_threshold = 0, unit = 'dona' } = req.body;
  if (!name) throw new ApiError(400, 'Mahsulot nomi talab qilinadi');
  if (price === undefined || price === null || isNaN(Number(price))) {
    throw new ApiError(400, 'Narx talab qilinadi');
  }
  const product = await Product.create({
    workshop: workshop._id,
    name,
    description,
    category,
    price: Number(price),
    cost_price: Number(cost_price) || 0,
    quantity: parseInt(quantity, 10) || 0,
    min_threshold: parseInt(min_threshold, 10) || 0,
    unit: String(unit),
    image: req.file ? toMediaUrl(req.file) : null,
  });
  res.status(201).json(productSerializer(product));
});

export const inventoryUpdate = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const product: any = await Product.findOne({ _id: req.params.id, workshop: workshop._id });
  if (!product) throw new ApiError(404, 'Mahsulot topilmadi');

  const allowed = ['name', 'description', 'category', 'price', 'cost_price', 'quantity', 'min_threshold', 'unit'];
  for (const field of allowed) {
    if (field in req.body) {
      if (field === 'price' || field === 'cost_price') product[field] = Number(req.body[field]);
      else if (field === 'quantity' || field === 'min_threshold') product[field] = parseInt(req.body[field], 10) || 0;
      else product[field] = req.body[field];
    }
  }
  if (req.file) product.image = toMediaUrl(req.file);
  await product.save();
  res.json(productSerializer(product));
});

export const inventoryRemove = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);
  const product = await Product.findOne({ _id: req.params.id, workshop: workshop._id });
  if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
  await product.deleteOne();
  res.status(204).end();
});

// ============================== PUBLIC (mijoz uchun) ==============================

export const publicWorkshop = asyncHandler(async (req: Request, res: Response) => {
  const workshop: any = await requireWorkshop(null);
  const populated = await workshop.populate('owner', 'first_name last_name phone');
  const services = await Service.find({ workshop: workshop._id, is_active: true }).sort({ price: 1 });
  res.json({
    workshop: workshopSerializer(populated),
    services: services.map(serviceSerializer),
  });
});
