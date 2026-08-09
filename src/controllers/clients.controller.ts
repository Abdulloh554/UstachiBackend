import { Request, Response } from 'express';
import { Order } from '../models';
import { asyncHandler } from '../utils/http';
import { orderSerializer } from '../utils/serializers';
import { populateOrder, attachOrderMeta } from './orders.controller';

export const myOrders = asyncHandler(async (req: Request, res: Response) => {
  const orders = await populateOrder(Order.find({ client: req.user._id }).sort({ created_at: -1 }));
  await attachOrderMeta(orders, req.user);
  res.json(orders.map((o) => orderSerializer(o, req.user)));
});
