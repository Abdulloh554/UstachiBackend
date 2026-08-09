import { Schema, model, Document } from 'mongoose';

export interface IOrderStatusLog extends Document {
  order: any;
  from_status: string | null;
  to_status: string;
  changed_by: any;
  created_at: Date;
}

const orderStatusLogSchema = new Schema<IOrderStatusLog>(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    from_status: { type: String, default: null },
    to_status: { type: String, required: true },
    changed_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

orderStatusLogSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IOrderStatusLog>('OrderStatusLog', orderStatusLogSchema);
