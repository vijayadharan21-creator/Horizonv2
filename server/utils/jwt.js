import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'taskforge_fallback_access_secret_key_2026';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'taskforge_fallback_refresh_secret_key_2026';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate Dual Tokens: Short-lived Access Token & Long-lived Refresh Token
 */
export const generateTokens = (user) => {
  const payload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    name: user.name,
  };

  const accessToken = jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  });

  const refreshToken = jwt.sign(
    { id: user._id.toString(), role: user.role },
    REFRESH_SECRET,
    {
      expiresIn: REFRESH_EXPIRES,
    }
  );

  return { accessToken, refreshToken };
};

/**
 * Verify Access Token
 */
export const verifyAccessToken = (token) => {
  try {
    return { valid: true, decoded: jwt.verify(token, ACCESS_SECRET), expired: false };
  } catch (error) {
    return {
      valid: false,
      decoded: null,
      expired: error.name === 'TokenExpiredError',
      error: error.message,
    };
  }
};

/**
 * Verify Refresh Token
 */
export const verifyRefreshToken = (token) => {
  try {
    return { valid: true, decoded: jwt.verify(token, REFRESH_SECRET), expired: false };
  } catch (error) {
    return {
      valid: false,
      decoded: null,
      expired: error.name === 'TokenExpiredError',
      error: error.message,
    };
  }
};

/**
 * Cookie options for both tokens.
 *
 * NOTE: secure:true + sameSite:'none' REQUIRES HTTPS.
 * On plain HTTP (EC2 without SSL), browsers silently drop these cookies
 * causing all protected routes to fail with 401/500.
 * Use sameSite:'lax' + secure:false when running without HTTPS.
 */
export const accessTokenCookieOptions = {
  httpOnly: true,
  secure: false,       // Set to true only when HTTPS is configured
  sameSite: 'lax',     // 'lax' works on HTTP; use 'none' only with HTTPS
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/',
};

export const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: false,       // Set to true only when HTTPS is configured
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

/**
 * Set both Access & Refresh tokens in response cookies
 */
export const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, accessTokenCookieOptions);
  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
  }
};

/**
 * Clear both cookies on logout
 */
export const clearAuthCookies = (res) => {
  res.clearCookie('accessToken', {
    ...accessTokenCookieOptions,
    maxAge: 0,
  });
  res.clearCookie('refreshToken', {
    ...refreshTokenCookieOptions,
    maxAge: 0,
  });
};
