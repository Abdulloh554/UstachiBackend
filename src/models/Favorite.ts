import { Schema, model, Document } from 'mongoose';

export interface IFavorite extends Document {
  user: any;
  product: any;
  created_at: Date;
}

const favoriteSchema = new Schema<IFavorite>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

favoriteSchema.index({ user: 1, product: 1 }, { unique: true });
favoriteSchema.index({ created_at: -1 });

favoriteSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IFavorite>('Favorite', favoriteSchema);
