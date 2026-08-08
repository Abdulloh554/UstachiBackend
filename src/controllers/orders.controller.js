const { Order, OrderStatusLog, MasterProfile, Review, Conversation } = require('../models');
const { ORDER_STATUSES, VALID_STATUS_TRANSITIONS, MASTER_CONSTANTS } = require('../config/constants');
const { ApiError, asyncHandler } = require('../utils/http');
const { orderSerializer, masterWorksSerializer } = require('../utils/serializers');
const { parsePage, paginatedResponse } = require('../utils/pagination');

const USER_FIELDS = 'phone username role avatar language theme location_lat location_lng first_name last_name';

const populateOrder = (query) =>
  query
    .populate('client', USER_FIELDS)
    .populate('master', USER_FIELDS)
    .populate('profession');

async function attachOrderMeta(orders, currentUser) {
  const ids = orders.map((o) => o._id);
  if (!ids.length) return orders;

  const reviews = await Review.find({
    order: { $in: ids },
    client: currentUser ? currentUser._id : null,
  });
  const reviewByOrder = new Map(reviews.map((r) => [String(r.order), r]));

  const convos = await Conversation.find({ order: { $in: ids } });
  const convByOrder = new Map(convos.map((c) => [String(c.order), c]));

  for (const order of orders) {
    order._my_review = reviewByOrder.get(String(order._id)) || null;
    const conv = convByOrder.get(String(order._id));
    order.conversation_id = conv ? conv._id : null;
  }
  return orders;
}

const list = asyncHandler(async (req, res) => {
  const { page, pageSize, skip } = parsePage(req);
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.profession) filter.profession = req.query.profession;

  if (req.user.role === 'client') {
    filter.client = req.user._id;
  }

  if (req.query.search) {
    const re = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: re }, { description: re }, { address: re }];
  }

  let sort = { created_at: -1 };
  if (req.query.ordering) {
    const dir = req.query.ordering.startsWith('-') ? -1 : 1;
    const field = req.query.ordering.replace(/^-/, '');
    if (field === 'created_at' || field === 'price') sort = { [field]: dir };
  }

  const [total, docs] = await Promise.all([
    Order.countDocuments(filter),
    populateOrder(Order.find(filter)).sort(sort).skip(skip).limit(pageSize),
  ]);

  res.json(paginatedResponse(page, pageSize, total, docs, `${req.baseUrl}`));
});

const create = asyncHandler(async (req, res) => {
  const { title, description, profession, location_lat, location_lng, address = '', price } = req.body;

  if (!title || !description) {
    throw new ApiError(400, 'Sarlavha va tavsif talab qilinadi.');
  }
  if (location_lat === undefined || location_lat === null || location_lng === undefined || location_lng === null) {
    throw new ApiError(400, 'Joylashuv koordinatalari talab qilinadi.');
  }

  const order = await Order.create({
    client: req.user._id,
    title,
    description,
    profession: profession || null,
    location_lat,
    location_lng,
    address,
    price: price === '' || price === null ? null : Number(price),
  });

  await OrderStatusLog.create({
    order: order._id,
    from_status: null,
    to_status: ORDER_STATUSES.NEW,
    changed_by: req.user._id,
  });

  const populated = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([populated], req.user);
  res.status(201).json(orderSerializer(populated, req.user));
});

const detail = asyncHandler(async (req, res) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  await attachOrderMeta([order], req.user);
  res.json(orderSerializer(order, req.user));
});

const canManage = (order, user) => {
  if (user.is_staff || user.role === 'admin') return true;
  return String(order.client._id || order.client) === String(user._id);
};

const update = asyncHandler(async (req, res) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  if (!canManage(order, req.user)) {
    throw new ApiError(403, 'Siz bu buyurtmani tahrirlay olmaysiz');
  }
  const allowed = ['title', 'description', 'profession', 'location_lat', 'location_lng', 'address', 'price'];
  for (const field of allowed) {
    if (field in req.body) {
      if (field === 'price') {
        order.price = req.body.price === '' || req.body.price === null ? null : Number(req.body.price);
      } else if (field === 'profession') {
        order.profession = req.body.profession || null;
      } else {
        order[field] = req.body[field];
      }
    }
  }
  await order.save();
  const refreshed = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([refreshed], req.user);
  res.json(orderSerializer(refreshed, req.user));
});

