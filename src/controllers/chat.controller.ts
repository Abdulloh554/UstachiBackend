import { Request, Response } from 'express';
import { Conversation, Message } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import { conversationSerializer, messageSerializer } from '../utils/serializers';
import { publishMessage } from '../ws/chat';

const USER_FIELDS = 'phone username role avatar language theme location_lat location_lng first_name last_name';

const isParticipant = (conversation: any, userId: any) =>
  conversation &&
  (String(conversation.client._id || conversation.client) === String(userId) ||
    String(conversation.master._id || conversation.master) === String(userId));

async function enrichConversations(conversations: any[], user: any) {
  const result: any[] = [];
  for (const conv of conversations) {
    const last = await Message.findOne({ conversation: conv._id }).sort({ created_at: -1 });
    const unread = await Message.countDocuments({
      conversation: conv._id,
      is_read: false,
      sender: { $ne: user._id },
    });
    conv.last_message = last;
    conv.unread_count = unread;
    result.push(conv);
  }
  return result;
}

export const conversations = asyncHandler(async (req: Request, res: Response) => {
  let list: any[] = await Conversation.find({
    $or: [{ client: req.user._id }, { master: req.user._id }],
  })
    .sort({ updated_at: -1 })
    .populate('order', 'title status')
    .populate('client', USER_FIELDS)
    .populate('master', USER_FIELDS);

  list = await enrichConversations(list, req.user);
  res.json(list.map((c) => conversationSerializer(c, req.user)));
});

const getConversationOrThrow = async (id: string, user: any): Promise<any> => {
  const conv = await Conversation.findById(id)
    .populate('order', 'title status')
    .populate('client', USER_FIELDS)
    .populate('master', USER_FIELDS);
  if (!isParticipant(conv, user._id)) {
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
  const message = await Message.create({
    conversation: conv._id,
    sender: req.user._id,
    text,
  });
  conv.updated_at = new Date();
  await conv.save();
  const populated = await Message.findById(message._id).populate('sender', USER_FIELDS);
  publishMessage(conv._id, populated, req.user);
  res.status(201).json(messageSerializer(populated));
});
