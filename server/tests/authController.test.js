import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import {
  register,
  login,
  refreshToken,
  logout,
  getSeedAccounts,
} from '../controllers/authController.js';
import { generateTokens } from '../utils/jwt.js';

// Helper to create mock response object
const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    cookies: {},
    clearedCookies: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    cookie(name, val, opts) {
      this.cookies[name] = { val, opts };
      return this;
    },
    clearCookie(name, opts) {
      this.clearedCookies[name] = opts;
      return this;
    },
  };
  return res;
};

describe('Unit Tests: Auth Controller', () => {
  // Store original methods so we can restore after tests
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  const originalFindById = User.findById;

  describe('POST /register', () => {
    it('should return 400 if required fields are missing', async () => {
      const req = { body: { email: 'test@example.com' } };
      const res = createMockRes();

      await register(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Name, email, and password are required/);
    });

    it('should return 400 if password is less than 6 characters', async () => {
      const req = {
        body: {
          name: 'John Doe',
          email: 'john@example.com',
          password: '123',
        },
      };
      const res = createMockRes();

      await register(req, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /at least 6 characters/);
    });

    it('should return 400 if email already exists', async () => {
      // Mock User.findOne to return existing user
      User.findOne = async () => ({ email: 'existing@taskforge.ai' });

      const req = {
        body: {
          name: 'Jane Doe',
          email: 'existing@taskforge.ai',
          password: 'Password123',
          skills: ['JavaScript'],
          subSkills: ['React'],
        },
      };
      const res = createMockRes();

      await register(req, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /already exists/);

      User.findOne = originalFindOne;
    });

    it('should register successfully, generate tokens and set auth cookies', async () => {
      User.findOne = async () => null; // No duplicate
      User.create = async (userData) => ({
        _id: '6614mockid1234567890abcdef',
        name: userData.name,
        email: userData.email,
        role: userData.role,
        skills: userData.skills || [],
        subSkills: userData.subSkills || [],
        createdAt: new Date(),
        toSafeObject() {
          return {
            id: this._id,
            name: this.name,
            email: this.email,
            role: this.role,
            skills: this.skills,
            subSkills: this.subSkills,
            createdAt: this.createdAt,
          };
        },
      });
      User.findByIdAndUpdate = async () => true;

      const req = {
        body: {
          name: 'Alice Developer',
          email: 'alice@taskforge.ai',
          password: 'StrongPassword123',
          role: 'developer',
          skills: ['Node.js'],
          subSkills: ['Express'],
        },
      };
      const res = createMockRes();

      await register(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.email, 'alice@taskforge.ai');
      assert.ok(res.body.accessToken);
      assert.ok(res.cookies.accessToken, 'Should set accessToken cookie');
      assert.ok(res.cookies.refreshToken, 'Should set refreshToken cookie');

      User.findOne = originalFindOne;
      User.create = originalCreate;
      User.findByIdAndUpdate = originalFindByIdAndUpdate;
    });
  });

  describe('POST /login', () => {
    it('should return 400 if email or password is empty', async () => {
      const req = { body: { email: '' } };
      const res = createMockRes();

      await login(req, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /provide both email and password/);
    });

    it('should return 401 if user does not exist', async () => {
      User.findOne = () => ({
        select: async () => null,
      });

      const req = {
        body: { email: 'notfound@taskforge.ai', password: 'Password123' },
      };
      const res = createMockRes();

      await login(req, res);

      assert.equal(res.statusCode, 401);
      assert.match(res.body.message, /Invalid email or password/);

      User.findOne = originalFindOne;
    });

    it('should return 401 if password does not match', async () => {
      User.findOne = () => ({
        select: async () => ({
          _id: '6614mockid1234567890abcdef',
          email: 'user@taskforge.ai',
          comparePassword: async () => false, // Password mismatch
        }),
      });

      const req = {
        body: { email: 'user@taskforge.ai', password: 'WrongPassword' },
      };
      const res = createMockRes();

      await login(req, res);

      assert.equal(res.statusCode, 401);
      assert.match(res.body.message, /Invalid email or password/);

      User.findOne = originalFindOne;
    });

    it('should return 200 and set cookies when credentials are valid', async () => {
      User.findOne = () => ({
        select: async () => ({
          _id: '6614mockid1234567890abcdef',
          name: 'Sarah Jenkins',
          email: 'pm@taskforge.ai',
          role: 'project_manager',
          skills: ['Agile'],
          createdAt: new Date(),
          comparePassword: async () => true,
          toSafeObject() {
            return {
              id: this._id,
              name: this.name,
              email: this.email,
              role: this.role,
              skills: this.skills,
            };
          },
        }),
      });
      User.findByIdAndUpdate = async () => true;

      const req = {
        body: { email: 'pm@taskforge.ai', password: 'Password@123' },
      };
      const res = createMockRes();

      await login(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.role, 'project_manager');
      assert.ok(res.cookies.accessToken);
      assert.ok(res.cookies.refreshToken);

      User.findOne = originalFindOne;
      User.findByIdAndUpdate = originalFindByIdAndUpdate;
    });
  });

  describe('POST /refresh', () => {
    it('should return 401 if no refresh token is provided', async () => {
      const req = { cookies: {}, body: {} };
      const res = createMockRes();

      await refreshToken(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.code, 'NO_REFRESH_TOKEN');
    });

    it('should refresh tokens when valid refresh token is supplied', async () => {
      const mockUser = {
        _id: '6614mockid1234567890abcdef',
        name: 'Alex Rivera',
        email: 'dev@taskforge.ai',
        role: 'developer',
      };
      const { refreshToken: validRefreshToken } = generateTokens(mockUser);

      User.findById = () => ({
        select: async () => ({
          ...mockUser,
          refreshToken: validRefreshToken,
          toSafeObject() {
            return mockUser;
          },
        }),
      });
      User.findByIdAndUpdate = async () => true;

      const req = {
        cookies: { refreshToken: validRefreshToken },
      };
      const res = createMockRes();

      await refreshToken(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.accessToken);
      assert.ok(res.cookies.accessToken);
      assert.ok(res.cookies.refreshToken);

      User.findById = originalFindById;
      User.findByIdAndUpdate = originalFindByIdAndUpdate;
    });

    it('should return 401 if refresh token does not match token in database (revoked)', async () => {
      const mockUser = {
        _id: '6614mockid1234567890abcdef',
        name: 'Alex Rivera',
        email: 'dev@taskforge.ai',
        role: 'developer',
      };
      const { refreshToken: validRefreshToken } = generateTokens(mockUser);

      // User in DB has null or different token (e.g. after logout)
      User.findById = () => ({
        select: async () => ({
          ...mockUser,
          refreshToken: null,
          toSafeObject() {
            return mockUser;
          },
        }),
      });

      const req = {
        cookies: { refreshToken: validRefreshToken },
      };
      const res = createMockRes();

      await refreshToken(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.code, 'REVOKED_REFRESH_TOKEN');

      User.findById = originalFindById;
    });
  });

  describe('POST /logout', () => {
    it('should clear cookies and return 200', async () => {
      User.findOneAndUpdate = async () => true;
      const req = {
        cookies: { refreshToken: 'mock-token' },
      };
      const res = createMockRes();

      await logout(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.ok('accessToken' in res.clearedCookies);
      assert.ok('refreshToken' in res.clearedCookies);
    });
  });

  describe('GET /demo-accounts', () => {
    it('should return demo accounts with roles and credentials', async () => {
      const req = {};
      const res = createMockRes();

      await getSeedAccounts(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.accounts.length, 2);
      assert.equal(res.body.accounts[0].role, 'project_manager');
      assert.equal(res.body.accounts[1].role, 'developer');
    });
  });
});
