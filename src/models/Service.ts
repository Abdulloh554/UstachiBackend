import { Schema, model, Document } from 'mongoose';

export interface IService extends Document {
  workshop: any;
  name: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: Date;
}

const serviceSchema = new Schema<IService>(
  {
    workshop: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    duration_minutes: { type: Number, default: 60 },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

serviceSchema.index({ workshop: 1, is_active: 1 });

serviceSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IService>('Service', serviceSchema);
