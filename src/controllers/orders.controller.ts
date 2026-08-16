import { Request, Response } from 'express';
import {
  Order,
  OrderStatusLog,
  User,
  Staff,
  Service,
  Conversation,
  Sale,
  SaleItem,
  Product,
} from '../models';
import {
  ORDER_STATUSES,
  VALID_STATUS_TRANSITIONS,
  ACTIVE_ORDER_STATUSES,
  PAYMENT_METHODS,
} from '../config/constants';
import { ApiError, asyncHandler } from '../utils/http';
import { orderSerializer } from '../utils/serializers';
import { parsePage, paginatedResponse } from '../utils/pagination';
import {
  resolveWorkshop,
  requireWorkshop,
  requireOwnerWorkshop,
  nextQueueNumber,
  renumberQueue,
  autoAssignStaff,
  isStaffBusy,
  parseDate,
  dayRange,
} from '../utils/workshop';

const USER_FIELDS = 'phone username role avatar language theme first_name last_name';

const populateOrder = (query: any) =>
  query
    .populate('client', USER_FIELDS)
    .populate('assigned_staff', USER_FIELDS)
    .populate('service');

async function attachOrderMeta(orders: any[]) {
  const ids = orders.map((o) => o._id);
  if (!ids.length) return orders;
  const convos = await Conversation.find({ order: { $in: ids } });
  const convByOrder = new Map(convos.map((c) => [String(c.order), c]));
  for (const order of orders) {
    const conv = convByOrder.get(String(order._id));
    order.conversation_id = conv ? conv._id : null;
  }
  return orders;
}

const canViewOrder = (order: any, user: any): boolean => {
  if (user.is_staff || user.role === 'admin') return true;
  if (order.workshop && String(order.workshop._id || order.workshop) === String(user._workshop_id)) return true;
  if (user.role === 'staff' && order.assigned_staff && String(order.assigned_staff._id || order.assigned_staff) === String(user._id)) return true;
  if (user.role === 'client' && order.client && String(order.client._id || order.client) === String(user._id)) return true;
  return false;
};

const canManageOrder = (order: any, user: any): boolean => {
  if (user.is_staff || user.role === 'admin') return true;
  if (order.workshop && String(order.workshop._id || order.workshop) === String(user._workshop_id)) return true;
  if (user.role === 'client' && order.client && String(order.client._id || order.client) === String(user._id)) return true;
  return false;
};

function parseOrderPrice(value: any): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiError(400, "Narx manfiy yoki noto'g'ri bo'lishi mumkin emas");
  }
  return n;
}

// ============================== LIST ==============================

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, skip } = parsePage(req);
  const workshop = await resolveWorkshop(req.user);
  if (!workshop) {
    return res.json(paginatedResponse(page, pageSize, 0, [], req.baseUrl));
  }

  const filter: any = { workshop: workshop._id };
  if (req.user.role === 'client') filter.client = req.user._id;
  if (req.user.role === 'staff') filter.assigned_staff = req.user._id;
  if (req.query.status && (Object.values(ORDER_STATUSES) as string[]).includes(String(req.query.status))) {
    filter.status = req.query.status;
  }
  const date = parseDate(req.query.date);
  if (date) {
    const { start, end } = dayRange(date);
    filter.created_at = { $gte: start, $lte: end };
  }
  if (req.query.service) filter.service = req.query.service;

  let sort: any = { created_at: -1 };
  const queueView = String(req.query.queue) === '1';
  if (queueView) sort = { scheduled_at: 1, created_at: 1 };

  const [total, docs] = await Promise.all([
    Order.countDocuments(filter),
    populateOrder(Order.find(filter)).sort(sort).skip(skip).limit(pageSize),
  ]);

  await attachOrderMeta(docs);
  res.json(
    paginatedResponse(page, pageSize, total, docs.map(orderSerializer), req.baseUrl)
  );
});

// ============================== CREATE ==============================

