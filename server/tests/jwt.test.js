import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  setAuthCookies,
  clearAuthCookies,
} from '../utils/jwt.js';

describe('Unit Tests: JWT & Cookie Utilities', () => {
  const mockUser = {
    _id: '66141234567890abcdef1234',
    name: 'Test Engineer',
    email: 'test@taskforge.ai',
    role: 'developer',
  };

  it('generateTokens should return both accessToken and refreshToken with correct claims', () => {
    const tokens = generateTokens(mockUser);

    assert.ok(tokens.accessToken, 'accessToken must be present');
    assert.ok(tokens.refreshToken, 'refreshToken must be present');

    const decodedAccess = jwt.decode(tokens.accessToken);
    assert.equal(decodedAccess.id, mockUser._id);
    assert.equal(decodedAccess.email, mockUser.email);
    assert.equal(decodedAccess.role, mockUser.role);
    assert.equal(decodedAccess.name, mockUser.name);

    const decodedRefresh = jwt.decode(tokens.refreshToken);
    assert.equal(decodedRefresh.id, mockUser._id);
    assert.equal(decodedRefresh.role, mockUser.role);
  });

  it('verifyAccessToken should succeed for a valid access token', () => {
    const { accessToken } = generateTokens(mockUser);
    const result = verifyAccessToken(accessToken);

    assert.equal(result.valid, true);
    assert.equal(result.expired, false);
    assert.equal(result.decoded.email, mockUser.email);
    assert.equal(result.decoded.role, mockUser.role);
  });

  it('verifyAccessToken should return valid=false for invalid or tampered tokens', () => {
    const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.signature';
    const result = verifyAccessToken(tamperedToken);

    assert.equal(result.valid, false);
    assert.equal(result.decoded, null);
  });

  it('verifyRefreshToken should succeed for a valid refresh token', () => {
    const { refreshToken } = generateTokens(mockUser);
    const result = verifyRefreshToken(refreshToken);

    assert.equal(result.valid, true);
    assert.equal(result.expired, false);
    assert.equal(result.decoded.id, mockUser._id);
  });

  it('verifyRefreshToken should return valid=false for an invalid refresh token', () => {
    const result = verifyRefreshToken('malformed_token_string');
    assert.equal(result.valid, false);
    assert.equal(result.decoded, null);
  });

  it('cookie options should have httpOnly set to true for security', () => {
    assert.equal(accessTokenCookieOptions.httpOnly, true);
    assert.equal(refreshTokenCookieOptions.httpOnly, true);
    assert.equal(accessTokenCookieOptions.path, '/');
    assert.equal(refreshTokenCookieOptions.path, '/');
    assert.equal(accessTokenCookieOptions.maxAge, 15 * 60 * 1000); // 15 mins
    assert.equal(refreshTokenCookieOptions.maxAge, 7 * 24 * 60 * 60 * 1000); // 7 days
  });

  it('setAuthCookies should attach accessToken and refreshToken cookies to response', () => {
    const cookiesSet = {};
    const mockRes = {
      cookie: (name, val, opts) => {
        cookiesSet[name] = { val, opts };
      },
    };

    setAuthCookies(mockRes, 'access-123', 'refresh-456');

    assert.ok(cookiesSet.accessToken, 'accessToken cookie should be set');
    assert.equal(cookiesSet.accessToken.val, 'access-123');
    assert.equal(cookiesSet.accessToken.opts.httpOnly, true);

    assert.ok(cookiesSet.refreshToken, 'refreshToken cookie should be set');
    assert.equal(cookiesSet.refreshToken.val, 'refresh-456');
    assert.equal(cookiesSet.refreshToken.opts.httpOnly, true);
  });

  it('clearAuthCookies should clear both cookies on response', () => {
    const cookiesCleared = {};
    const mockRes = {
      clearCookie: (name, opts) => {
        cookiesCleared[name] = opts;
      },
    };

    clearAuthCookies(mockRes);

    assert.ok('accessToken' in cookiesCleared, 'accessToken cookie cleared');
    assert.ok('refreshToken' in cookiesCleared, 'refreshToken cookie cleared');
    assert.equal(cookiesCleared.accessToken.maxAge, 0);
    assert.equal(cookiesCleared.refreshToken.maxAge, 0);
  });
});
