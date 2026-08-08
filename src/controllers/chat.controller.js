const { Conversation, Message } = require('../models');
const { ApiError, asyncHandler } = require('../utils/http');
const { conversationSerializer, messageSerializer } = require('../utils/serializers');

const USER_FIELDS = 'phone username role avatar language theme location_lat location_lng first_name last_name';

const isParticipant = (conversation, userId) =>
  conversation &&
  (String(conversation.client._id || conversation.client) === String(userId) ||
    String(conversation.master._id || conversation.master) === String(userId));

async function enrichConversations(conversations, user) {
  const result = [];
  for (const conv of conversations) {
    const last = await Message.findOne({ conversation: conv._id }).sort({ created_at: 1 });
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

const conversations = asyncHandler(async (req, res) => {
  let list = await Conversation.find({
    $or: [{ client: req.user._id }, { master: req.user._id }],
  })
    .sort({ updated_at: -1 })
    .populate('order', 'title status')
    .populate('client', USER_FIELDS)
    .populate('master', USER_FIELDS);

  list = await enrichConversations(list, req.user);
  res.json(list.map((c) => conversationSerializer(c, req.user)));
});

const getConversationOrThrow = async (id, user) => {
  const conv = await Conversation.findById(id)
    .populate('order', 'title status')
    .populate('client', USER_FIELDS)
    .populate('master', USER_FIELDS);
  if (!isParticipant(conv, user._id)) {
    throw new ApiError(404, 'Suhbat topilmadi yoki siz ishtirokchi emassiz');
  }
  return conv;
};

const messages = asyncHandler(async (req, res) => {
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

const sendMessage = asyncHandler(async (req, res) => {
  const conv = await getConversationOrThrow(req.params.id, req.user);
  const text = String(req.body.text || '').trim();
  if (!text) {
    throw new ApiError(400, 'Xabar bo\'sh bo\'lishi mumkin emas');
  }
  const message = await Message.create({
    conversation: conv._id,
    sender: req.user._id,
    text,
  });
  const populated = await Message.findById(message._id).populate('sender', USER_FIELDS);
  res.status(201).json(messageSerializer(populated));
});

module.exports = { conversations, messages, sendMessage };