const remove = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  if (!canManage(order, req.user)) {
    throw new ApiError(403, 'Siz bu buyurtmani o\'chira olmaysiz');
  }
  await order.deleteOne();
  res.status(204).end();
});

const accept = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');

  if (order.status !== ORDER_STATUSES.NEW) {
    throw new ApiError(400, 'Bu buyurtma allaqachon qabul qilingan');
  }

  const profile = await MasterProfile.findOne({ user: req.user._id });
  if (!profile) {
    throw new ApiError(400, 'Master profili topilmadi');
  }

  const price = MASTER_CONSTANTS.ORDER_ACCEPT_PRICE;
  if (profile.balance < price) {
    throw new ApiError(
      400,
      `Balansda yetarli mablag' yo'q. Elon qabul qilish narxi ${price} so'm.`
    );
  }

  const session = await Order.startSession();
  try {
    await session.withTransaction(async () => {
      profile.balance = profile.balance - price;
      await profile.save();
      order.status = ORDER_STATUSES.ACCEPTED;
      order.master = req.user._id;
      await order.save();
      await OrderStatusLog.create({
        order: order._id,
        from_status: ORDER_STATUSES.NEW,
        to_status: ORDER_STATUSES.ACCEPTED,
        changed_by: req.user._id,
      });
    });
  } finally {
    await session.endSession();
  }

  await Conversation.findOneAndUpdate(
    { order: order._id },
    { $setOnInsert: { order: order._id, client: order.client, master: req.user._id } },
    { upsert: true, new: true }
  );

  const populated = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([populated], req.user);
  res.json(orderSerializer(populated, req.user));
});

const cancel = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');

  const isClient = String(order.client) === String(req.user._id);
  const isMaster = order.master && String(order.master) === String(req.user._id);
  const admin = req.user.is_staff || req.user.role === 'admin';
  if (!(isClient || isMaster || admin)) {
    throw new ApiError(403, 'Siz bu buyurtmani bekor qila olmaysiz');
  }
  if (order.status === ORDER_STATUSES.CANCELLED) {
    throw new ApiError(400, 'Buyurtma allaqachon bekor qilingan');
  }

  const oldStatus = order.status;
  order.status = ORDER_STATUSES.CANCELLED;
  await order.save();
  await OrderStatusLog.create({
    order: order._id,
    from_status: oldStatus,
    to_status: ORDER_STATUSES.CANCELLED,
    changed_by: req.user._id,
  });

  const populated = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([populated], req.user);
  res.json(orderSerializer(populated, req.user));
});

const updateStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  if (!order.master || String(order.master) !== String(req.user._id)) {
    throw new ApiError(403, 'Siz bu buyurtmani boshqara olmaysiz');
  }

  const newStatus = req.body.status;
  if (!Object.values(ORDER_STATUSES).includes(newStatus)) {
    throw new ApiError(400, 'Noto\'g\'ri holat');
  }
  if (!VALID_STATUS_TRANSITIONS[order.status]) {
    throw new ApiError(400, 'Holatni o\'zgartirib bo\'lmaydi');
  }
  if (!VALID_STATUS_TRANSITIONS[order.status].includes(newStatus)) {
    throw new ApiError(400, 'Noto\'g\'ri holat o\'tishi');
  }

  const oldStatus = order.status;
  order.status = newStatus;

  if (newStatus === ORDER_STATUSES.FAILED) {
    order.master = null;
    order.status = ORDER_STATUSES.NEW;
  }

  await order.save();
  await OrderStatusLog.create({
    order: order._id,
    from_status: oldStatus,
    to_status: order.status,
    changed_by: req.user._id,
  });

  const populated = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([populated], req.user);
  res.json(orderSerializer(populated, req.user));
});

const logs = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  const list = await OrderStatusLog.find({ order: order._id })
    .sort({ created_at: 1 })
    .populate('changed_by', USER_FIELDS);
  res.json(
    list.map((log) => ({
      id: String(log._id),
      order: String(log.order),
      from_status: log.from_status,
      to_status: log.to_status,
      changed_by: log.changed_by ? String(log.changed_by._id) : null,
      created_at: log.created_at,
    }))
  );
});

module.exports = { list, create, detail, update, remove, accept, cancel, updateStatus, logs, populateOrder, attachOrderMeta, masterWorksSerializer };
