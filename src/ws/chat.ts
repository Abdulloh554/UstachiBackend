import { Server } from 'http';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer, RawData } from 'ws';
import jwt from 'jsonwebtoken';
import { User, Conversation, Message } from '../models';
import env from '../config/env';

const rooms = new Map<string, Set<WebSocket>>();
const connections = new Map<string, WebSocket>();
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_TOTAL_CONNECTIONS = 1_000;

function roomOf(conversationId: string): Set<WebSocket> {
  if (!rooms.has(conversationId)) {
    rooms.set(conversationId, new Set());
  }
  return rooms.get(conversationId)!;
}

function broadcast(conversationId: string, data: any): void {
  const room = rooms.get(conversationId);
  if (!room) return;
  const payload = JSON.stringify(data);
  for (const ws of room) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

function senderNameOf(user: any): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || user.phone;
}

export function publishMessage(conversationId: string, message: any, sender: any): void {
  const senderDoc = message.sender && message.sender._doc ? message.sender : sender;
  broadcast(conversationId, {
    type: 'message',
    message: {
      id: String(message._id),
      conversation: String(conversationId),
      sender: String(message.sender._id || message.sender),
      sender_name: senderNameOf(senderDoc),
      sender_role: senderDoc.role,
      text: message.text,
      is_read: message.is_read,
      edited: !!message.edited,
      reply_to: message.reply_to
        ? message.reply_to._id
          ? { id: String(message.reply_to._id), text: message.reply_to.text }
          : String(message.reply_to)
        : null,
      created_at: message.created_at,
    },
  });
}

export function publishChatEvent(conversationId: string, data: any): void {
  broadcast(conversationId, data);
}

function parseToken(req: IncomingMessage): string {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function authFromToken(token: string): Promise<any | null> {
  if (!token) return null;
  try {
    const payload: any = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload.user_id) return null;
    return await User.findById(payload.user_id);
  } catch (err) {
    return null;
  }
}

async function handleConnection(ws: WebSocket, conversationId: string, user: any): Promise<void> {
  const userId = String(user._id);
  (ws as any).conversationId = conversationId;
  (ws as any).userId = userId;
  const connKey = `${userId}:${conversationId}`;
  (ws as any).connKey = connKey;
  const existing = connections.get(connKey);
  if (existing && existing.readyState === existing.OPEN) {
    existing.close(4008, 'Dublikat ulanish yopildi');
  }
  connections.set(connKey, ws);
  roomOf(conversationId).add(ws);

  ws.on('message', async (raw: RawData) => {
    let content: any;
    try {
      content = JSON.parse(raw.toString());
    } catch (err) {
      return;
    }
    if (!content || content.type !== 'message') return;
    const text = String(content.text || '').trim();
    if (!text) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      ws.send(JSON.stringify({ type: 'error', error: `Xabar ${MAX_MESSAGE_LENGTH} belgidan uzun bo'lishi mumkin emas` }));
      return;
    }

    try {
      const message = await Message.create({
        conversation: conversationId,
        sender: user._id,
        text,
      });

      const populated = await Message.findById(message._id).populate(
        'sender',
        'first_name last_name username phone role'
      );

      await Conversation.updateOne({ _id: conversationId }, { updated_at: new Date() });

      publishMessage(conversationId, populated, user);
    } catch (err: any) {
      console.error('[ws] message error:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.error('[ws] socket error:', err.message);
  });

  ws.on('close', () => {
    if (connections.get((ws as any).connKey) === ws) {
      connections.delete((ws as any).connKey);
    }
    const room = rooms.get(conversationId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) rooms.delete(conversationId);
    }
  });
}

export function setupChatWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const allowedOrigins = env.CORS_ALLOWED_ORIGINS === '*'
    ? null
    : new Set(env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean));

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.match(/^\/ws\/chat\/[^/]+\/?$/)) {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (allowedOrigins && (!origin || !allowedOrigins.has(origin))) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, url);
    });
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage, url: URL) => {
    if (wss.clients.size > MAX_TOTAL_CONNECTIONS) {
      ws.close(4008, 'Server band, keyinroq urinib ko\'ring');
      return;
    }
    const match = url.pathname.match(/^\/ws\/chat\/([^/]+)\/?$/);
    const conversationId = match ? match[1] : '';
    const token = parseToken(req);

    authFromToken(token)
      .then(async (user) => {
        if (!user) {
          ws.close(4001, 'Avtorizatsiya talab qilinadi');
          return;
        }
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          ws.close(4003, 'Suhbat topilmadi');
          return;
        }
        const isAdmin = Boolean(user && (user.is_staff || user.role === 'admin'));
        const participant =
          isAdmin ||
          String((conversation.client as any)._id || conversation.client) === String(user._id) ||
          String((conversation.master as any)._id || conversation.master) === String(user._id);
        if (!participant) {
          ws.close(4003, 'Siz ishtirokchi emassiz');
          return;
        }
        await handleConnection(ws, conversationId, user);
      })
      .catch(() => ws.close(4001));
  });

  return wss;
}
