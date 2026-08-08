const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { User, Conversation, Message } = require('../models');
const env = require('../config/env');

const rooms = new Map();

function roomOf(conversationId) {
  if (!rooms.has(conversationId)) {
    rooms.set(conversationId, new Set());
  }
  return rooms.get(conversationId);
}

function broadcast(conversationId, data) {
  const room = rooms.get(conversationId);
  if (!room) return;
  const payload = JSON.stringify(data);
  for (const ws of room) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

function parseQuery(queryString) {
  const params = new URLSearchParams(queryString || '');
  return params.get('token') || '';
}

async function authFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (!payload.user_id) return null;
    return await User.findById(payload.user_id);
  } catch (err) {
    return null;
  }
}

async function handleConnection(ws, conversationId, user) {
  ws.conversationId = conversationId;
  ws.userId = String(user._id);
  roomOf(conversationId).add(ws);

  ws.on('message', async (raw) => {
    let content;
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

      const senderName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.phone;

      broadcast(conversationId, {
        type: 'message',
        message: {
          id: String(message._id),
          conversation: String(conversationId),
          sender: String(user._id),
          sender_name: senderName,
          sender_role: user.role,
          text: message.text,
          is_read: message.is_read,
          created_at: message.created_at,
        },
      });
    } catch (err) {
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

function setupChatWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.match(/^\/ws\/chat\/[^/]+\/?$/)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, url);
    });
  });

  wss.on('connection', (ws, req, url) => {
    const match = url.pathname.match(/^\/ws\/chat\/([^/]+)\/?$/);
    const conversationId = match[1];
    const token = parseQuery(url.search);

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
          String(conversation.client._id || conversation.client) === String(user._id) ||
          String(conversation.master._id || conversation.master) === String(user._id);
        if (!participant) {
          ws.close(4003, 'Siz ishtirokchi emassiz');
          return;
        }
        handleConnection(ws, conversationId, user);
      })
      .catch(() => ws.close(4001));
  });

  return wss;
}

module.exports = { setupChatWebSocket, broadcast };
