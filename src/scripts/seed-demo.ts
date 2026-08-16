import bcrypt from 'bcryptjs';
import { User, Workshop, Staff, Service, Order, OrderStatusLog, Sale, SaleItem, Product, Conversation, Message } from '../models';
import { ORDER_STATUSES } from '../config/constants';
import { nextQueueNumber } from '../utils/workshop';

const DEMO_PASSWORD = 'demo1234';

const created: string[] = [];
const skipped: string[] = [];

function log(action: string, name: string) {
  if (action === 'created') created.push(name);
  else skipped.push(name);
}

async function getOrCreateUser(data: any) {
  const existing = await User.findOne({ phone: data.phone });
  if (existing) {
    log('skipped', `user ${data.phone}`);
    return existing;
  }
  const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await User.create({ ...data, password: hashed });
  log('created', `user ${data.phone}`);
  return user;
}

function at(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function getOrCreateStaff(workshop: any, data: any, specializations: string[], experienceYears: number) {
  const user = await getOrCreateUser(data);
  let staff = await Staff.findOne({ user: user._id });
  if (!staff) {
    staff = await Staff.create({
      user: user._id,
      workshop: workshop._id,
      specializations,
      is_available: true,
      experience_years: experienceYears,
    });
    log('created', `staff ${data.phone}`);
  } else {
    log('skipped', `staff ${data.phone}`);
  }
  return staff;
}

async function createOrderWithLogs(opts: {
  workshop: any;
  client?: any;
  client_name: string;
  client_phone: string;
  staff?: any;
  service: any;
  description: string;
  price: number;
  status: string;
  scheduled_at: Date;
  queue_number: number;
  address: string;
}) {
  const order = await Order.create({
    workshop: opts.workshop._id,
    client: opts.client || null,
    client_name: opts.client_name,
    client_phone: opts.client_phone,
    assigned_staff: opts.staff ? opts.staff.user : null,
    service: opts.service._id,
    service_type: opts.service.name,
    description: opts.description,
    price: opts.price,
    status: opts.status,
    queue_number: opts.queue_number,
    scheduled_at: opts.scheduled_at,
    address: opts.address,
    started_at: opts.status === ORDER_STATUSES.IN_PROGRESS || opts.status === ORDER_STATUSES.COMPLETED ? opts.scheduled_at : null,
    completed_at: opts.status === ORDER_STATUSES.COMPLETED ? opts.scheduled_at : null,
    no_show_at: opts.status === ORDER_STATUSES.NO_SHOW ? opts.scheduled_at : null,
    cancelled_reason: opts.status === ORDER_STATUSES.CANCELLED ? 'Mijoz bekor qildi' : '',
  });

  const logs: any[] = [{ from_status: null, to_status: ORDER_STATUSES.QUEUED, changed_by: opts.client || opts.workshop.owner }];
  if (opts.status === ORDER_STATUSES.ASSIGNED || opts.status === ORDER_STATUSES.IN_PROGRESS || opts.status === ORDER_STATUSES.COMPLETED) {
    logs.push({ from_status: ORDER_STATUSES.QUEUED, to_status: ORDER_STATUSES.ASSIGNED, changed_by: opts.workshop.owner });
  }
  if (opts.status === ORDER_STATUSES.IN_PROGRESS || opts.status === ORDER_STATUSES.COMPLETED) {
    logs.push({ from_status: ORDER_STATUSES.ASSIGNED, to_status: ORDER_STATUSES.IN_PROGRESS, changed_by: opts.staff ? opts.staff.user : opts.workshop.owner });
  }
  if (opts.status === ORDER_STATUSES.COMPLETED) {
    logs.push({ from_status: ORDER_STATUSES.IN_PROGRESS, to_status: ORDER_STATUSES.COMPLETED, changed_by: opts.staff ? opts.staff.user : opts.workshop.owner });
  }
  if (opts.status === ORDER_STATUSES.CANCELLED) {
    logs.push({ from_status: ORDER_STATUSES.QUEUED, to_status: ORDER_STATUSES.CANCELLED, changed_by: opts.client || opts.workshop.owner });
  }
  if (opts.status === ORDER_STATUSES.NO_SHOW) {
    logs.push({ from_status: ORDER_STATUSES.ASSIGNED, to_status: ORDER_STATUSES.NO_SHOW, changed_by: null });
  }

  await OrderStatusLog.insertMany(
    logs.map((l) => ({ order: order._id, ...l }))
  );
  return order;
}

async function run() {
  await import('../config/db').then((m) => m.default());

  const workshop: any = await Workshop.getPrimary();
  if (!workshop) {
    console.error('[demo] Ustaxona topilmadi. Avval serverni ishga tushiring (seed o\'zi yaratadi).');
    process.exit(1);
  }

  const umid = await getOrCreateStaff(
    workshop,
    { phone: '+998902345678', username: 'umid_ustoz', first_name: 'Umid', last_name: 'Ustoz', role: 'staff', language: 'uz', theme: 'light' },
    ['Elektrik', 'Konditsioner'],
    10
  );
  const botir = await getOrCreateStaff(
    workshop,
    { phone: '+998903456789', username: 'botir', first_name: 'Botir', last_name: 'Bo\'lakov', role: 'staff', language: 'uz', theme: 'dark' },
    ['Santexnik', 'Rozetka'],
    5
  );

  const ali = await getOrCreateUser({ phone: '+998901234567', username: 'ali', first_name: 'Ali', last_name: 'Aliyev', role: 'client', language: 'uz', theme: 'light' });
  const dilnoza = await getOrCreateUser({ phone: '+998905556677', username: 'dilnoza', first_name: 'Dilnoza', last_name: 'Karimova', role: 'client', language: 'uz', theme: 'dark' });

  const services: any = await Service.find({ workshop: workshop._id });
  const byName = new Map(services.map((s: any) => [s.name, s]));
  const kran = byName.get('Kran tuzatish') || services[0];
  const rozetka = byName.get('Rozetka o\'rnatish') || services[1];
  const diagnostika = byName.get('Qo\'ng\'iroq chaqiruvi (diagnostika)') || services[2];

  if (!(await Order.findOne({ workshop: workshop._id, client_name: 'Ali Aliyev', service_type: 'Kran tuzatish' }))) {
    const order = await createOrderWithLogs({
      workshop,
      client: ali._id,
      client_name: 'Ali Aliyev',
      client_phone: ali.phone,
      staff: umid,
      service: kran,
      description: 'Oshxonadagi kran ogmoqda, tuzatib berilsa.',
      price: 150000,
      status: ORDER_STATUSES.COMPLETED,
      scheduled_at: at(9, 0),
      queue_number: 1,
      address: 'Toshkent, Chilonzor 1',
    });

    const sale = await Sale.create({
      workshop: workshop._id,
      order: order._id,
      staff: umid.user,
      amount: 150000,
      payment_method: 'cash',
    });
    const product = await Product.findOne({ workshop: workshop._id, category: 'santexnika' });
    if (product) {
      await SaleItem.create({ sale: sale._id, product: product._id, quantity: 1, unit_price: product.price, unit_cost: product.cost_price });
    }
    log('created', 'order Kran tuzatish (completed) + sale');
  } else {
    log('skipped', 'order Kran tuzatish');
  }

  if (!(await Order.findOne({ workshop: workshop._id, client_name: 'Dilnoza Karimova', service_type: 'Rozetka o\'rnatish' }))) {
    const order = await createOrderWithLogs({
      workshop,
      client: dilnoza._id,
      client_name: 'Dilnoza Karimova',
      client_phone: dilnoza.phone,
      staff: umid,
      service: rozetka,
      description: "Yotoqxonaga 3 ta rozetka o'rnatish.",
      price: 120000,
      status: ORDER_STATUSES.IN_PROGRESS,
      scheduled_at: at(10, 30),
      queue_number: 2,
      address: 'Toshkent, Chilonzor 5',
    });
    log('created', 'order Rozetka (in_progress)');
  } else {
    log('skipped', 'order Rozetka');
  }

  if (!(await Order.findOne({ workshop: workshop._id, client_name: 'Ali Aliyev', service_type: 'Konditsioner o\'rnatish' }))) {
    const k = byName.get('Konditsioner o\'rnatish') || services[3];
    await createOrderWithLogs({
      workshop,
      client: ali._id,
      client_name: 'Ali Aliyev',
      client_phone: ali.phone,
      service: k,
      description: 'Yangi konditsioner o\'rnatish, 12-split tizim.',
      price: 350000,
      status: ORDER_STATUSES.ASSIGNED,
      scheduled_at: at(12, 0),
      queue_number: 3,
      address: 'Toshkent, Chilonzor 1',
    });
    log('created', 'order Konditsioner (assigned)');
  } else {
    log('skipped', 'order Konditsioner');
  }

  if (!(await Order.findOne({ workshop: workshop._id, client_name: 'Dilnoza Karimova', service_type: 'Qo\'ng\'iroq chaqiruvi (diagnostika)' }))) {
    await createOrderWithLogs({
      workshop,
      client: dilnoza._id,
      client_name: 'Dilnoza Karimova',
      client_phone: dilnoza.phone,
      service: diagnostika,
      description: 'Yorug\'lik o\'chib-qoladi, diagnostika kerak.',
      price: 30000,
      status: ORDER_STATUSES.QUEUED,
      scheduled_at: at(14, 0),
      queue_number: 4,
      address: 'Toshkent, Chilonzor 5',
    });
    log('created', 'order Diagnostika (queued)');
  } else {
    log('skipped', 'order Diagnostika');
  }

  if (!(await Order.findOne({ workshop: workshop._id, status: ORDER_STATUSES.NO_SHOW }))) {
    await createOrderWithLogs({
      workshop,
      client: dilnoza._id,
      client_name: 'Dilnoza Karimova',
      client_phone: dilnoza.phone,
      staff: botir,
      service: diagnostika,
      description: 'Kran almashtirish — mijoz kelmadi.',
      price: 80000,
      status: ORDER_STATUSES.NO_SHOW,
      scheduled_at: at(15, 0),
      queue_number: 5,
      address: 'Toshkent, Chilonzor 5',
    });
    log('created', 'order no_show (mijoz kelmadi)');
  } else {
    log('skipped', 'order no_show');
  }

  if (!(await Order.findOne({ workshop: workshop._id, status: ORDER_STATUSES.CANCELLED }))) {
    await createOrderWithLogs({
      workshop,
      client: ali._id,
      client_name: 'Ali Aliyev',
      client_phone: ali.phone,
      service: byName.get('Sim o\'tkazish') || services[1],
      description: 'Sim o\'tkazish — mijoz keyinga surdi.',
      price: 200000,
      status: ORDER_STATUSES.CANCELLED,
      scheduled_at: at(16, 0),
      queue_number: 6,
      address: 'Toshkent, Chilonzor 1',
    });
    log('created', 'order cancelled');
  } else {
    log('skipped', 'order cancelled');
  }

  const convOrder = await Order.findOne({ workshop: workshop._id, client_name: 'Dilnoza Karimova', service_type: 'Rozetka o\'rnatish' });
  if (convOrder && !(await Conversation.findOne({ order: convOrder._id }))) {
    const conv = await Conversation.create({
      order: convOrder._id,
      client: dilnoza._id,
      master: workshop.owner,
    });
    const m1 = await Message.create({ conversation: conv._id, sender: umid.user, text: 'Salom! Bugun tushga yaqin boraman.' });
    const m2 = await Message.create({ conversation: conv._id, sender: dilnoza._id, text: 'Yaxshi, kuting bo\'laman.' });
    conv.updated_at = m2.created_at;
    await conv.save();
    log('created', 'conversation + 2 messages');
  } else {
    log('skipped', 'conversation');
  }

  // Yangi buyurtmalar uchun navbat raqami hisobga olinishi uchun demo raqamlarni moslashtiramiz
  await nextQueueNumber(workshop._id);

  console.log('\n=== DEMO SEED ===');
  if (created.length) {
    console.log('[demo] Yaratildi:');
    for (const c of created) console.log('  +', c);
  }
  if (skipped.length) {
    console.log('[demo] Allaqachon mavjud:');
    for (const s of skipped) console.log('  =', s);
  }
  console.log(`\nParollar: barcha demo hisoblar uchun parol = ${DEMO_PASSWORD}`);
  console.log(`Ega (owner): ${workshop.owner ? await User.findById(workshop.owner).then((u) => u?.phone) : ''}`);
  console.log('Xodimlar: +998902345678 (Umid), +998903456789 (Botir)');
  console.log('Mijozlar: +998901234567 (Ali), +998905556677 (Dilnoza)');

  await (await import('mongoose')).disconnect();
}

run().catch((err) => {
  console.error('[demo] Xatolik:', err);
  process.exit(1);
});