export const create = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const isOwner = req.user.role === 'owner' || req.user.is_staff;

  const { service_id, service_type = '', description = '', address = '', scheduled_at, client_id } = req.body;

  let client: any = null;
  let client_name = String(req.body.client_name || '').trim();
  let client_phone = String(req.body.client_phone || '').trim();

  if (req.user.role === 'client') {
    client = req.user._id;
  } else if (client_id) {
    const user = await User.findById(client_id);
    if (!user || (user.role !== 'client' && user.role !== 'owner' && user.role !== 'staff')) {
      throw new ApiError(400, "Bunday mijoz topilmadi");
    }
    client = user._id;
  }
  if (!client && !client_name && !client_phone) {
    throw new ApiError(400, "Mijoz ma'lumotlari kerak: client_id yoki ism/telefon");
  }
  if (client && !client_name) {
    const c: any = await User.findById(client);
    if (c) client_name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.phone;
  }
  if (client && !client_phone) {
    const c: any = await User.findById(client);
    if (c) client_phone = c.phone;
  }

  let service: any = null;
  let resolvedServiceType = service_type;
  if (service_id) {
    service = await Service.findOne({ _id: service_id, workshop: workshop._id });
    if (!service) throw new ApiError(400, "Bunday xizmat turi topilmadi");
    resolvedServiceType = service.name;
  }
  if (!resolvedServiceType) {
    throw new ApiError(400, "Xizmat turi ko'rsatilishi kerak");
  }

  const when = scheduled_at ? new Date(String(scheduled_at)) : new Date();
  if (isNaN(when.getTime())) {
    throw new ApiError(400, "Rejalashtirilgan vaqt noto'g'ri");
  }

  const queueNumber = await nextQueueNumber(workshop._id);

  // Narx xizmat turidan olinadi; egasi qo'lda o'zgartirishi mumkin, mijoz o'zi narx qo'ya olmaydi
  const requestedPrice = req.body.price != null ? parseOrderPrice(req.body.price) : null;
  const price = isOwner ? (requestedPrice != null ? requestedPrice : service ? service.price : null) : service ? service.price : null;

  let assignedStaff: any = null;
  if (isOwner && req.body.assigned_staff) {
    const s = await Staff.findOne({ user: req.body.assigned_staff, workshop: workshop._id });
    if (!s) throw new ApiError(400, "Bunday xodim ustaxonada topilmadi");
    assignedStaff = req.body.assigned_staff;
  } else if (isOwner && String(req.query.auto_assign || '') !== '0') {
    const duration = service ? service.duration_minutes : 60;
    assignedStaff = await autoAssignStaff(workshop._id, null, when, duration);
  } else if (req.user.role === 'client') {
    const duration = service ? service.duration_minutes : 60;
    assignedStaff = await autoAssignStaff(workshop._id, null, when, duration);
  }

  const order = await Order.create({
    workshop: workshop._id,
    client,
    client_name,
    client_phone,
    assigned_staff: assignedStaff,
    service: service ? service._id : null,
    service_type: resolvedServiceType,
    description,
    price,
    status: assignedStaff ? ORDER_STATUSES.ASSIGNED : ORDER_STATUSES.QUEUED,
    queue_number: queueNumber,
    scheduled_at: when,
    address,
  });

  await OrderStatusLog.create({
    order: order._id,
    from_status: null,
    to_status: ORDER_STATUSES.QUEUED,
    changed_by: req.user._id,
  });
  if (assignedStaff) {
    await OrderStatusLog.create({
      order: order._id,
      from_status: ORDER_STATUSES.QUEUED,
      to_status: ORDER_STATUSES.ASSIGNED,
      changed_by: req.user._id,
    });
  }

  if (client) {
    await Conversation.findOneAndUpdate(
      { order: order._id },
      { $set: { order: order._id, client, master: workshop.owner } },
      { upsert: true, new: true }
    );
  }

  const populated = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([populated]);
  res.status(201).json(orderSerializer(populated));
});

// ============================== DETAIL ==============================

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  if (!canViewOrder(order, req.user)) {
    throw new ApiError(403, "Siz bu buyurtmani ko'ra olmaysiz");
  }
  await attachOrderMeta([order]);
  res.json(orderSerializer(order));
});

// ============================== UPDATE (owner edits) ==============================

export const update = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  if (!canManageOrder(order, req.user) || req.user.role === 'client') {
    throw new ApiError(403, "Siz bu buyurtmani tahrirlay olmaysiz");
  }

  const allowed = ['description', 'address', 'price', 'service_type', 'client_name', 'client_phone'];
  for (const field of allowed) {
    if (field in req.body) {
      if (field === 'price') order.price = parseOrderPrice(req.body.price);
      else order[field] = req.body[field];
    }
  }
  if ('service_id' in req.body && req.body.service_id) {
    const service = await Service.findOne({ _id: req.body.service_id, workshop: order.workshop });
    if (!service) throw new ApiError(400, "Bunday xizmat turi topilmadi");
    order.service = service._id;
    order.service_type = service.name;
  }
  if (req.body.scheduled_at) {
    const when = new Date(String(req.body.scheduled_at));
    if (isNaN(when.getTime())) throw new ApiError(400, "Rejalashtirilgan vaqt noto'g'ri");
    order.scheduled_at = when;
  }

  await order.save();
  const refreshed = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([refreshed]);
  res.json(orderSerializer(refreshed));
});

