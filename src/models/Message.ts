import { Schema, model, Document } from 'mongoose';

export interface IMessage extends Document {
  conversation: any;
  sender: any;
  text: string;
  is_read: boolean;
  reply_to: any;
  edited: boolean;
  created_at: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    is_read: { type: Boolean, default: false },
    reply_to: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    edited: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

messageSchema.index({ conversation: 1, created_at: 1 });

messageSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

export default model<IMessage>('Message', messageSchema);
