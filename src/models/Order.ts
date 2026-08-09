import { Schema, model, Document } from 'mongoose';
import { ORDER_STATUSES } from '../config/constants';

export interface IOrder extends Document {
  client: any;
  master: any;
  title: string;
  description: string;
  profession: any;
  status: string;
  location_lat: number;
  location_lng: number;
  address: string;
  price: number | null;
  created_at: Date;
  updated_at: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    master: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    title: { type: String, required: true },
    description: { type: String, required: true },
    profession: { type: Schema.Types.ObjectId, ref: 'Profession', default: null },
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
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IOrder>('Order', orderSchema);
