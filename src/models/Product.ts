import { Schema, model, Document } from 'mongoose';

export interface IProduct extends Document {
  workshop: any;
  name: string;
  description: string;
  category: string;
  price: number;
  cost_price: number;
  quantity: number;
  min_threshold: number;
  unit: string;
  image: string | null;
  created_at: Date;
}

const productSchema = new Schema<IProduct>(
  {
    workshop: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: '' },
    price: { type: Number, required: true },
    cost_price: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    min_threshold: { type: Number, default: 0 },
    unit: { type: String, default: "dona" },
    image: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

productSchema.index({ workshop: 1, created_at: -1 });

productSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IProduct>('Product', productSchema);
