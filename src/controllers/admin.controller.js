const { User, MasterProfile, Order } = require('../models');
const { ORDER_STATUSES } = require('../config/constants');
const { asyncHandler } = require('../utils/http');
const { userSerializer, masterProfileSerializer, orderSerializer } = require('../utils/serializers');
const { parsePage } = require('../utils/pagination');
const { populateOrder, attachOrderMeta } = require('./orders.controller');

const USER_FIELDS = 'phone username role avatar language theme location_lat location_lng first_name last_name';

const dashboard = asyncHandler(async (req, res) => {
  const [
    total_users,
    total_masters,
    total_clients,
    total_sellers,
    total_orders,
    active_masters,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'master' }),
    User.countDocuments({ role: 'client' }),
    User.countDocuments({ role: 'seller' }),
    Order.countDocuments(),
    MasterProfile.countDocuments({ is_available: true }),
  ]);

  const ordersByStatus = {};
  await Promise.all(
    Object.values(ORDER_STATUSES).map(async (status) => {
      ordersByStatus[status] = await Order.countDocuments({ status });
    })
  );

  res.json({
    total_users,
    total_masters,
    total_clients,
    total_sellers,
    total_orders,
    orders_by_status: ordersByStatus,
    active_masters,
  });
});

const users = asyncHandler(async (req, res) => {
  const { page, pageSize, skip } = parsePage(req);
  const [total, docs] = await Promise.all([
    User.countDocuments(),
    User.find().sort({ created_at: 1 }).skip(skip).limit(pageSize),
  ]);
  res.json({
    count: total,
    next: page * pageSize < total ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
    results: docs.map(userSerializer),
  });
});

const masters = asyncHandler(async (req, res) => {
  const { page, pageSize, skip } = parsePage(req);
  const [total, docs] = await Promise.all([
    MasterProfile.countDocuments(),
    MasterProfile.find()
      .populate('user', USER_FIELDS)
      .populate('professions')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(pageSize),
  ]);
  res.json({
    count: total,
    next: page * pageSize < total ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
    results: docs.map(masterProfileSerializer),
  });
});

const orders = asyncHandler(async (req, res) => {
  const { page, pageSize, skip } = parsePage(req);
  const [total, docs] = await Promise.all([
    Order.countDocuments(),
    populateOrder(Order.find().sort({ created_at: -1 }).skip(skip).limit(pageSize)),
  ]);
  await attachOrderMeta(docs, req.user);
  res.json({
    count: total,
    next: page * pageSize < total ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
    results: docs.map((o) => orderSerializer(o, req.user)),
  });
});

const map = asyncHandler(async (req, res) => {
  const [orders, locatedUsers, profiles] = await Promise.all([
    Order.find({
      status: { $nin: [ORDER_STATUSES.COMPLETED, ORDER_STATUSES.FAILED] },
    }).populate('client', 'phone').populate('master', 'phone'),
    User.find({ location_lat: { $ne: null }, location_lng: { $ne: null } }).select('phone location_lat location_lng'),
    MasterProfile.find(),
  ]);

  const userById = new Map(locatedUsers.map((u) => [String(u._id), u]));
  const mastersList = profiles.filter((p) => userById.has(String(p.user)));

  res.json({
    orders: orders.map((o) => ({
      id: String(o._id),
      title: o.title,
      status: o.status,
      location_lat: o.location_lat,
      location_lng: o.location_lng,
      address: o.address,
      client__phone: o.client ? o.client.phone : null,
      master__phone: o.master ? o.master.phone : null,
    })),
    masters: mastersList.map((m) => {
      const u = userById.get(String(m.user));
      return {
        user__phone: u ? u.phone : null,
        user__location_lat: u ? u.location_lat : null,
        user__location_lng: u ? u.location_lng : null,
        is_available: m.is_available,
        rating: m.rating,
      };
    }),
  });
});

module.exports = { dashboard, users, masters, orders, map };
