const mongoose = require('mongoose');
const { ORDER_STATUSES } = require('../config/constants');

const orderSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    master: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    title: { type: String, required: true },
    description: { type: String, required: true },
    profession: { type: mongoose.Schema.Types.ObjectId, ref: 'Profession', default: null },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUSES),
      default: ORDER_STATUSES.NEW,
    },
    location_lat: { type: Number, required: true },
    location_lng: { type: Number, required: true },
    address: { type: String, default: '' },
    price: { type: Number, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

orderSchema.index({ created_at: -1 });

orderSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Order', orderSchema);
