const { Order } = require('../models');
const { asyncHandler } = require('../utils/http');
const { orderSerializer } = require('../utils/serializers');
const { populateOrder, attachOrderMeta } = require('./orders.controller');

const myOrders = asyncHandler(async (req, res) => {
  const orders = await populateOrder(
    Order.find({ client: req.user._id }).sort({ created_at: -1 })
  );
  await attachOrderMeta(orders, req.user);
  res.json(orders.map((o) => orderSerializer(o, req.user)));
});

module.exports = { myOrders };
