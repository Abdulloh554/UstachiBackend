import { Schema, model, Document } from 'mongoose';

export interface ICartItem extends Document {
  user: any;
  product: any;
  quantity: number;
  created_at: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

cartItemSchema.index({ user: 1, product: 1 }, { unique: true });

cartItemSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<ICartItem>('CartItem', cartItemSchema);
