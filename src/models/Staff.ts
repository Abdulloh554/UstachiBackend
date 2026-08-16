import { Schema, model, Document } from 'mongoose';

export interface IStaff extends Document {
  user: any;
  workshop: any;
  specializations: string[];
  is_available: boolean;
  experience_years: number;
  created_at: Date;
}

const staffSchema = new Schema<IStaff>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    workshop: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    specializations: { type: [String], default: [] },
    is_available: { type: Boolean, default: true },
    experience_years: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

staffSchema.index({ workshop: 1, is_available: 1 });

staffSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IStaff>('Staff', staffSchema);
