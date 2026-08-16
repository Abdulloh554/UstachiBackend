import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Server } from 'http';

process.env.NODE_ENV = 'test';
process.env.PORT = '8010';
process.env.JWT_SECRET = 'test-secret';

let base = 'http://localhost:8010/api';
let ownerToken: string | null = null;
let staffToken: string | null = null;
let clientToken: string | null = null;

async function api(
  method: string,
  path: string,
  { token, body }: { token?: string | null; body?: any } = {}
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra: string = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function run(): Promise<void> {
  const mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: 27019 }],
  });
  process.env.MONGODB_URI = mongod.getUri('ustachi_test');

  const { main } = await import('../server');
  const server = await main();

  await new Promise((r) => setTimeout(r, 1500));

  const health = await api('GET', '/health/');
  check('health', health.status === 200 && health.data.status === 'ok');

  // --- Seed natijasi: bitta ustaxona + xizmatlar ---
  const pub = await api('GET', '/workshops/public/');
  check(
    'public workshop + services',
    pub.status === 200 && !!pub.data.workshop.name && Array.isArray(pub.data.services) && pub.data.services.length > 0,
    JSON.stringify(pub.data)
  );
  const serviceId = pub.data.services[0].id;

  // --- Owner login ---
  const loginOwner = await api('POST', '/auth/login/', {
    body: { phone: '+998900000000', password: 'AdminPass123!' },
  });
  check('owner login', loginOwner.status === 200 && loginOwner.data.access);
  ownerToken = loginOwner.data.access;

  // --- Staff registratsiya ochiq emas, faqat owner qo'shadi ---
  const regStaffDirect = await api('POST', '/auth/register/', {
    body: { phone: '+998902345678', password: 'secret12', first_name: 'Umid', role: 'staff' },
  });
  check('staff cannot self-register', regStaffDirect.status === 400, JSON.stringify(regStaffDirect.data));

  const regClient = await api('POST', '/auth/register/', {
    body: { phone: '+998901234567', password: 'secret12', first_name: 'Ali', last_name: 'Aliyev', role: 'client' },
  });
  check('register client', regClient.status === 201 && regClient.data.role === 'client');

  const loginClient = await api('POST', '/auth/login/', { body: { phone: '+998901234567', password: 'secret12' } });
  clientToken = loginClient.data.access;
  check('client login', loginClient.status === 200 && !!loginClient.data.access);

  // --- Owner xodim qo'shadi ---
  const addStaff = await api('POST', '/workshops/me/staff/', {
    token: ownerToken,
    body: {
      phone: '+998902345678',
      password: 'secret12',
      first_name: 'Umid',
      last_name: 'Ustoz',
      specializations: ['Elektrik', 'Konditsioner'],
      experience_years: 10,
    },
  });
  check('owner adds staff', addStaff.status === 201 && addStaff.data.is_available === true, JSON.stringify(addStaff.data));
  const staffId = addStaff.data.id;

  const loginStaff = await api('POST', '/auth/login/', { body: { phone: '+998902345678', password: 'secret12' } });
  staffToken = loginStaff.data.access;
  check('staff login', loginStaff.status === 200 && !!loginStaff.data.access);

  // --- Mijoz buyurtma yaratadi; bo'sh xodim bor ekan, avto-tayinlanadi ---
  const createOrder = await api('POST', '/orders/', {
    token: clientToken,
    body: {
      service_id: serviceId,
      description: 'Kran tuzatish',
      scheduled_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      address: 'Toshkent, Chilonzor 1',
    },
  });
  check(
    'client creates order (auto-assigned)',
    createOrder.status === 201 &&
      createOrder.data.status === 'assigned' &&
      createOrder.data.queue_number === 1 &&
      !!createOrder.data.assigned_staff,
    JSON.stringify(createOrder.data)
  );
  const orderId = createOrder.data.id;

  const myOrders = await api('GET', '/orders/', { token: clientToken });
  check('client sees own orders', myOrders.status === 200 && myOrders.data.results.length === 1);

  // --- Staff faqat o'ziga tayinlanganlarini ko'radi ---
  const staffToday = await api('GET', '/staff/me/today/', { token: staffToken });
  check(
    'staff today shows assigned order',
    staffToday.status === 200 && staffToday.data.active_orders.length === 1 && staffToday.data.active_count === 1,
    JSON.stringify(staffToday.data)
  );

  // --- Staff buyurtma yarata olmaydi ---
  const staffCreateOrder = await api('POST', '/orders/', {
    token: staffToken,
    body: { service_id: serviceId, description: 'ruxsat emas' },
  });
  check('staff cannot create order', staffCreateOrder.status === 403);

  // --- Status o'zgarishi: assigned -> in_progress -> completed ---
  const toProgress = await api('POST', `/orders/${orderId}/update_status/`, {
    token: staffToken,
    body: { status: 'in_progress' },
  });
  check('status to in_progress', toProgress.status === 200 && toProgress.data.status === 'in_progress');

  const badTransition = await api('POST', `/orders/${orderId}/update_status/`, {
    token: staffToken,
    body: { status: 'queued' },
  });
  check('invalid transition rejected', badTransition.status === 400);

  // --- Mijoz boshqa buyurtma yaratib, o'zi bekor qiladi; navbat siqiladi ---
  const order2 = await api('POST', '/orders/', {
    token: clientToken,
    body: { service_id: serviceId, description: 'Sim o\'tkazish', scheduled_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString() },
  });
  check('second order queued behind first', order2.status === 201 && order2.data.queue_number === 2);
  const order2Id = order2.data.id;

  const cancelOrder2 = await api('POST', `/orders/${order2Id}/cancel/`, {
    token: clientToken,
    body: { reason: 'Fikrim o\'zgardi' },
  });
  check('client cancels own order', cancelOrder2.status === 200 && cancelOrder2.data.status === 'cancelled');

  // --- Staff konsum (ombordan mahsulot sarflash) ---
  const inventory = await api('GET', '/workshops/me/inventory/', { token: ownerToken });
  const product = inventory.data[0];
  const beforeQty = Number(product.quantity);

  const consume = await api('POST', `/orders/${orderId}/consume/`, {
    token: staffToken,
    body: { product_id: product.id, quantity: 1 },
  });
  check('staff consumes product from warehouse', consume.status === 200, JSON.stringify(consume.data));

  const inventoryAfter = await api('GET', '/workshops/me/inventory/', { token: ownerToken });
  const afterQty = Number(inventoryAfter.data[0].quantity);
  check('product quantity decremented', afterQty === beforeQty - 1, `before=${beforeQty} after=${afterQty}`);

  // --- Completed: to'lov yoziladi ---
  const toCompleted = await api('POST', `/orders/${orderId}/update_status/`, {
    token: staffToken,
    body: { status: 'completed', payment_method: 'card' },
  });
  check('status to completed', toCompleted.status === 200 && toCompleted.data.status === 'completed');

  // --- Owner dashboard: bugungi tushum ---
  const dashboard = await api('GET', '/workshops/me/dashboard/', { token: ownerToken });
  check(
    'owner dashboard shows revenue + completed',
    dashboard.status === 200 &&
      dashboard.data.today.completed === 1 &&
      Number(dashboard.data.today.revenue) > 0 &&
      dashboard.data.staff.length === 1 &&
      dashboard.data.staff[0].completed_today === 1,
    JSON.stringify(dashboard.data)
  );

  // --- Kunlik hisobot ---
  const report = await api('GET', '/workshops/me/reports/', { token: ownerToken });
  check(
    'daily report',
    report.status === 200 &&
      Number(report.data.revenue) > 0 &&
      report.data.orders_completed === 1 &&
      report.data.by_service.length === 1 &&
      report.data.by_staff.length === 1 &&
      report.data.daily.length >= 1,
    JSON.stringify(report.data)
  );

  // --- Mijoz report'ga kira olmaydi ---
  const reportDenied = await api('GET', '/workshops/me/reports/', { token: clientToken });
  check('client cannot access reports', reportDenied.status === 403);

  // --- no_show: egasi manual qo'lda belgilaydi ---
  const order3 = await api('POST', '/orders/', {
    token: ownerToken,
    body: {
      service_id: serviceId,
      client_name: 'Valijon',
      client_phone: '+998907654321',
      description: 'Qo\'ng\'iroq chaqiruvi',
      scheduled_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    },
  });
  check('owner creates walk-in order', order3.status === 201 && order3.data.queue_number === 3, JSON.stringify(order3.data));

  const noShow = await api('POST', `/orders/${order3.data.id}/update_status/`, {
    token: ownerToken,
    body: { status: 'no_show' },
  });
  check('owner marks no_show', noShow.status === 200 && noShow.data.status === 'no_show');

  // --- Assign: owner boshqa buyurtmani yana tayinlaydi ---
  const order4 = await api('POST', '/orders/', {
    token: ownerToken,
    body: {
      service_id: serviceId,
      client_name: 'Mijoz 4',
      client_phone: '+998907654322',
      description: 'Rozetka o\'rnatish',
      scheduled_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    },
  });
  check('owner auto-assigns to only staff', order4.status === 201 && order4.data.status === 'assigned');

  const reassign = await api('POST', `/orders/${order4.data.id}/assign/`, {
    token: ownerToken,
    body: { staff_id: loginStaff.data.access ? undefined : undefined },
  });
  check('assign without staff_id rejected', reassign.status === 400);

  // --- Logs ---
  const logs = await api('GET', `/orders/${orderId}/logs/`, { token: clientToken });
  check('order logs', logs.status === 200 && logs.data.length >= 3);

  // --- Receipt (chek) ---
  const receipt = await api('GET', `/orders/${orderId}/receipt/`, { token: clientToken });
  check(
    'order receipt',
    receipt.status === 200 &&
      receipt.data.order.id === orderId &&
      receipt.data.workshop &&
      receipt.data.workshop.name &&
      Array.isArray(receipt.data.items),
    JSON.stringify(receipt.data)
  );

  // --- Settings (owner admin sifatida) ---
  const settings = await api('GET', '/settings/', {});
  check('settings get', settings.status === 200 && settings.data.site_name === 'Ustachi');

  console.log(`\n=== Natija: ${passed} PASS, ${failed} FAIL ===`);
  await server.close();
  await mongod.stop();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('TEST HATOLIK:', err);
  process.exit(1);
});
