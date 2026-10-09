import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cookieParserMiddleware,
  authenticateUser,
  authorizeRoles,
} from '../middlewares/authMiddleware.js';
import { generateTokens } from '../utils/jwt.js';

describe('Unit Tests: Auth Middleware', () => {
  describe('cookieParserMiddleware', () => {
    it('should parse simple and encoded cookies from cookie header', () => {
      const req = {
        headers: {
          cookie: 'accessToken=test-access-token; refreshToken=test-refresh-token; custom%20key=hello%20world',
        },
      };
      const res = {};
      let nextCalled = false;

      cookieParserMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.cookies.accessToken, 'test-access-token');
      assert.equal(req.cookies.refreshToken, 'test-refresh-token');
      assert.equal(req.cookies['custom key'], 'hello world');
    });

    it('should initialize empty object when no cookie header exists', () => {
      const req = { headers: {} };
      const res = {};
      let nextCalled = false;

      cookieParserMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.deepEqual(req.cookies, {});
    });
  });

  describe('authenticateUser', () => {
    const mockUser = {
      _id: '66141234567890abcdef9999',
      name: 'Auth User',
      email: 'auth@taskforge.ai',
      role: 'developer',
    };

    it('should return 401 when no token is present in cookies or Authorization header', () => {
      const req = { cookies: {}, headers: {} };
      let statusCode = 0;
      let responseBody = null;

      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => {
              responseBody = body;
            },
          };
        },
      };

      authenticateUser(req, res, () => {});

      assert.equal(statusCode, 401);
      assert.equal(responseBody.code, 'NO_TOKEN');
      assert.equal(responseBody.success, false);
    });

    it('should authenticate successfully using accessToken cookie', () => {
      const { accessToken } = generateTokens(mockUser);
      const req = {
        cookies: { accessToken },
        headers: {},
      };
      const res = {};
      let nextCalled = false;

      authenticateUser(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.ok(req.user, 'req.user should be populated');
      assert.equal(req.user.email, mockUser.email);
      assert.equal(req.user.role, mockUser.role);
    });

    it('should authenticate successfully using Authorization Bearer header as fallback', () => {
      const { accessToken } = generateTokens(mockUser);
      const req = {
        cookies: {},
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      };
      const res = {};
      let nextCalled = false;

      authenticateUser(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.ok(req.user);
      assert.equal(req.user.email, mockUser.email);
    });

    it('should return 401 INVALID_TOKEN for an invalid token', () => {
      const req = {
        cookies: { accessToken: 'invalid.jwt.token' },
        headers: {},
      };
      let statusCode = 0;
      let responseBody = null;

      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => {
              responseBody = body;
            },
          };
        },
      };

      authenticateUser(req, res, () => {});

      assert.equal(statusCode, 401);
      assert.equal(responseBody.code, 'INVALID_TOKEN');
      assert.equal(responseBody.success, false);
    });
  });

  describe('authorizeRoles', () => {
    it('should return 401 if req.user is missing', () => {
      const req = {};
      let statusCode = 0;
      let responseBody = null;

      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => {
              responseBody = body;
            },
          };
        },
      };

      const middleware = authorizeRoles('project_manager');
      middleware(req, res, () => {});

      assert.equal(statusCode, 401);
      assert.equal(responseBody.success, false);
    });

    it('should return 403 Forbidden if user role is not authorized', () => {
      const req = {
        user: { role: 'developer', email: 'dev@taskforge.ai' },
      };
      let statusCode = 0;
      let responseBody = null;

      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => {
              responseBody = body;
            },
          };
        },
      };

      const middleware = authorizeRoles('project_manager');
      middleware(req, res, () => {});

      assert.equal(statusCode, 403);
      assert.equal(responseBody.success, false);
      assert.match(responseBody.message, /Forbidden/);
    });

    it('should allow request if user has the required role', () => {
      const req = {
        user: { role: 'project_manager', email: 'pm@taskforge.ai' },
      };
      const res = {};
      let nextCalled = false;

      const middleware = authorizeRoles('project_manager');
      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('should allow request if user has one of several authorized roles', () => {
      const req = {
        user: { role: 'developer', email: 'dev@taskforge.ai' },
      };
      const res = {};
      let nextCalled = false;

      const middleware = authorizeRoles('admin', 'developer');
      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });
  });
});
