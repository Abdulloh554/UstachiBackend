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
    location_lat: obj.location_lat,
    location_lng: obj.location_lng,
    first_name: obj.first_name,
    last_name: obj.last_name,
  };
};

const professionSerializer = (p: any) => {
  if (!p) return null;
  const obj = p._doc || p;
  return {
    id: String(obj._id),
    name_uz: obj.name_uz,
    name_ru: obj.name_ru,
    icon: obj.icon,
  };
};

const orderSerializer = (order: any, currentUser?: any) => {
  if (!order) return null;
  const obj = order._doc || order;
  let my_review: { rating: number; comment: string } | null = null;
  if (currentUser && String(obj.client._id || obj.client) === String(currentUser._id)) {
    const review = order._my_review || obj._my_review;
    if (review) my_review = { rating: review.rating, comment: review.comment };
  }
  const conversationId = order.conversation_id || obj.conversation_id;
  return {
    id: String(obj._id),
    client: obj.client ? String(obj.client._id || obj.client) : null,
    client_details: userSerializer(obj.client_details || obj.client),
    master: obj.master ? String(obj.master._id || obj.master) : null,
    master_details: userSerializer(obj.master_details || obj.master),
    title: obj.title,
    description: obj.description,
    profession: obj.profession ? String(obj.profession._id || obj.profession) : null,
    status: obj.status,
    location_lat: obj.location_lat,
    location_lng: obj.location_lng,
    address: obj.address,
    price: money(obj.price),
    created_at: obj.created_at,
    updated_at: obj.updated_at,
    my_review,
    conversation_id: conversationId ? String(conversationId) : null,
  };
};

const masterWorksSerializer = (order: any) => {
  if (!order) return null;
  const obj = order._doc || order;
  return {
    id: String(obj._id),
    title: obj.title,
    description: obj.description,
    address: obj.address,
    price: money(obj.price),
    status: obj.status,
    profession: professionSerializer(obj.profession),
    rating: obj.rating !== undefined ? obj.rating : null,
    created_at: obj.created_at,
  };
};

const masterListSerializer = (profile: any) => {
  if (!profile) return null;
  const obj = profile._doc || profile;
  return {
    id: String(obj._id),
    user: userSerializer(obj.user),
    professions: (obj.professions || []).map(professionSerializer),
    bio: obj.bio,
    rating: obj.rating,
    rating_count: obj.rating_count,
    is_available: obj.is_available,
    experience_years: obj.experience_years,
  };
};

const masterProfileSerializer = (profile: any) => {
  if (!profile) return null;
  const obj = profile._doc || profile;
  return {
    id: String(obj._id),
    user: userSerializer(obj.user),
    professions: (obj.professions || []).map(professionSerializer),
    bio: obj.bio,
    rating: obj.rating,
    rating_count: obj.rating_count,
    is_available: obj.is_available,
    experience_years: obj.experience_years,
    balance: money(obj.balance),
  };
};

const reviewSerializer = (review: any) => {
  if (!review) return null;
  const obj = review._doc || review;
  return {
    id: String(obj._id),
    order: obj.order ? String(obj.order._id || obj.order) : null,
    client: obj.client ? String(obj.client._id || obj.client) : null,
    master: obj.master ? String(obj.master._id || obj.master) : null,
    rating: obj.rating,
    comment: obj.comment,
    created_at: obj.created_at,
  };
};

const masterReviewSerializer = (review: any) => {
  if (!review) return null;
  const obj = review._doc || review;
  return {
    id: String(obj._id),
    order: obj.order ? String(obj.order._id || obj.order) : null,
    order_title: obj.order && obj.order.title,
    client_name: obj.client && (obj.client.first_name || ''),
    client_phone: obj.client && obj.client.phone,
    rating: obj.rating,
    comment: obj.comment,
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
    order_title: order ? order.title : null,
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

const storeSerializer = (store: any) => {
  if (!store) return null;
  const obj = store._doc || store;
  let ownerName: string | null = null;
  if (obj.user && obj.user._doc) {
    ownerName = [obj.user.first_name, obj.user.last_name].filter(Boolean).join(' ').trim();
  }
  return {
    id: String(obj._id),
    name: obj.name,
    description: obj.description,
    category: obj.category,
    phone: obj.phone,
    address: obj.address,
    logo: obj.logo,
    balance: money(obj.balance),
    owner_name: ownerName,
    created_at: obj.created_at,
  };
};

const productSerializer = (product: any) => {
  if (!product) return null;
  const obj = product._doc || product;
  return {
    id: String(obj._id),
    store: obj.store ? String(obj.store._id || obj.store) : null,
    store_name: obj.store && obj.store.name,
    name: obj.name,
    description: obj.description,
    category: obj.category,
    price: money(obj.price),
    cost_price: money(obj.cost_price),
    quantity: obj.quantity,
    image: obj.image,
    created_at: obj.created_at,
  };
};

const favoriteSerializer = (favorite: any) => {
  if (!favorite) return null;
  const obj = favorite._doc || favorite;
  return {
    id: String(obj._id),
    product: productSerializer(obj.product),
    created_at: obj.created_at,
  };
};

const cartItemSerializer = (item: any) => {
  if (!item) return null;
  const obj = item._doc || item;
  return {
    id: String(obj._id),
    product: productSerializer(obj.product),
    quantity: obj.quantity,
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
    store: obj.store ? String(obj.store._id || obj.store) : null,
    store_name: obj.store && obj.store.name,
    total: money(obj.total),
    items: (obj.items || []).map(saleItemSerializer),
    created_at: obj.created_at,
  };
};

export {
  money,
  userSerializer,
  professionSerializer,
  orderSerializer,
  masterWorksSerializer,
  masterListSerializer,
  masterProfileSerializer,
  reviewSerializer,
  masterReviewSerializer,
  messageSerializer,
  conversationSerializer,
  storeSerializer,
  productSerializer,
  favoriteSerializer,
  cartItemSerializer,
  saleItemSerializer,
  saleSerializer,
};
