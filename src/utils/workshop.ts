import { Workshop, Staff, Order } from '../models';
import { ROLES, ORDER_STATUSES, ACTIVE_ORDER_STATUSES } from '../config/constants';
import { IWorkshop } from '../models/Workshop';
import { ApiError } from './http';

// Ruxsat berilgan foydalanuvchi uchun qaysi ustaxona ekanini aniqlaydi.
// Owner o'z ustaxonasiga, staff o'zi ishlaydigan ustaxonaga bog'lanadi,
// mijoz esa bitta asosiy ("birinchi") ustaxonaga murojaat qiladi.
export async function resolveWorkshop(user: any): Promise<IWorkshop | null> {
  if (!user) return Workshop.getPrimary();
  if (user.role === ROLES.OWNER) {
    return Workshop.findOne({ owner: user._id });
  }
  if (user.role === ROLES.STAFF) {
    const staff = await Staff.findOne({ user: user._id });
    if (!staff) return null;
    return Workshop.findById(staff.workshop);
  }
  return Workshop.getPrimary();
}

export async function requireWorkshop(user: any): Promise<IWorkshop> {
  const workshop = await resolveWorkshop(user);
  if (!workshop) {
    throw new ApiError(404, 'Ustaxona topilmadi');
  }
  return workshop;
}

export async function requireOwnerWorkshop(user: any): Promise<IWorkshop> {
  const workshop = await resolveWorkshop(user);
  if (!workshop || String(workshop.owner) !== String(user._id)) {
    throw new ApiError(403, 'Siz bu ustaxona egasi emassiz');
  }
  return workshop;
}

export function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// "YYYY-MM-DD" → mahalliy sana boshi
export function parseDate(value: any): Date | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 0, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Bugungi navbat raqami: ustaxonada bugun yaratilgan buyurtmalar soni + 1
export async function nextQueueNumber(workshopId: any): Promise<number> {
  const { start, end } = dayRange(new Date());
  const count = await Order.countDocuments({
    workshop: workshopId,
    created_at: { $gte: start, $lte: end },
  });
  return count + 1;
}

// Faol (bajarilmagan) buyurtmalar navbatini rejalashtirilgan vaqt bo'yicha qayta raqamlaydi.
// Bekor qilingan / kelmagan buyurtmalardan keyin navbat "siqilishi" kerak.
export async function renumberQueue(workshopId: any, date: Date = new Date()): Promise<void> {
  const { start, end } = dayRange(date);
  const active = await Order.find({
    workshop: workshopId,
    status: { $in: ACTIVE_ORDER_STATUSES },
    created_at: { $gte: start, $lte: end },
  }).sort({ scheduled_at: 1, created_at: 1 });
  let n = 1;
  for (const order of active) {
    if (order.queue_number !== n) {
      order.queue_number = n;
      await order.save();
    }
    n += 1;
  }
}

// Avtomatik tayinlash: eng kam faol buyurtmaga ega bo'sh xodim
export async function autoAssignStaff(workshopId: any, excludeUserId?: any, scheduledAt?: Date, durationMinutes = 60): Promise<any> {
  const staffList = await Staff.find({
    workshop: workshopId,
    is_available: true,
  }).populate('user', '_id first_name last_name');
  if (!staffList.length) return null;

  let candidates = staffList.filter((s: any) => !excludeUserId || String(s.user._id) !== String(excludeUserId));
  if (!candidates.length) return null;

  if (scheduledAt) {
    const busyChecks = await Promise.all(
      candidates.map(async (s: any) => isStaffBusy(workshopId, s.user._id, scheduledAt, durationMinutes))
    );
    candidates = candidates.filter((_, i) => !busyChecks[i]);
  }
  if (!candidates.length) return null;

  const counts = await Promise.all(
    candidates.map(async (s: any) => {
      const userId = s.user._id;
      const active = await Order.countDocuments({
        workshop: workshopId,
        assigned_staff: userId,
        status: { $in: ACTIVE_ORDER_STATUSES },
      });
      return { staff: s, userId, active };
    })
  );

  counts.sort((a, b) => a.active - b.active);
  return counts[0].userId;
}

// Xodimning berilgan vaqtdagi bandligini tekshiradi
export async function isStaffBusy(workshopId: any, staffId: any, scheduledAt: Date, durationMinutes = 60): Promise<boolean> {
  if (!scheduledAt) return false;
  const slotStart = new Date(scheduledAt.getTime() - 10 * 60 * 1000);
  const slotEnd = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);
  const conflict = await Order.findOne({
    workshop: workshopId,
    assigned_staff: staffId,
    status: { $in: [ACTIVE_ORDER_STATUSES[1], ACTIVE_ORDER_STATUSES[2]] },
    scheduled_at: { $ne: null, $gte: slotStart, $lte: slotEnd },
  });
  return Boolean(conflict);
}

// Xodim band bo'lsa (ishga kelmadi/kasal), uning kutilayotgan buyurtmalarini
// boshqa bo'sh xodimga qayta tayinlaydi. Bo'sh xodim topilmasa — navbatga qaytaradi.
export async function reassignPendingOrders(workshopId: any, staffUserId: any): Promise<void> {
  const pending = await Order.find({
    workshop: workshopId,
    assigned_staff: staffUserId,
    status: { $in: [ORDER_STATUSES.QUEUED, ORDER_STATUSES.ASSIGNED] },
  });
  for (const order of pending) {
    const next = await autoAssignStaff(workshopId, staffUserId, order.scheduled_at, 60);
    if (next) {
      order.assigned_staff = next;
      if (order.status === ORDER_STATUSES.QUEUED) order.status = ORDER_STATUSES.ASSIGNED;
    } else {
      order.assigned_staff = null;
      if (order.status === ORDER_STATUSES.ASSIGNED) order.status = ORDER_STATUSES.QUEUED;
    }
    await order.save();
  }
}
