import { Schema, model, Document } from 'mongoose';

export interface IProfession extends Document {
  name_uz: string;
  name_ru: string;
  icon: string;
}

const professionSchema = new Schema<IProfession>(
  {
    name_uz: { type: String, required: true },
    name_ru: { type: String, default: '' },
    icon: { type: String, default: '' },
  },
  { timestamps: false }
);

professionSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IProfession>('Profession', professionSchema);
