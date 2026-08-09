import { Schema, model, Document } from 'mongoose';

export interface ISaleItem extends Document {
  sale: any;
  product: any;
  quantity: number;
  unit_price: number;
  unit_cost: number;
}

const saleItemSchema = new Schema<ISaleItem>(
  {
    sale: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    unit_price: { type: Number, required: true },
    unit_cost: { type: Number, default: 0 },
  },
  { timestamps: false }
);

saleItemSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<ISaleItem>('SaleItem', saleItemSchema);
