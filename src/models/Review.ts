import { Schema, model, Document } from 'mongoose';

export interface IReview extends Document {
  order: any;
  client: any;
  master: any;
  rating: number;
  comment: string;
  created_at: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    master: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

reviewSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IReview>('Review', reviewSchema);
