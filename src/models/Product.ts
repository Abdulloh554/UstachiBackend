import { Schema, model, Document } from 'mongoose';

export interface IProduct extends Document {
  store: any;
  name: string;
  description: string;
  category: string;
  price: number;
  cost_price: number;
  quantity: number;
  image: string | null;
  created_at: Date;
}

const productSchema = new Schema<IProduct>(
  {
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: '' },
    price: { type: Number, required: true },
    cost_price: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    image: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

productSchema.index({ created_at: -1 });

productSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IProduct>('Product', productSchema);
