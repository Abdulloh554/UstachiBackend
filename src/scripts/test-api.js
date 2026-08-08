const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.PORT = '8010';
process.env.JWT_SECRET = 'test-secret';

let base = 'http://localhost:8010/api';
let accessClient = null;
let accessMaster = null;
let accessSeller = null;

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function run() {
  const mongod = await MongoMemoryServer.create({ instance: { port: 27019 } });
  process.env.MONGODB_URI = mongod.getUri('ustachi_test');

  const { main } = require('../server');
  const server = await main();

  await new Promise((r) => setTimeout(r, 1500));

  // Health
  const health = await api('GET', '/health/');
  check('health', health.status === 200 && health.data.status === 'ok');

  // Professions (seeded)
  const profs = await api('GET', '/auth/professions/');
  check('professions list', profs.status === 200 && Array.isArray(profs.data) && profs.data.length > 0);

  const profId = profs.data[0].id;

  // Register client
  const regClient = await api('POST', '/auth/register/', {
    body: {
      phone: '+998901234567',
      password: 'secret12',
      first_name: 'Ali',
      last_name: 'Aliyev',
      role: 'client',
    },
  });
  check('register client', regClient.status === 201 && regClient.data.role === 'client', JSON.stringify(regClient.data));

  // Register client with wrong phone format
  const badPhone = await api('POST', '/auth/register/', {
    body: { phone: '12345', password: 'secret12', role: 'client' },
  });
  check('register bad phone rejected', badPhone.status === 400);

  // Duplicate phone
  const dupPhone = await api('POST', '/auth/register/', {
    body: { phone: '+998901234567', password: 'secret12', role: 'client' },
  });
  check('register duplicate phone rejected', dupPhone.status === 400);

  // Register master
  const regMaster = await api('POST', '/auth/register/', {
    body: {
      phone: '+998902345678',
      password: 'secret12',
      first_name: 'Master',
      last_name: 'Ustoz',
      role: 'master',
      profession_ids: [profId],
      bio: 'Tajribali usta',
      experience_years: 5,
    },
  });
  check('register master', regMaster.status === 201 && regMaster.data.role === 'master');

  // Register master without profession
  const regMasterNoProf = await api('POST', '/auth/register/', {
    body: { phone: '+998903345678', password: 'secret12', role: 'master' },
  });
  check('register master without profession rejected', regMasterNoProf.status === 400);

  // Login client
  const loginClient = await api('POST', '/auth/login/', {
    body: { phone: '+998901234567', password: 'secret12' },
  });
  check('login client', loginClient.status === 200 && loginClient.data.access && loginClient.data.refresh);
  accessClient = loginClient.data.access;

  // Login wrong password
  const loginBad = await api('POST', '/auth/login/', {
    body: { phone: '+998901234567', password: 'wrongpass' },
  });
  check('login wrong password 401', loginBad.status === 401);

  // Profile
  const profile = await api('GET', '/auth/profile/', { token: accessClient });
  check('profile', profile.status === 200 && profile.data.phone === '+998901234567');

  // Refresh
  const refreshed = await api('POST', '/auth/refresh/', {
    body: { refresh: loginClient.data.refresh },
  });
  check('refresh', refreshed.status === 200 && !!refreshed.data.access);

  // Unauthorized access
  const noAuth = await api('GET', '/auth/profile/');
  check('profile without token 401', noAuth.status === 401);

  // Create order (client)
  const order = await api('POST', '/orders/', {
    token: accessClient,
    body: {
      title: 'Kran tuzatish',
      description: 'Oshxonadagi kran ogmoqda',
      profession: profId,
      location_lat: 41.3111,
      location_lng: 69.2797,
      address: 'Tashkent, Chilonzor 1',
      price: 150000,
    },
  });
  check('create order', order.status === 201 && order.data.status === 'new' && order.data.client_details.phone === '+998901234567', JSON.stringify(order.data));
  const orderId = order.data.id;

  // Client orders list
  const myOrders = await api('GET', '/clients/my-orders/', { token: accessClient });
  check('client my-orders', myOrders.status === 200 && Array.isArray(myOrders.data) && myOrders.data.length === 1);

  // Master login
  const loginMaster = await api('POST', '/auth/login/', {
    body: { phone: '+998902345678', password: 'secret12' },
  });
  accessMaster = loginMaster.data.access;

  // Available orders (master)
  const avail = await api('GET', '/masters/available-orders/', { token: accessMaster });
  check('available orders', avail.status === 200 && Array.isArray(avail.data) && avail.data.length === 1);

  // Master profile
  const masterProfile = await api('GET', '/masters/me/profile/', { token: accessMaster });
  check('master profile balance 100000', masterProfile.status === 200 && masterProfile.data.balance === '100000.00', JSON.stringify(masterProfile.data));

  // Accept order
  const accepted = await api('POST', `/orders/${orderId}/accept/`, { token: accessMaster });
  check('accept order', accepted.status === 200 && accepted.data.status === 'accepted' && accepted.data.master_details.phone === '+998902345678', JSON.stringify(accepted.data));

  // Balance deducted
  const masterProfileAfter = await api('GET', '/masters/me/profile/', { token: accessMaster });
  check('balance deducted to 95001', masterProfileAfter.data.balance === '95001.00', masterProfileAfter.data.balance);

  // Conversation created
  const convos = await api('GET', '/chat/conversations/', { token: accessMaster });
  check('conversations list', convos.status === 200 && Array.isArray(convos.data) && convos.data.length === 1);
  const convId = convos.data[0].id;

  // Conversation on order detail
  const orderDetail = await api('GET', `/orders/${orderId}/`, { token: accessClient });
  check('order has conversation_id', orderDetail.data.conversation_id === convId);

  // Send message REST
  const sent = await api('POST', `/chat/conversations/${convId}/messages/`, {
    token: accessMaster,
    body: { text: 'Salom! Bora olaman' },
  });
  check('send message rest', sent.status === 201 && sent.data.text === 'Salom! Bora olaman');

  // Messages list
  const msgs = await api('GET', `/chat/conversations/${convId}/messages/`, { token: accessClient });
  check('messages list', msgs.status === 200 && Array.isArray(msgs.data) && msgs.data.length === 1);

  // Non-participant blocked
  const regSeller = await api('POST', '/auth/register/', {
    body: { phone: '+998904345678', password: 'secret12', first_name: 'Sotuvchi', role: 'seller' },
  });
  check('register seller', regSeller.status === 201);
  const loginSeller = await api('POST', '/auth/login/', { body: { phone: '+998904345678', password: 'secret12' } });
  accessSeller = loginSeller.data.access;
  const blocked = await api('GET', `/chat/conversations/${convId}/messages/`, { token: accessSeller });
  check('non-participant blocked 404', blocked.status === 404);

  // Update status flow: coming -> in_progress -> completed
  const toComing = await api('POST', `/orders/${orderId}/update_status/`, { token: accessMaster, body: { status: 'coming' } });
  check('status to coming', toComing.status === 200 && toComing.data.status === 'coming');
  const toProgress = await api('POST', `/orders/${orderId}/update_status/`, { token: accessMaster, body: { status: 'in_progress' } });
  check('status to in_progress', toProgress.status === 200 && toProgress.data.status === 'in_progress');
  const toCompleted = await api('POST', `/orders/${orderId}/update_status/`, { token: accessMaster, body: { status: 'completed' } });
  check('status to completed', toCompleted.status === 200 && toCompleted.data.status === 'completed');

  // Invalid transition
  const badTransition = await api('POST', `/orders/${orderId}/update_status/`, { token: accessMaster, body: { status: 'accepted' } });
  check('invalid transition rejected', badTransition.status === 400);

  // Client review
  const review = await api('POST', '/masters/reviews/', {
    token: accessClient,
    body: { order: orderId, rating: 5, comment: 'Zo\'r usta!' },
  });
  check('create review', review.status === 201 && review.data.rating === 5);

  // Master reviews list
  const myReviews = await api('GET', '/masters/reviews/', { token: accessMaster });
  check('master reviews', myReviews.status === 200 && myReviews.data.length === 1);

  // Duplicate review rejected
  const dupReview = await api('POST', '/masters/reviews/', {
    token: accessClient,
    body: { order: orderId, rating: 4, comment: 'yana' },
  });
  check('duplicate review rejected', dupReview.status === 400);

  // Masters list shows updated rating
  const mastersList = await api('GET', '/masters/', {});
  check('masters list rating', mastersList.status === 200 && mastersList.data.results[0].rating === 5);

  // Store flow: seller creates store + product
  const myStore = await api('GET', '/stores/me/store/', { token: accessSeller });
  check('get-or-create store', myStore.status === 200 && myStore.data.name);

  const prod = await api('POST', '/stores/me/products/', {
    token: accessSeller,
    body: { name: 'Drel', description: 'elektr drel', category: 'asbob', price: 500000, cost_price: 400000, quantity: 10 },
  });
  check('create product', prod.status === 201 && prod.data.price === '500000.00', JSON.stringify(prod.data));
  const productId = prod.data.id;

  // Client adds to cart
  const cartAdd = await api('POST', '/stores/cart/', {
    token: accessClient,
    body: { product_id: productId, quantity: 2 },
  });
  check('add to cart', cartAdd.status === 201 && cartAdd.data.quantity === 2);

  // Cart view
  const cart = await api('GET', '/stores/cart/', { token: accessClient });
  check('cart total', cart.status === 200 && cart.data.total === '1000000.00' && cart.data.count === 2, cart.data.total);

  // Checkout
  const checkout = await api('POST', '/stores/cart/checkout/', { token: accessClient });
  check('checkout', checkout.status === 200 && checkout.data.sales.length === 1);

  // Favorite toggle
  const favOn = await api('POST', '/stores/favorites/toggle/', { token: accessClient, body: { product_id: productId } });
  check('favorite on', favOn.status === 201 && favOn.data.favorited === true);
  const favOff = await api('POST', '/stores/favorites/toggle/', { token: accessClient, body: { product_id: productId } });
  check('favorite off', favOff.status === 200 && favOff.data.favorited === false);

  // Seller statistics
  const stats = await api('GET', '/stores/me/statistics/', { token: accessSeller });
  check('seller statistics', stats.status === 200 && stats.data.store_exists === true && stats.data.total_units_sold === 2, JSON.stringify(stats.data));

  // Admin dashboard (seeded admin)
  let adminLogin = null;
  for (let i = 0; i < 10 && !adminLogin; i++) {
    adminLogin = await api('POST', '/auth/login/', { body: { phone: '+998900000000', password: 'AdminPass123!' } });
    if (adminLogin.status !== 200) await new Promise((r) => setTimeout(r, 500));
  }
  check('admin login', adminLogin.status === 200);
  const dashboard = await api('GET', '/admin/dashboard/', { token: adminLogin.data.access });
  check('admin dashboard', dashboard.status === 200 && dashboard.data.total_users >= 4 && dashboard.data.total_orders === 1, JSON.stringify(dashboard.data));

  // Admin-only access denied for client
  const adminDenied = await api('GET', '/admin/dashboard/', { token: accessClient });
  check('admin denied for client', adminDenied.status === 403);

  // Settings
  const settings = await api('GET', '/settings/', {});
  check('settings get', settings.status === 200 && settings.data.site_name === 'Ustachi');
  const settingsUpdate = await api('PUT', '/settings/', {
    token: adminLogin.data.access,
    body: { site_name: 'Ustachi Pro', support_phone: '+9981112233' },
  });
  check('settings update', settingsUpdate.status === 200 && settingsUpdate.data.site_name === 'Ustachi Pro');

  console.log(`\n=== Natija: ${passed} PASS, ${failed} FAIL ===`);
  await server.close();
  await mongod.stop();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('TEST HATOLIK:', err);
  process.exit(1);
});
