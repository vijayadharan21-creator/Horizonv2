import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Lightweight native cookie parser middleware
 * Ensures req.cookies is populated from cookie headers
 */
export const cookieParserMiddleware = (req, res, next) => {
  req.cookies = req.cookies || {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach((rawCookie) => {
      const parts = rawCookie.trim().split('=');
      if (parts.length >= 2) {
        const value = parts.slice(1).join('=').trim();
        try {
          const key = decodeURIComponent(parts[0].trim());
          req.cookies[key] = decodeURIComponent(value);
        } catch {
          req.cookies[parts[0].trim()] = value;
        }
      }
    });
  }
  next();
};

/**
 * Authenticate User Middleware
 * Checks Access Token in HTTP-only cookie (or Authorization header as fallback)
 */
export const authenticateUser = (req, res, next) => {
  let token = req.cookies?.accessToken;

  // Optional fallback to Bearer header if cookie isn't present
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token missing. Please log in.',
      code: 'NO_TOKEN',
    });
  }

  const { valid, decoded, expired } = verifyAccessToken(token);

  if (expired) {
    return res.status(401).json({
      success: false,
      message: 'Access token expired. Please refresh your session.',
      code: 'TOKEN_EXPIRED',
    });
  }

  if (!valid || !decoded) {
    return res.status(401).json({
      success: false,
      message: 'Invalid access token. Please re-authenticate.',
      code: 'INVALID_TOKEN',
    });
  }

  req.user = decoded;
  next();
};

/**
 * Role-based Authorization Middleware
 * Validates whether the authenticated user has the necessary role
 */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before checking authorization.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user.role}' is not authorized to access this resource. Required role(s): ${roles.join(', ')}`,
      });
    }

    next();
  };
};
