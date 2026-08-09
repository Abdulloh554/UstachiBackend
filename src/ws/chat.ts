import { Server } from 'http';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer, RawData } from 'ws';
import jwt from 'jsonwebtoken';
import { User, Conversation, Message } from '../models';
import env from '../config/env';

const rooms = new Map<string, Set<WebSocket>>();

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
      created_at: message.created_at,
    },
  });
}

function parseToken(req: IncomingMessage, url: URL): string {
  const queryToken = url.searchParams.get('token') || '';
  if (queryToken) return queryToken;
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function authFromToken(token: string): Promise<any | null> {
  if (!token) return null;
  try {
    const payload: any = jwt.verify(token, env.JWT_SECRET);
    if (!payload.user_id) return null;
    return await User.findById(payload.user_id);
  } catch (err) {
    return null;
  }
}

async function handleConnection(ws: WebSocket, conversationId: string, user: any): Promise<void> {
  (ws as any).conversationId = conversationId;
  (ws as any).userId = String(user._id);
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
    const room = rooms.get(conversationId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) rooms.delete(conversationId);
    }
  });
}

export function setupChatWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.match(/^\/ws\/chat\/[^/]+\/?$/)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, url);
    });
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage, url: URL) => {
    const match = url.pathname.match(/^\/ws\/chat\/([^/]+)\/?$/);
    const conversationId = match ? match[1] : '';
    const token = parseToken(req, url);

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
        const participant =
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
