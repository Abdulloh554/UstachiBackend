import { Schema, model, Document } from 'mongoose';

export interface ISale extends Document {
  workshop: any;
  order: any;
  staff: any;
  amount: number;
  payment_method: string;
  created_at: Date;
}

const saleSchema = new Schema<ISale>(
  {
    workshop: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    staff: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    amount: { type: Number, default: 0 },
    payment_method: { type: String, default: 'cash' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

saleSchema.index({ workshop: 1, created_at: -1 });
saleSchema.index({ order: 1 }, { unique: true, sparse: true });

saleSchema.virtual('items', {
  ref: 'SaleItem',
  localField: '_id',
  foreignField: 'sale',
});

saleSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<ISale>('Sale', saleSchema);
