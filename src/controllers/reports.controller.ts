import { Request, Response } from 'express';
import { Order, Sale, SaleItem, Staff } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import { money } from '../utils/serializers';
import { requireOwnerWorkshop, parseDate, dayRange, toDateKey } from '../utils/workshop';
import { ORDER_STATUSES } from '../config/constants';

export const report = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireOwnerWorkshop(req.user);

  const from = parseDate(req.query.from) || new Date();
  const to = parseDate(req.query.to) || new Date();
  if (from.getTime() > to.getTime()) {
    throw new ApiError(400, "'from' sanasi 'to' dan oldin bo'lishi kerak");
  }
  const { start } = dayRange(from);
  const { end } = dayRange(to);

  const sales = await Sale.find({ workshop: workshop._id, created_at: { $gte: start, $lte: end } });
  const saleIds = sales.map((s) => s._id);
  const [orders, saleItems] = await Promise.all([
    Order.find({ workshop: workshop._id, created_at: { $gte: start, $lte: end } }),
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

  res.json({
    from: toDateKey(from),
    to: toDateKey(to),
    revenue: money(revenue),
    expense: money(expense),
    net_profit: money(revenue - expense),
    orders_completed: completed.length,
    orders_cancelled: byStatus[ORDER_STATUSES.CANCELLED] || 0,
    orders_no_show: byStatus[ORDER_STATUSES.NO_SHOW] || 0,
    total_orders: orders.length,
    by_status: byStatus,
    by_service: byService,
    by_staff: byStaff,
    daily,
  });
});
