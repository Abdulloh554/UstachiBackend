import bcrypt from 'bcryptjs';
import connectDB from '../config/db';
import {
  User,
  Profession,
  MasterProfile,
  Order,
  OrderStatusLog,
  Store,
  Product,
  Review,
  Conversation,
  Message,
} from '../models';
import { ORDER_STATUSES } from '../config/constants';

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

async function run() {
  await connectDB();

  const elektrik = await Profession.findOne({ name_uz: 'Elektrik' });
  const boyoqchi = await Profession.findOne({ name_uz: "Bo'yoqchi" });

  const client1 = await getOrCreateUser({
    phone: '+998901234567',
    username: 'ali',
    first_name: 'Ali',
    last_name: 'Aliyev',
    role: 'client',
    language: 'uz',
    theme: 'light',
    location_lat: 41.3111,
    location_lng: 69.2797,
  });
  const client2 = await getOrCreateUser({
    phone: '+998905556677',
    username: 'dilnoza',
    first_name: 'Dilnoza',
    last_name: 'Karimova',
    role: 'client',
    language: 'uz',
    theme: 'dark',
    location_lat: 41.3231,
    location_lng: 69.2405,
  });
  const master1 = await getOrCreateUser({
    phone: '+998902345678',
    username: 'umid_ustoz',
    first_name: 'Umid',
    last_name: 'Ustoz',
    role: 'master',
    language: 'uz',
    theme: 'light',
    location_lat: 41.3111,
    location_lng: 69.2797,
  });
  const master2 = await getOrCreateUser({
    phone: '+998903456789',
    username: 'botir',
    first_name: 'Botir',
    last_name: 'Bo\'yoqchi',
    role: 'master',
    language: 'uz',
    theme: 'light',
    location_lat: 41.2871,
    location_lng: 69.2847,
  });
  const seller = await getOrCreateUser({
    phone: '+998904567890',
    username: 'jasur',
    first_name: 'Jasur',
    last_name: 'Sotuvchi',
    role: 'seller',
    language: 'uz',
    theme: 'light',
    location_lat: 41.2995,
    location_lng: 69.2401,
  });

  let prof1 = await MasterProfile.findOne({ user: master1._id });
  if (!prof1) {
    prof1 = await MasterProfile.create({
      user: master1._id,
      professions: elektrik ? [elektrik._id] : [],
      bio: "10 yillik tajribali elektrik. Hamma ish turi bo'yicha sifatli xizmat.",
      experience_years: 10,
      balance: 200000,
      is_available: true,
      rating: 5,
      rating_count: 1,
    });
    log('created', 'master profile Umid');
  } else {
    log('skipped', 'master profile Umid');
  }

  let prof2 = await MasterProfile.findOne({ user: master2._id });
  if (!prof2) {
    prof2 = await MasterProfile.create({
      user: master2._id,
      professions: boyoqchi ? [boyoqchi._id] : [],
      bio: "Devor bo'yash va ta'mirlash ishlari.",
      experience_years: 5,
      balance: 100000,
      is_available: true,
      rating: 0,
      rating_count: 0,
    });
    log('created', 'master profile Botir');
  } else {
    log('skipped', 'master profile Botir');
  }

  const order1 = await (async () => {
    const existing = await Order.findOne({ title: 'Kran tuzatish', client: client1._id });
    if (existing) {
      log('skipped', 'order Kran tuzatish');
      return existing;
    }
    const order = await Order.create({
      client: client1._id,
      title: 'Kran tuzatish',
      description: 'Oshxonadagi kran ogmoqda, tuzatib berilsa.',
      profession: elektrik ? elektrik._id : null,
      location_lat: 41.3111,
      location_lng: 69.2797,
      address: 'Toshkent, Chilonzor 1',
      price: 150000,
      status: ORDER_STATUSES.COMPLETED,
      master: master1._id,
    });
    await OrderStatusLog.insertMany([
      { order: order._id, from_status: null, to_status: ORDER_STATUSES.NEW, changed_by: client1._id },
      { order: order._id, from_status: ORDER_STATUSES.NEW, to_status: ORDER_STATUSES.ACCEPTED, changed_by: master1._id },
      { order: order._id, from_status: ORDER_STATUSES.ACCEPTED, to_status: ORDER_STATUSES.COMING, changed_by: master1._id },
      { order: order._id, from_status: ORDER_STATUSES.COMING, to_status: ORDER_STATUSES.IN_PROGRESS, changed_by: master1._id },
      { order: order._id, from_status: ORDER_STATUSES.IN_PROGRESS, to_status: ORDER_STATUSES.COMPLETED, changed_by: master1._id },
    ]);
    log('created', 'order Kran tuzatish');
    return order;
  })();

  const order2 = await (async () => {
    const existing = await Order.findOne({ title: 'Sim o\'tkazish', client: client1._id });
    if (existing) {
      log('skipped', 'order Sim o\'tkazish');
      return existing;
    }
    const order = await Order.create({
      client: client1._id,
      title: "Sim o'tkazish",
      description: "Yangi uyda to'liq sim o'tkazish kerak, 3 xona.",
      profession: elektrik ? elektrik._id : null,
      location_lat: 41.3111,
      location_lng: 69.2797,
      address: 'Toshkent, Yunusobod 5',
      price: 800000,
      status: ORDER_STATUSES.NEW,
    });
    await OrderStatusLog.create({
      order: order._id,
      from_status: null,
      to_status: ORDER_STATUSES.NEW,
      changed_by: client1._id,
    });
    log('created', 'order Sim o\'tkazish');
    return order;
  })();

  const order3 = await (async () => {
    const existing = await Order.findOne({ title: 'Devor bo\'yash', client: client2._id });
    if (existing) {
      log('skipped', 'order Devor bo\'yash');
      return existing;
    }
    const order = await Order.create({
      client: client2._id,
      title: "Devor bo'yash",
      description: "3 xonali kvartirani ichkaridan bo'yash.",
      profession: boyoqchi ? boyoqchi._id : null,
      location_lat: 41.3231,
      location_lng: 69.2405,
      address: 'Toshkent, Chilonzor 5',
      price: 1200000,
      status: ORDER_STATUSES.IN_PROGRESS,
      master: master2._id,
    });
    await OrderStatusLog.insertMany([
      { order: order._id, from_status: null, to_status: ORDER_STATUSES.NEW, changed_by: client2._id },
      { order: order._id, from_status: ORDER_STATUSES.NEW, to_status: ORDER_STATUSES.ACCEPTED, changed_by: master2._id },
      { order: order._id, from_status: ORDER_STATUSES.ACCEPTED, to_status: ORDER_STATUSES.IN_PROGRESS, changed_by: master2._id },
    ]);
    log('created', 'order Devor bo\'yash');
    return order;
  })();

  const order4 = await (async () => {
    const existing = await Order.findOne({ title: 'Shkaf yig\'ish', client: client2._id });
    if (existing) {
      log('skipped', 'order Shkaf yig\'ish');
      return existing;
    }
    const order = await Order.create({
      client: client2._id,
      title: "Shkaf yig'ish",
      description: 'Kiyim shkafini yig\'ish va devorga mahkamlash.',
      profession: null,
      location_lat: 41.3231,
      location_lng: 69.2405,
      address: 'Toshkent, Chilonzor 5',
      price: 200000,
      status: ORDER_STATUSES.NEW,
    });
    await OrderStatusLog.create({
      order: order._id,
      from_status: null,
      to_status: ORDER_STATUSES.NEW,
      changed_by: client2._id,
    });
    log('created', 'order Shkaf yig\'ish');
    return order;
  })();

  const review = await (async () => {
    const existing = await Review.findOne({ order: order1._id });
    if (existing) {
      log('skipped', 'review Kran tuzatish');
      return existing;
    }
    const r = await Review.create({
      order: order1._id,
      client: client1._id,
      master: master1._id,
      rating: 5,
      comment: "Ajoyib usta! Ishi sifatli, o'z vaqtida keldi.",
    });
    log('created', 'review Kran tuzatish');
    return r;
  })();

  let store = await Store.findOne({ user: seller._id });
  if (!store) {
    store = await Store.create({
      user: seller._id,
      name: 'Ali Hardware',
      description: 'Qurilish asboblari va materiallari',
      category: 'qurilish',
      phone: '+998904567890',
      address: 'Toshkent, Chorsu bozori',
      balance: 0,
    });
    log('created', 'store Ali Hardware');
  } else {
    log('skipped', 'store Ali Hardware');
  }

  const productData = [
    { name: 'Drel', description: 'Elektr drel, 650W', category: 'asbob', price: 500000, cost_price: 400000, quantity: 10 },
    { name: "Bolg'a", description: 'O\'rta o\'lchamli bolg\'a', category: 'asbob', price: 120000, cost_price: 80000, quantity: 25 },
    { name: 'Burama vintlar', description: 'O\'z-o\'zidan burama vintlar, 100 dona', category: 'material', price: 45000, cost_price: 30000, quantity: 100 },
  ];
  for (const p of productData) {
    const existing = await Product.findOne({ name: p.name, store: store._id });
    if (existing) {
      log('skipped', `product ${p.name}`);
      continue;
    }
    await Product.create({ store: store._id, image: null, ...p });
    log('created', `product ${p.name}`);
  }

  let conversation = await Conversation.findOne({ order: order3._id });
  if (!conversation) {
    conversation = await Conversation.create({
      order: order3._id,
      client: client2._id,
      master: master2._id,
    });
    const msg1 = await Message.create({
      conversation: conversation._id,
      sender: master2._id,
      text: 'Salom! Devor bo\'yashga tayyorman.',
    });
    const msg2 = await Message.create({
      conversation: conversation._id,
      sender: client2._id,
      text: 'Yaxshi, ertaga kelishingiz mumkinmi?',
    });
    const msg3 = await Message.create({
      conversation: conversation._id,
      sender: master2._id,
      text: 'Kelishdik, ertaga soat 9 da bo\'laman.',
    });
    conversation.updated_at = msg3.created_at;
    await conversation.save();
    log('created', 'conversation + 3 messages');
  } else {
    log('skipped', 'conversation Devor bo\'yash');
  }

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
  console.log('Mijozlar: +998901234567, +998905556677');
  console.log('Ustalar: +998902345678, +998903456789');
  console.log('Sotuvchi: +998904567890');

  await (await import('mongoose')).disconnect();
}

run().catch((err) => {
  console.error('[demo] Xatolik:', err);
  process.exit(1);
});
