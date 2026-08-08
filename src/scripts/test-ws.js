const { MongoMemoryServer } = require('mongodb-memory-server');
const WebSocket = require('ws');

process.env.NODE_ENV = 'test';
process.env.PORT = '8011';
process.env.JWT_SECRET = 'test-secret';

let base = 'http://localhost:8011/api';
let wsBase = 'ws://localhost:8011';

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

function connect(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', () => resolve(ws));
    ws.on('close', (code, reason) => {
      ws.closeCode = code;
      ws.closeReason = reason.toString();
    });
  });
}

function waitClose(ws, ms = 3000) {
  return new Promise((resolve) => {
    if (ws.closeCode) return resolve(ws.closeCode);
    const timer = setTimeout(() => resolve(ws.closeCode || -1), ms);
    ws.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function run() {
  const mongod = await MongoMemoryServer.create({ instance: { port: 27020 } });
  process.env.MONGODB_URI = mongod.getUri('ustachi_ws_test');
  const { main } = require('../server');
  const server = await main();
  await new Promise((r) => setTimeout(r, 1500));

  const profs = await api('GET', '/auth/professions/');
  const profId = profs.data[0].id;

  await api('POST', '/auth/register/', {
    body: { phone: '+998901111111', password: 'secret12', first_name: 'Mijoz', role: 'client' },
  });
  await api('POST', '/auth/register/', {
    body: { phone: '+998902222222', password: 'secret12', first_name: 'Usta', role: 'master', profession_ids: [profId] },
  });

  const loginClient = await api('POST', '/auth/login/', { body: { phone: '+998901111111', password: 'secret12' } });
  const loginMaster = await api('POST', '/auth/login/', { body: { phone: '+998902222222', password: 'secret12' } });
  const clientToken = loginClient.data.access;
  const masterToken = loginMaster.data.access;

  const order = await api('POST', '/orders/', {
    token: clientToken,
    body: {
      title: 'Test buyurtma',
      description: 'ws test',
      location_lat: 41.3,
      location_lng: 69.2,
      price: 20000,
    },
  });
  const orderId = order.data.id;

  await api('POST', `/orders/${orderId}/accept/`, { token: masterToken });

  const convos = await api('GET', '/chat/conversations/', { token: masterToken });
  const convId = convos.data[0].id;

  // 1. Invalid token -> close 4001
  const wsBad = await connect(`${wsBase}/ws/chat/${convId}/?token=invalid`);
  const badClose = await waitClose(wsBad);
  check('invalid token closed 4001', badClose === 4001, `got ${badClose}`);

  // 2. Non-participant -> close 4003
  await api('POST', '/auth/register/', {
    body: { phone: '+998903333333', password: 'secret12', role: 'seller' },
  });
  const loginOther = await api('POST', '/auth/login/', { body: { phone: '+998903333333', password: 'secret12' } });
  const wsOther = await connect(
    `${wsBase}/ws/chat/${convId}/?token=${encodeURIComponent(loginOther.data.access)}`
  );
  const otherClose = await waitClose(wsOther);
  check('non-participant closed 4003', otherClose === 4003, `got ${otherClose}`);

  // 3. Real chat: master + client connected, master sends, both receive
  const wsClient = await connect(`${wsBase}/ws/chat/${convId}/?token=${encodeURIComponent(clientToken)}`);
  const wsMaster = await connect(`${wsBase}/ws/chat/${convId}/?token=${encodeURIComponent(masterToken)}`);

  const clientMessages = [];
  const masterMessages = [];
  wsClient.on('message', (raw) => clientMessages.push(JSON.parse(raw.toString())));
  wsMaster.on('message', (raw) => masterMessages.push(JSON.parse(raw.toString())));

  await new Promise((r) => setTimeout(r, 400));

  wsMaster.send(JSON.stringify({ type: 'message', text: 'Assalomu alaykum!' }));

  await new Promise((r) => setTimeout(r, 700));

  check('client received ws message', clientMessages.length === 1, JSON.stringify(clientMessages));
  check('master received ws message', masterMessages.length === 1);
  const msg = clientMessages[0];
  check(
    'ws message shape',
    msg.type === 'message' &&
      msg.message.text === 'Assalomu alaykum!' &&
      typeof msg.message.sender === 'string' &&
      msg.message.sender.length > 0 &&
      typeof msg.message.id === 'string' &&
      !!msg.message.created_at,
    JSON.stringify(msg)
  );

  // 4. Message persisted via REST
  const msgs = await api('GET', `/chat/conversations/${convId}/messages/`, { token: clientToken });
  check('message persisted', msgs.status === 200 && msgs.data.length === 1 && msgs.data[0].text === 'Assalomu alaykum!');

  // 5. Empty text ignored
  wsMaster.send(JSON.stringify({ type: 'message', text: '   ' }));
  await new Promise((r) => setTimeout(r, 500));
  check('empty text not saved', clientMessages.length === 1);

  wsClient.close();
  wsMaster.close();

  console.log(`\n=== WS Natija: ${passed} PASS, ${failed} FAIL ===`);
  await server.close();
  await mongod.stop();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('WS TEST HATOLIK:', err);
  process.exit(1);
});
