import { Schema, model, Document } from 'mongoose';

export interface ISale extends Document {
  user: any;
  store: any;
  total: number;
  created_at: Date;
}

const saleSchema = new Schema<ISale>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    total: { type: Number, required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

saleSchema.index({ created_at: -1 });

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
