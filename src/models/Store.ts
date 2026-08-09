import { Schema, model, Document } from 'mongoose';

export interface IStore extends Document {
  user: any;
  name: string;
  description: string;
  category: string;
  phone: string;
  address: string;
  logo: string | null;
  balance: number;
  created_at: Date;
}

const storeSchema = new Schema<IStore>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    logo: { type: String, default: null },
    balance: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

storeSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IStore>('Store', storeSchema);
