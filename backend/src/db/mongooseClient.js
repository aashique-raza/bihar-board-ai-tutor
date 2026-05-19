import mongoose from 'mongoose';

import { env } from '../config/env.js';

export const connectDB = async () => {
  if (!env.mongodbUri) {
    throw new Error('MongoDB URL is missing in .env file.');
  }

  await mongoose.connect(env.mongodbUri);

  console.log('MongoDB connected successfully.');
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  console.log('MongoDB disconnected.');
};
