import { Request, Response } from 'express';
import { User, MasterProfile, Order } from '../models';
import { ORDER_STATUSES } from '../config/constants';
import { asyncHandler } from '../utils/http';
import { userSerializer, masterProfileSerializer, orderSerializer } from '../utils/serializers';
import { parsePage } from '../utils/pagination';
import { populateOrder, attachOrderMeta } from './orders.controller';

const USER_FIELDS = 'phone username role avatar language theme location_lat location_lng first_name last_name';

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const [total_users, total_masters, total_clients, total_sellers, total_orders, active_masters] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'master' }),
      User.countDocuments({ role: 'client' }),
      User.countDocuments({ role: 'seller' }),
      Order.countDocuments(),
      MasterProfile.countDocuments({ is_available: true }),
    ]);

  const ordersByStatus: Record<string, number> = {};
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

export const users = asyncHandler(async (req: Request, res: Response) => {
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

export const masters = asyncHandler(async (req: Request, res: Response) => {
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

export const orders = asyncHandler(async (req: Request, res: Response) => {
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

export const map = asyncHandler(async (req: Request, res: Response) => {
  const [orders, locatedUsers, profiles] = await Promise.all([
    Order.find({ status: { $nin: [ORDER_STATUSES.COMPLETED, ORDER_STATUSES.FAILED] } })
      .populate('client', 'phone')
      .populate('master', 'phone'),
    User.find({ location_lat: { $ne: null }, location_lng: { $ne: null } }).select(
      'phone location_lat location_lng'
    ),
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
      client__phone: o.client ? (o.client as any).phone : null,
      master__phone: o.master ? (o.master as any).phone : null,
    })),
    masters: mastersList.map((m) => {
      const u = userById.get(String(m.user));
      return {
        user__phone: u ? (u as any).phone : null,
        user__location_lat: u ? (u as any).location_lat : null,
        user__location_lng: u ? (u as any).location_lng : null,
        is_available: m.is_available,
        rating: m.rating,
      };
    }),
  });
});
