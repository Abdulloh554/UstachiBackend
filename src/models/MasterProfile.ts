import { Schema, model, Document } from 'mongoose';
import { MASTER_CONSTANTS } from '../config/constants';

export interface IMasterProfile extends Document {
  user: any;
  professions: any[];
  bio: string;
  rating: number;
  rating_count: number;
  is_available: boolean;
  experience_years: number;
  balance: number;
}

const masterProfileSchema = new Schema<IMasterProfile>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    professions: [{ type: Schema.Types.ObjectId, ref: 'Profession' }],
    bio: { type: String, default: '' },
    rating: { type: Number, default: 0 },
    rating_count: { type: Number, default: 0 },
    is_available: { type: Boolean, default: true },
    experience_years: { type: Number, default: 0 },
    balance: { type: Number, default: MASTER_CONSTANTS.INITIAL_BALANCE },
  },
  { timestamps: false }
);

masterProfileSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IMasterProfile>('MasterProfile', masterProfileSchema);
