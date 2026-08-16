import { Request, Response } from 'express';
import { Order, Staff, Product, Sale, Service } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import { orderSerializer, serviceSerializer, money } from '../utils/serializers';
import { populateOrder, attachOrderMeta, cancel as cancelOrder } from './orders.controller';
import { myToday as staffMyToday } from './staff.controller';
import { requireWorkshop, dayRange } from '../utils/workshop';
import { ACTIVE_ORDER_STATUSES, ORDER_STATUSES } from '../config/constants';

const clientActiveFilter = async (req: Request) => {
  const workshop = await requireWorkshop(req.user);
  return {
    workshop: workshop._id,
    client: req.user._id,
    status: { $in: ACTIVE_ORDER_STATUSES },
  };
};

// Bot uchun xizmatlar ro'yxati (faol)
export const services = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(null);
  const services = await Service.find({ workshop: workshop._id, is_active: true }).sort({ price: 1 });
  res.json({ services: services.map(serviceSerializer) });
});

// Mijozning faol buyurtmasi
export const activeOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findOne(await clientActiveFilter(req)).sort({ created_at: -1 }));
  if (!order) {
    return res.status(404).json({ detail: 'Faol buyurtma topilmadi' });
  }
  await attachOrderMeta([order]);
  res.json(orderSerializer(order));
});

// Faol buyurtmani bekor qilish (ordersController.cancel orqali)
export const cancelActiveOrder = asyncHandler(async (req: Request, res: Response, next: any) => {
  const order = await Order.findOne(await clientActiveFilter(req)).sort({ created_at: -1 });
  if (!order) {
    throw new ApiError(404, 'Bekor qiladigan faol buyurtma topilmadi');
  }
  (req as any).params = { id: String(order._id) };
  req.body = { ...req.body, reason: 'Telegram bot orqali bekor qilindi' };
  return cancelOrder(req, res, next);
});

// Xodimning bugungi vazifalari
export const staffToday = asyncHandler(async (req: Request, res: Response, next: any) => staffMyToday(req, res, next));

// Ega uchun bugungi hisobot + kam qolgan ombor
export const ownerReport = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const isOwner = req.user.role === 'owner' || req.user.is_staff;
  const { start, end } = dayRange(new Date());

  const [orders, sales, staffList, products] = await Promise.all([
    Order.find({ workshop: workshop._id, created_at: { $gte: start, $lte: end } }),
    Sale.find({ workshop: workshop._id, created_at: { $gte: start, $lte: end } }),
    isOwner ? Staff.find({ workshop: workshop._id }) : [],
    Product.find({ workshop: workshop._id }),
  ]);

  const revenue = sales.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
  const lowStock = products
    .filter((p: any) => p.min_threshold > 0 && p.quantity <= p.min_threshold)
    .map((p: any) => ({ name: p.name, quantity: p.quantity, threshold: p.min_threshold }));

  res.json({
    revenue: money(revenue),
    ordersCount: orders.length,
    completedCount: orders.filter((o: any) => o.status === ORDER_STATUSES.COMPLETED).length,
    busyStaff: staffList.filter((s: any) => !s.is_available).length,
    freeStaff: staffList.filter((s: any) => s.is_available).length,
    lowStock,
  });
});
