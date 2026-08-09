import mongoose from 'mongoose';
import env from './env';

async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    console.log(`[db] MongoDB ulandi: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err: any) {
    console.error('[db] MongoDB ga ulanishda xatolik:', err?.message);
    throw err;
  }
}

export default connectDB;
