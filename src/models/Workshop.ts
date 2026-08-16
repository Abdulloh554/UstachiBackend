import { Schema, model, Document, Model } from 'mongoose';

export interface IWorkshop extends Document {
  name: string;
  address: string;
  phone: string;
  owner: any;
  work_schedule: string;
  created_at: Date;
}

interface WorkshopModel extends Model<IWorkshop> {
  getPrimary(): Promise<IWorkshop>;
}

const workshopSchema = new Schema<IWorkshop>(
  {
    name: { type: String, required: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    work_schedule: { type: String, default: 'Du — Sha: 09:00–18:00' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

workshopSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

// Yagona ustaxona konsepsiyasi: birinchi yaratilgan ustaxona "asosiy" hisoblanadi.
// Mijozlar buyurtma yaratishda aynan shunga murojaat qiladi.
workshopSchema.statics.getPrimary = async function (): Promise<IWorkshop> {
  return this.findOne().sort({ created_at: 1 });
};

export default model<IWorkshop, WorkshopModel>('Workshop', workshopSchema);
