import { Request, Response } from 'express';
import { Conversation, Message } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import { conversationSerializer, messageSerializer } from '../utils/serializers';
import { publishMessage, publishChatEvent } from '../ws/chat';

const USER_FIELDS = 'phone username role avatar language theme location_lat location_lng first_name last_name';
const MAX_MESSAGE_LENGTH = 2_000;

const isParticipant = (conversation: any, userId: any) =>
  conversation &&
  (String(conversation.client._id || conversation.client) === String(userId) ||
    String(conversation.master._id || conversation.master) === String(userId));

async function enrichConversations(conversations: any[], user: any) {
  const ids = conversations.map((c) => c._id);
  if (!ids.length) return conversations;

  const [lastMessages, unreadCounts] = await Promise.all([
    Message.aggregate([
      { $match: { conversation: { $in: ids } } },
      { $sort: { created_at: -1 } },
      { $group: { _id: '$conversation', doc: { $first: '$$ROOT' } } },
    ]),
    Message.aggregate([
      { $match: { conversation: { $in: ids }, is_read: false, sender: { $ne: user._id } } },
      { $group: { _id: '$conversation', count: { $sum: 1 } } },
    ]),
  ]);

  const lastByConv = new Map(lastMessages.map((m) => [String(m._id), m.doc]));
  const unreadByConv = new Map(unreadCounts.map((u) => [String(u._id), u.count]));

  for (const conv of conversations) {
    conv.last_message = lastByConv.get(String(conv._id)) || null;
    conv.unread_count = unreadByConv.get(String(conv._id)) || 0;
  }
  return conversations;
}

export const conversations = asyncHandler(async (req: Request, res: Response) => {
  let list: any[] = await Conversation.find({
    $or: [{ client: req.user._id }, { master: req.user._id }],
  })
    .sort({ updated_at: -1 })
    .populate('order', 'status queue_number service_type')
    .populate('client', USER_FIELDS)
    .populate('master', USER_FIELDS);

  list = await enrichConversations(list, req.user);
  res.json(list.map((c) => conversationSerializer(c, req.user)));
});

const getConversationOrThrow = async (id: string, user: any): Promise<any> => {
  const conv = await Conversation.findById(id)
    .populate('order', 'status queue_number service_type')
    .populate('client', USER_FIELDS)
    .populate('master', USER_FIELDS);
  const isAdmin = Boolean(user && (user.is_staff || user.role === 'admin'));
  if (!isAdmin && !isParticipant(conv, user._id)) {
    throw new ApiError(404, 'Suhbat topilmadi yoki siz ishtirokchi emassiz');
  }
  return conv;
};

export const messages = asyncHandler(async (req: Request, res: Response) => {
  const conv = await getConversationOrThrow(req.params.id, req.user);

  await Message.updateMany(
    { conversation: conv._id, is_read: false, sender: { $ne: req.user._id } },
    { is_read: true }
  );

  const list = await Message.find({ conversation: conv._id })
    .sort({ created_at: 1 })
    .populate('sender', USER_FIELDS);
  res.json(list.map(messageSerializer));
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const conv: any = await getConversationOrThrow(req.params.id, req.user);
  const text = String(req.body.text || '').trim();
  if (!text) {
    throw new ApiError(400, "Xabar bo'sh bo'lishi mumkin emas");
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(400, `Xabar ${MAX_MESSAGE_LENGTH} belgidan uzun bo'lishi mumkin emas`);
  }
  let replyTo: any = null;
  if (req.body.reply_to) {
    replyTo = await Message.findOne({
      _id: String(req.body.reply_to),
      conversation: conv._id,
    });
    if (!replyTo) {
      throw new ApiError(400, 'Javob xabari topilmadi');
    }
  }
  const message = await Message.create({
    conversation: conv._id,
    sender: req.user._id,
    text,
    reply_to: replyTo ? replyTo._id : null,
  });
  conv.updated_at = new Date();
  await conv.save();
  const populated = await Message.findById(message._id)
    .populate('sender', USER_FIELDS)
    .populate('reply_to', 'text');
  publishMessage(conv._id, populated, req.user);
  res.status(201).json(messageSerializer(populated));
});

export const editMessage = asyncHandler(async (req: Request, res: Response) => {
  const conv: any = await getConversationOrThrow(req.params.id, req.user);
  const text = String(req.body.text || '').trim();
  if (!text) {
    throw new ApiError(400, "Xabar bo'sh bo'lishi mumkin emas");
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(400, `Xabar ${MAX_MESSAGE_LENGTH} belgidan uzun bo'lishi mumkin emas`);
  }
  const message = await Message.findOne({
    _id: req.params.mid,
    conversation: conv._id,
    sender: req.user._id,
  });
  if (!message) {
    throw new ApiError(404, "Xabar topilmadi yoki tahrirlashga ruxsat yo'q");
  }
  message.text = text;
  message.edited = true;
  await message.save();
  const populated = await Message.findById(message._id)
    .populate('sender', USER_FIELDS)
    .populate('reply_to', 'text');
  publishChatEvent(conv._id, { type: 'message_edited', message: messageSerializer(populated) });
  res.json(messageSerializer(populated));
});

export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
  const conv: any = await getConversationOrThrow(req.params.id, req.user);
  const message = await Message.findOne({
    _id: req.params.mid,
    conversation: conv._id,
    sender: req.user._id,
  });
  if (!message) {
    throw new ApiError(404, "Xabar topilmadi yoki o'chirishga ruxsat yo'q");
  }
  await message.deleteOne();
  publishChatEvent(conv._id, { type: 'message_deleted', id: String(message._id) });
  res.json({ ok: true });
});
