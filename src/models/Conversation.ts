import { Schema, model, Document } from 'mongoose';

export interface IConversation extends Document {
  order: any;
  client: any;
  master: any;
  created_at: Date;
  updated_at: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    master: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

conversationSchema.index({ updated_at: -1 });

conversationSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IConversation>('Conversation', conversationSchema);
