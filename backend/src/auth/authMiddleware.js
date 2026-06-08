import { verifyAccessToken } from './tokenHelpers.js';
import User from '../models/user.model.js';

// Attaches req.user if a valid Bearer token is present — never blocks the request
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const decoded = verifyAccessToken(token);

  if (decoded === null) {
    req.user = null;
    return next();
  }

  try {
    const user = await User.findById(decoded.userId);

    if (!user || user.isActive === false) {
      req.user = null;
      return next();
    }

    req.user = user;
    return next();
  } catch (err) {
    req.user = null;
    return next();
  }
};

// Blocks the request with 401 if no authenticated user is attached
export const requireAuth = (req, res, next) => {
  optionalAuth(req, res, () => {
    if (req.user === null) {
      return res.status(401).json({ success: false, message: 'Login required.' });
    }
    return next();
  });
};

// Blocks the request with 403 if the authenticated user is not an admin
export const requireAdmin = (req, res, next) => {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    return next();
  });
};
