const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

cartItemSchema.index({ user: 1, product: 1 }, { unique: true });

cartItemSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('CartItem', cartItemSchema);
