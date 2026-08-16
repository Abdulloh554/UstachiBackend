const money = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n.toFixed(2);
};

const userSerializer = (user: any) => {
  if (!user) return null;
  const obj = user._doc || user;
  return {
    id: String(obj._id),
    phone: obj.phone,
    username: obj.username,
    role: obj.role,
    avatar: obj.avatar,
    language: obj.language,
    theme: obj.theme,
    first_name: obj.first_name,
    last_name: obj.last_name,
  };
};

const workshopSerializer = (workshop: any) => {
  if (!workshop) return null;
  const obj = workshop._doc || workshop;
  let ownerName: string | null = null;
  if (obj.owner && obj.owner._doc) {
    ownerName = [obj.owner.first_name, obj.owner.last_name].filter(Boolean).join(' ').trim() || obj.owner.phone;
  }
  return {
    id: String(obj._id),
    name: obj.name,
    address: obj.address,
    phone: obj.phone,
    work_schedule: obj.work_schedule,
    owner: obj.owner ? String(obj.owner._id || obj.owner) : null,
    owner_name: ownerName,
    created_at: obj.created_at,
  };
};

const serviceSerializer = (service: any) => {
  if (!service) return null;
  const obj = service._doc || service;
  return {
    id: String(obj._id),
    name: obj.name,
    price: money(obj.price),
    duration_minutes: obj.duration_minutes,
    is_active: obj.is_active,
  };
};

const staffSerializer = (staff: any) => {
  if (!staff) return null;
  const obj = staff._doc || staff;
  const user = obj.user && obj.user._doc ? obj.user : null;
  return {
    id: String(obj._id),
    user: userSerializer(obj.user),
    staff_name: user ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.phone : obj.user ? String(obj.user._id || obj.user) : '',
    phone: user ? user.phone : '',
    specializations: obj.specializations || [],
    is_available: obj.is_available,
    experience_years: obj.experience_years,
    workshop: obj.workshop ? String(obj.workshop._id || obj.workshop) : null,
    created_at: obj.created_at,
  };
};

const orderSerializer = (order: any) => {
  if (!order) return null;
  const obj = order._doc || order;
  return {
    id: String(obj._id),
    workshop: obj.workshop ? String(obj.workshop._id || obj.workshop) : null,
    client: obj.client ? String(obj.client._id || obj.client) : null,
    client_details: userSerializer(obj.client_details || obj.client),
    client_name: obj.client_name,
    client_phone: obj.client_phone,
    assigned_staff: obj.assigned_staff ? String(obj.assigned_staff._id || obj.assigned_staff) : null,
    assigned_staff_details: userSerializer(obj.assigned_staff_details || obj.assigned_staff),
    service: obj.service ? String(obj.service._id || obj.service) : null,
    service_details: serviceSerializer(obj.service_details || obj.service),
    service_type: obj.service_type,
    description: obj.description,
    price: money(obj.price),
    estimated_duration_minutes: obj.estimated_duration_minutes ?? null,
    urgency: obj.urgency ?? null,
    status: obj.status,
    queue_number: obj.queue_number,
    scheduled_at: obj.scheduled_at,
    started_at: obj.started_at,
    completed_at: obj.completed_at,
    cancelled_reason: obj.cancelled_reason,
    no_show_at: obj.no_show_at,
    address: obj.address,
    created_at: obj.created_at,
    updated_at: obj.updated_at,
    conversation_id: obj.conversation_id ? String(obj.conversation_id) : null,
  };
};

const productSerializer = (product: any) => {
  if (!product) return null;
  const obj = product._doc || product;
  return {
    id: String(obj._id),
    workshop: obj.workshop ? String(obj.workshop._id || obj.workshop) : null,
    name: obj.name,
    description: obj.description,
    category: obj.category,
    price: money(obj.price),
    cost_price: money(obj.cost_price),
    quantity: obj.quantity,
    min_threshold: obj.min_threshold,
    unit: obj.unit,
    low_stock: obj.min_threshold > 0 && obj.quantity <= obj.min_threshold,
    image: obj.image,
    created_at: obj.created_at,
  };
};

