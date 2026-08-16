import { Request, Response } from 'express';
import { Order, Sale, SaleItem, Staff, Product } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import { money } from '../utils/serializers';
import { requireOwnerWorkshop, parseDate, dayRange, toDateKey } from '../utils/workshop';
import { ORDER_STATUSES } from '../config/constants';
import { generateReportSummary } from '../services/ai/generateReportSummary.service';

// Kunlik hisobotning raqamli qismini hisoblaydi (AI xulosasiz).
async function buildDailyReport(workshopId: any, from: Date, to: Date) {
  const { start } = dayRange(from);
  const { end } = dayRange(to);

  const sales = await Sale.find({ workshop: workshopId, created_at: { $gte: start, $lte: end } });
  const saleIds = sales.map((s) => s._id);
  const [orders, saleItems] = await Promise.all([
    Order.find({ workshop: workshopId, created_at: { $gte: start, $lte: end } }),
    SaleItem.find({ sale: { $in: saleIds } }).populate('product', 'name'),
  ]);

  const revenue = sales.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
  const expense = saleItems.reduce((sum: number, i: any) => sum + (i.unit_cost || 0) * i.quantity, 0);

  const byStatus: Record<string, number> = {};
  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] || 0) + 1;
  }

  const completed = orders.filter((o) => o.status === ORDER_STATUSES.COMPLETED);

  // Xizmat turi bo'yicha
  const byServiceMap = new Map<string, { service_id: string | null; name: string; count: number; revenue: number }>();
  for (const order of completed) {
    const name = order.service_type || 'Boshqa';
    const entry = byServiceMap.get(name) || { service_id: order.service ? String(order.service) : null, name, count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += order.price || 0;
    byServiceMap.set(name, entry);
  }
  const byService = Array.from(byServiceMap.values()).sort((a, b) => b.revenue - a.revenue);

  // Xodim bo'yicha
  const staffIds = Array.from(new Set(sales.map((s: any) => (s.staff ? String(s.staff) : null)).filter(Boolean)));
  const staffDocs = await Staff.find({ user: { $in: staffIds } }).populate('user', 'first_name last_name phone');
  const staffNameById = new Map<string, string>();
  for (const s of staffDocs as any[]) {
    staffNameById.set(
      String(s.user._id),
      [s.user.first_name, s.user.last_name].filter(Boolean).join(' ').trim() || s.user.phone
    );
  }
  const byStaffMap = new Map<string, { staff_id: string | null; staff_name: string; completed: number; revenue: number }>();
  for (const order of completed) {
    if (!order.assigned_staff) continue;
    const id = String(order.assigned_staff._id || order.assigned_staff);
    const entry = byStaffMap.get(id) || { staff_id: id, staff_name: staffNameById.get(id) || 'Noma\'lum', completed: 0, revenue: 0 };
    entry.completed += 1;
    entry.revenue += order.price || 0;
    byStaffMap.set(id, entry);
  }
  const byStaff = Array.from(byStaffMap.values()).sort((a, b) => b.revenue - a.revenue);

  // Kun bo'yicha taqsimot
  const dailyMap = new Map<string, { date: string; revenue: number; orders: number }>();
  for (const sale of sales) {
    const key = toDateKey(sale.created_at);
    const entry = dailyMap.get(key) || { date: key, revenue: 0, orders: 0 };
    entry.revenue += sale.amount || 0;
    dailyMap.set(key, entry);
  }
  for (const order of orders) {
    const key = toDateKey(order.created_at);
    const entry = dailyMap.get(key) || { date: key, revenue: 0, orders: 0 };
    entry.orders += 1;
    dailyMap.set(key, entry);
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    from: toDateKey(from),
    to: toDateKey(to),
    revenue,
    expense,
    orders,
    completedCount: completed.length,
    byStatus,
    byService,
    byStaff,
    daily,
  };
}

export const report = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);

  const from = parseDate(req.query.from) || new Date();
  const to = parseDate(req.query.to) || new Date();
  if (from.getTime() > to.getTime()) {
    throw new ApiError(400, "'from' sanasi 'to' dan oldin bo'lishi kerak");
  }

  const data = await buildDailyReport(workshop._id, from, to);

  res.json({
    from: data.from,
    to: data.to,
    revenue: money(data.revenue),
    expense: money(data.expense),
    net_profit: money(data.revenue - data.expense),
    orders_completed: data.completedCount,
    orders_cancelled: data.byStatus[ORDER_STATUSES.CANCELLED] || 0,
    orders_no_show: data.byStatus[ORDER_STATUSES.NO_SHOW] || 0,
    total_orders: data.orders.length,
    by_status: data.byStatus,
    by_service: data.byService,
    by_staff: data.byStaff,
    daily: data.daily,
  });
});

// AI xulosa: raqamli hisobotga inson tilidagi xulosa + tavsiya qo'shadi.
// Claude ishlamay qolsa ai_summary: null qaytadi — frontend raqamli hisobotni xulosasiz ko'rsatadi.
export const aiSummary = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);

  const from = parseDate(req.body.from) || new Date();
  const to = parseDate(req.body.to) || new Date();
  if (from.getTime() > to.getTime()) {
    throw new ApiError(400, "'from' sanasi 'to' dan oldin bo'lishi kerak");
  }

  const data = await buildDailyReport(workshop._id, from, to);

  const [staffList, products] = await Promise.all([
    Staff.find({ workshop: workshop._id }),
    Product.find({ workshop: workshop._id }),
  ]);
  const busyStaff = staffList.filter((s: any) => !s.is_available).length;
  const freeStaff = staffList.filter((s: any) => s.is_available).length;
  const lowStock = products
    .filter((p: any) => p.min_threshold > 0 && p.quantity <= p.min_threshold)
    .map((p: any) => ({ name: p.name, quantity: p.quantity, threshold: p.min_threshold }));

  const summary = await generateReportSummary({
    date: data.from === data.to ? data.from : `${data.from} — ${data.to}`,
    revenue: data.revenue,
    ordersCount: data.orders.length,
    completedCount: data.completedCount,
    cancelledCount: data.byStatus[ORDER_STATUSES.CANCELLED] || 0,
    noShowCount: data.byStatus[ORDER_STATUSES.NO_SHOW] || 0,
    busyStaff,
    freeStaff,
    lowStock,
  });

  res.json({ ai_summary: summary });
});
