import { Request, Response } from 'express';
import { Staff, Order, Sale } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import { staffSerializer, orderSerializer, money } from '../utils/serializers';
import { populateOrder, attachOrderMeta } from './orders.controller';
import { requireWorkshop, parseDate, dayRange, reassignPendingOrders } from '../utils/workshop';
import { ORDER_STATUSES, ACTIVE_ORDER_STATUSES } from '../config/constants';

const getMyStaffOrThrow = async (userId: any) => {
  const staff = await Staff.findOne({ user: userId }).populate('user', 'first_name last_name phone');
  if (!staff) {
    throw new ApiError(403, "Siz ushbu ustaxonaning xodimi emassiz");
  }
  return staff;
};

export const myProfile = asyncHandler(async (req: Request, res: Response) => {
  const staff = await getMyStaffOrThrow(req.user._id);
  res.json(staffSerializer(staff));
});

export const updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const staff = await getMyStaffOrThrow(req.user._id);

  if ('is_available' in req.body) {
    const wasAvailable = staff.is_available;
    staff.is_available = Boolean(req.body.is_available);

    // Xodim band deb belgilansa (ishga kelmadi, kasal), uning kutilayotgan
    // buyurtmalari boshqa bo'sh xodimga qayta tayinlanadi.
    if (wasAvailable && !staff.is_available) {
      await reassignPendingOrders(staff.workshop, req.user._id);
    }
  }
  if ('specializations' in req.body && Array.isArray(req.body.specializations)) {
    staff.specializations = req.body.specializations.map(String);
  }
  if ('experience_years' in req.body) {
    staff.experience_years = parseInt(req.body.experience_years, 10) || 0;
  }

  await staff.save();
  const refreshed = await Staff.findById(staff._id).populate('user', 'first_name last_name phone');
  res.json(staffSerializer(refreshed));
});

export const myOrders = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const filter: any = { workshop: workshop._id, assigned_staff: req.user._id };

  if (req.query.status && (Object.values(ORDER_STATUSES) as string[]).includes(String(req.query.status))) {
    filter.status = req.query.status;
  }
  const date = parseDate(req.query.date);
  if (date) {
    const { start, end } = dayRange(date);
    filter.created_at = { $gte: start, $lte: end };
  }

  const orders = await populateOrder(Order.find(filter).sort({ scheduled_at: 1, created_at: 1 }));
  await attachOrderMeta(orders);
  res.json(orders.map(orderSerializer));
});

// Staff bosh ekrani: "bugun menda nima bor"
export const myToday = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const date = parseDate(req.query.date) || new Date();
  const { start, end } = dayRange(date);

  const [active, allToday, sales] = await Promise.all([
    Order.find({
      workshop: workshop._id,
      assigned_staff: req.user._id,
      status: { $in: ACTIVE_ORDER_STATUSES },
      created_at: { $gte: start, $lte: end },
    }).sort({ scheduled_at: 1, queue_number: 1 }),
    Order.find({
      workshop: workshop._id,
      assigned_staff: req.user._id,
      created_at: { $gte: start, $lte: end },
    }),
    Sale.find({ workshop: workshop._id, staff: req.user._id, created_at: { $gte: start, $lte: end } }),
  ]);

  const revenue = sales.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
  const byStatus: Record<string, number> = {};
  for (const order of allToday) {
    byStatus[order.status] = (byStatus[order.status] || 0) + 1;
  }

  const populated = await populateOrder(Order.find({ _id: { $in: active.map((o) => o._id) } }));
  await attachOrderMeta(populated);

  res.json({
    date: date.toISOString().slice(0, 10),
    active_count: active.length,
    completed_today: byStatus[ORDER_STATUSES.COMPLETED] || 0,
    no_show_today: byStatus[ORDER_STATUSES.NO_SHOW] || 0,
    revenue_today: money(revenue),
    active_orders: populated.map(orderSerializer),
  });
});
