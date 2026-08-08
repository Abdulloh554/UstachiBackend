const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

favoriteSchema.index({ user: 1, product: 1 }, { unique: true });
favoriteSchema.index({ created_at: -1 });

favoriteSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Favorite', favoriteSchema);
