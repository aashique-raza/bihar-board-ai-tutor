import jwt from 'jsonwebtoken';

// Signs a short-lived access token for the given userId
export const generateAccessToken = (userId) => {
  const secret = process.env.JWT_ACCESS_SECRET;
  const expiry = process.env.JWT_ACCESS_EXPIRY || '15m';
  return jwt.sign({ userId }, secret, { expiresIn: expiry });
};

// Signs a long-lived refresh token for the given userId
export const generateRefreshToken = (userId) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  const expiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  return jwt.sign({ userId }, secret, { expiresIn: expiry });
};

// Verifies an access token — returns decoded payload or null on any failure
export const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    return decoded;
  } catch (err) {
    return null;
  }
};

// Verifies a refresh token — returns decoded payload or null on any failure
export const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    return decoded;
  } catch (err) {
    return null;
  }
};
