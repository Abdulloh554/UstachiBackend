import { Schema, model, Document } from 'mongoose';
import { ORDER_STATUSES } from '../config/constants';

export interface IOrder extends Document {
  workshop: any;
  client: any;
  client_name: string;
  client_phone: string;
  assigned_staff: any;
  service: any;
  service_type: string;
  description: string;
  price: number | null;
  status: string;
  queue_number: number;
  scheduled_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_reason: string;
  no_show_at: Date | null;
  address: string;
  created_at: Date;
  updated_at: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    workshop: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    client: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    client_name: { type: String, default: '' },
    client_phone: { type: String, default: '' },
    assigned_staff: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    service: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
    service_type: { type: String, default: '' },
    description: { type: String, default: '' },
    price: { type: Number, default: null },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUSES),
      default: ORDER_STATUSES.QUEUED,
    },
    queue_number: { type: Number, default: 0 },
    scheduled_at: { type: Date, default: null },
    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    cancelled_reason: { type: String, default: '' },
    no_show_at: { type: Date, default: null },
    address: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

orderSchema.index({ workshop: 1, created_at: -1 });
orderSchema.index({ workshop: 1, status: 1 });
orderSchema.index({ assigned_staff: 1, status: 1 });
orderSchema.index({ client: 1, created_at: -1 });

orderSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IOrder>('Order', orderSchema);