const saleItemSerializer = (item: any) => {
  if (!item) return null;
  const obj = item._doc || item;
  return {
    product: obj.product ? String(obj.product._id || obj.product) : null,
    product_name: obj.product && obj.product.name,
    quantity: obj.quantity,
    unit_price: money(obj.unit_price),
    unit_cost: money(obj.unit_cost),
    line_total: money((obj.unit_price || 0) * (obj.quantity || 0)),
  };
};

const saleSerializer = (sale: any) => {
  if (!sale) return null;
  const obj = sale._doc || sale;
  return {
    id: String(obj._id),
    workshop: obj.workshop ? String(obj.workshop._id || obj.workshop) : null,
    order: obj.order ? String(obj.order._id || obj.order) : null,
    staff: obj.staff ? String(obj.staff._id || obj.staff) : null,
    amount: money(obj.amount),
    payment_method: obj.payment_method,
    items: (obj.items || []).map(saleItemSerializer),
    created_at: obj.created_at,
  };
};

const messageSerializer = (message: any) => {
  if (!message) return null;
  const obj = message._doc || message;
  const sender = obj.sender_details || obj.sender || null;
  let senderName: string | null = null;
  let senderRole: string | null = null;
  if (sender && sender._doc) {
    senderName = [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() || sender.username || sender.phone;
    senderRole = sender.role;
  }
  return {
    id: String(obj._id),
    conversation: obj.conversation ? String(obj.conversation._id || obj.conversation) : null,
    sender: obj.sender ? String(obj.sender._id || obj.sender) : null,
    sender_details: userSerializer(sender),
    sender_name: senderName,
    sender_role: senderRole,
    text: obj.text,
    is_read: obj.is_read,
    edited: !!obj.edited,
    reply_to: obj.reply_to
      ? obj.reply_to._id
        ? { id: String(obj.reply_to._id), text: obj.reply_to.text }
        : String(obj.reply_to)
      : null,
    created_at: obj.created_at,
  };
};

const conversationSerializer = (conversation: any, currentUser?: any) => {
  if (!conversation) return null;
  const obj = conversation._doc || conversation;
  const clientId = obj.client ? String(obj.client._id || obj.client) : null;
  const masterId = obj.master ? String(obj.master._id || obj.master) : null;
  const meId = currentUser ? String(currentUser._id) : null;

  let other: any = null;
  if (meId && clientId === meId) other = obj.master;
  else other = obj.client;
  const otherId = other ? String(other._id || other) : null;
  let otherName: string | null = null;
  if (other && other._doc) {
    otherName = [other.first_name, other.last_name].filter(Boolean).join(' ').trim();
    if (!otherName) otherName = other.username || other.phone;
  }

  const last = obj.last_message || null;
  const unread = obj.unread_count || 0;
  const order = obj.order || null;

  return {
    id: String(obj._id),
    order: order ? String(order._id || order) : null,
    order_id: order ? String(order._id || order) : null,
    order_title: order ? order.service_type || order.description : null,
    order_status: order ? order.status : null,
    client: clientId,
    client_details: userSerializer(obj.client_details || obj.client),
    master: masterId,
    master_details: userSerializer(obj.master_details || obj.master),
    other_user_id: otherId,
    other_user_name: otherName,
    last_message: last ? last.text : null,
    last_message_at: last ? last.created_at : null,
    unread_count: unread,
    created_at: obj.created_at,
    updated_at: obj.updated_at,
  };
};

export {
  money,
  userSerializer,
  workshopSerializer,
  staffSerializer,
  serviceSerializer,
  orderSerializer,
  productSerializer,
  saleItemSerializer,
  saleSerializer,
  messageSerializer,
  conversationSerializer,
};