// ============================== ASSIGN ==============================

export const assign = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');

  const workshop = await requireOwnerWorkshop(req.user);
  if (String(order.workshop._id || order.workshop) !== String(workshop._id)) {
    throw new ApiError(403, "Bu buyurtma sizning ustaxonangizga tegishli emas");
  }

  const staffId = req.body.staff_id;
  if (!staffId) throw new ApiError(400, 'Xodim tanlanishi kerak (staff_id)');
  const staff = await Staff.findOne({ user: staffId, workshop: workshop._id });
  if (!staff) throw new ApiError(400, 'Bunday xodim ustaxonangizda topilmadi');
  if (!staff.is_available) throw new ApiError(400, 'Bu xodim hozir band (ishga kelmagan deb belgilangan)');

  if (order.scheduled_at) {
    const service = order.service ? await Service.findById(order.service) : null;
    const duration = service ? service.duration_minutes : 60;
    const busy = await isStaffBusy(workshop._id, staffId, order.scheduled_at, duration);
    if (busy) {
      throw new ApiError(400, 'Bu xodim rejalashtirilgan vaqtda allaqachon band');
    }
  }

  const oldStatus = order.status;
  order.assigned_staff = staffId;
  if (oldStatus === ORDER_STATUSES.QUEUED) {
    order.status = ORDER_STATUSES.ASSIGNED;
  }
  await order.save();

  if (oldStatus !== order.status) {
    await OrderStatusLog.create({
      order: order._id,
      from_status: oldStatus,
      to_status: order.status,
      changed_by: req.user._id,
    });
  }

  const refreshed = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([refreshed]);
  res.json(orderSerializer(refreshed));
});

// ============================== UPDATE STATUS ==============================

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');

  const workshop = await resolveWorkshop(req.user);
  const isOwner =
    (req.user.role === 'owner' &&
      workshop &&
      String(order.workshop._id || order.workshop) === String(workshop._id)) ||
    req.user.is_staff;
  const isOwnStaff =
    req.user.role === 'staff' &&
    order.assigned_staff &&
    String(order.assigned_staff._id || order.assigned_staff) === String(req.user._id);

  if (!(isOwner || isOwnStaff || req.user.is_staff)) {
    throw new ApiError(403, "Siz bu buyurtma holatini o'zgartira olmaysiz");
  }

  const newStatus = req.body.status;
  if (!(Object.values(ORDER_STATUSES) as string[]).includes(newStatus)) {
    throw new ApiError(400, "Noto'g'ri holat");
  }
  if (newStatus === ORDER_STATUSES.ASSIGNED) {
    throw new ApiError(400, "Tayinlash uchun alohida assign amalidan foydalaning");
  }
  if (!VALID_STATUS_TRANSITIONS[order.status].includes(newStatus)) {
    throw new ApiError(400, `"${order.status}" dan "${newStatus}" ga o'tish mumkin emas`);
  }

  if (newStatus === ORDER_STATUSES.IN_PROGRESS && !order.started_at) {
    order.started_at = new Date();
  }
  if (newStatus === ORDER_STATUSES.COMPLETED) {
    order.completed_at = new Date();
  }
  if (newStatus === ORDER_STATUSES.NO_SHOW) {
    order.no_show_at = new Date();
  }

  const oldStatus = order.status;
  order.status = newStatus;
  await order.save();
  await OrderStatusLog.create({
    order: order._id,
    from_status: oldStatus,
    to_status: order.status,
    changed_by: req.user._id,
  });

  if (newStatus === ORDER_STATUSES.COMPLETED) {
    const amount = order.price || 0;
    const paymentMethod = PAYMENT_METHODS.includes(req.body.payment_method) ? req.body.payment_method : 'cash';
    const sale: any = await Sale.findOneAndUpdate(
      { order: order._id },
      {
        $set: {
          workshop: order.workshop._id || order.workshop,
          order: order._id,
          staff: order.assigned_staff ? order.assigned_staff._id || order.assigned_staff : null,
          amount,
          payment_method: paymentMethod,
        },
      },
      { upsert: true, new: true }
    );
    if (!sale) {
      throw new ApiError(500, 'To\'lov yozuvini yaratishda xatolik');
    }
  }

  // Kelmagan buyurtma navbatdan chiqariladi va qolganlar qayta raqamlanadi
  if (newStatus === ORDER_STATUSES.NO_SHOW) {
    const workshopId = order.workshop._id || order.workshop;
    await renumberQueue(workshopId, order.created_at);
  }

  const refreshed = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([refreshed]);
  res.json(orderSerializer(refreshed));
});

