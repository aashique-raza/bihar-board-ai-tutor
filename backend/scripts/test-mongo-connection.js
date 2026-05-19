import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';

let isConnected = false;

try {
  await connectDB();
  isConnected = true;
  console.log('MongoDB connection test passed.');
} catch (error) {
  console.error(`MongoDB connection test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (isConnected) {
    await disconnectDB();
  }
}
