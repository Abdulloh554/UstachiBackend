import { Order, OrderStatusLog } from './models';
import { ORDER_STATUSES, NO_SHOW_MINUTES } from './config/constants';
import { renumberQueue } from './utils/workshop';

let timer: NodeJS.Timeout | null = null;

// Rejalashtirilgan vaqtdan NO_SHOW_MINUTES o'tib, hali boshlanmagan
// (queued/assigned) buyurtmalarni avtomatik no_show qiladi.
async function checkNoShow(): Promise<void> {
  const deadline = new Date(Date.now() - NO_SHOW_MINUTES * 60 * 1000);
  const orders = await Order.find({
    status: { $in: [ORDER_STATUSES.QUEUED, ORDER_STATUSES.ASSIGNED] },
    scheduled_at: { $ne: null, $lte: deadline },
  });

  for (const order of orders) {
    const oldStatus = order.status;
    order.status = ORDER_STATUSES.NO_SHOW;
    order.no_show_at = new Date();
    await order.save();
    await OrderStatusLog.create({
      order: order._id,
      from_status: oldStatus,
      to_status: ORDER_STATUSES.NO_SHOW,
      changed_by: null,
    });
    // Navbat "siqiladi": kelmagan mijozning o'rniga keyingilar qayta raqamlanadi
    await renumberQueue(order.workshop, order.created_at);
  }

  if (orders.length) {
    console.log(`[scheduler] ${orders.length} buyurtma no_show holatiga o'tkazildi`);
  }
}

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    checkNoShow().catch((err) => console.error('[scheduler] no_show xatolik:', err.message));
  }, 60 * 1000);
}