// ============================== CANCEL ==============================

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');

  if (!canManageOrder(order, req.user)) {
    throw new ApiError(403, "Siz bu buyurtmani bekor qila olmaysiz");
  }
  if (order.status === ORDER_STATUSES.CANCELLED) {
    throw new ApiError(400, 'Buyurtma allaqachon bekor qilingan');
  }
  if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
    throw new ApiError(400, "Bu holatda buyurtmani bekor qilib bo'lmaydi");
  }

  const oldStatus = order.status;
  order.status = ORDER_STATUSES.CANCELLED;
  order.cancelled_reason = String(req.body.reason || '').trim();
  await order.save();
  await OrderStatusLog.create({
    order: order._id,
    from_status: oldStatus,
    to_status: ORDER_STATUSES.CANCELLED,
    changed_by: req.user._id,
  });

  const workshopId = order.workshop._id || order.workshop;
  await renumberQueue(workshopId, order.created_at);

  const refreshed = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([refreshed]);
  res.json(orderSerializer(refreshed));
});

// ============================== CONSUME (parts from warehouse) ==============================

export const consume = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  if (![ORDER_STATUSES.ASSIGNED, ORDER_STATUSES.IN_PROGRESS].includes(order.status)) {
    throw new ApiError(400, "Faol (tayinlangan yoki jarayondagi) buyurtma uchun mahsulot sarflash mumkin");
  }

  const isOwner =
    (req.user.role === 'owner' &&
      order.workshop &&
      String(order.workshop._id || order.workshop) === String(req.user._workshop_id)) ||
    req.user.is_staff;
  const isOwnStaff =
    req.user.role === 'staff' &&
    order.assigned_staff &&
    String(order.assigned_staff._id || order.assigned_staff) === String(req.user._id);
  if (!(isOwner || isOwnStaff)) {
    throw new ApiError(403, "Siz mahsulot sarflay olmaysiz");
  }

  const productId = req.body.product_id;
  const quantity = parseInt(req.body.quantity, 10);
  if (!productId) throw new ApiError(400, 'Mahsulot tanlanishi kerak');
  if (!quantity || quantity < 1) throw new ApiError(400, "Miqdor noto'g'ri");

  const workshopId = order.workshop._id || order.workshop;
  const product = await Product.findById(productId);
  if (!product || String(product.workshop) !== String(workshopId)) {
    throw new ApiError(400, 'Mahsulot ustaxonada topilmadi');
  }
  if (product.quantity < quantity) {
    throw new ApiError(400, `Zaxirada atigi ${product.quantity} ${product.unit} bor`);
  }

  let sale: any = await Sale.findOne({ order: order._id });
  if (!sale) {
    sale = await Sale.create({
      workshop: workshopId,
      order: order._id,
      staff: order.assigned_staff ? order.assigned_staff._id || order.assigned_staff : null,
      amount: 0,
    });
  }

  await SaleItem.create({
    sale: sale._id,
    product: product._id,
    quantity,
    unit_price: product.price,
    unit_cost: product.cost_price,
  });
  product.quantity -= quantity;
  await product.save();

  const refreshed = await populateOrder(Order.findById(order._id));
  await attachOrderMeta([refreshed]);
  res.json(orderSerializer(refreshed));
});

// ============================== LOGS ==============================

export const logs = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
  if (!canViewOrder(order, req.user)) {
    throw new ApiError(403, "Siz bu buyurtma tarixini ko'ra olmaysiz");
  }
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
      changed_by_name: log.changed_by && (log.changed_by as any)._doc
        ? [log.changed_by.first_name, log.changed_by.last_name].filter(Boolean).join(' ').trim() || log.changed_by.phone
        : null,
      created_at: log.created_at,
    }))
  );
});

// ============================== QUEUE (today) ==============================

export const queue = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const date = parseDate(req.query.date) || new Date();
  const { start, end } = dayRange(date);

  const orders = await populateOrder(
    Order.find({
      workshop: workshop._id,
      status: { $in: ACTIVE_ORDER_STATUSES },
      created_at: { $gte: start, $lte: end },
    }).sort({ scheduled_at: 1, queue_number: 1 })
  );

  await attachOrderMeta(orders);
  res.json({
    date: date.toISOString().slice(0, 10),
    queue: orders.map(orderSerializer),
  });
});

export { populateOrder, attachOrderMeta };
