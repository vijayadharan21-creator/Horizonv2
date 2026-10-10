import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../server.js';
import { generateTokens } from '../utils/jwt.js';

describe('Unit Tests: API HTTP Endpoints', () => {
  let server;
  let baseUrl;

  before(async () => {
    // Start Express app on an ephemeral port (port 0)
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('GET /api/health returns 200 and healthy status JSON', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.ok(data.service.includes('TaskForge AI'));
  });

  it('GET /api/unknown-endpoint returns 404 with error message', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent-route-xyz`);
    assert.equal(res.status, 404);

    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /API endpoint not found/);
  });

  it('GET /api/auth/demo-accounts returns 200 with demo accounts list', async () => {
    const res = await fetch(`${baseUrl}/api/auth/demo-accounts`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.accounts));
    assert.equal(data.accounts.length, 2);
  });

  it('POST /api/auth/register fails with 400 when body is empty', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  it('POST /api/auth/login fails with 400 when missing credentials', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  it('GET /api/auth/me returns 401 NO_TOKEN when accessed without auth cookie/header', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);

    const data = await res.json();
    assert.equal(data.code, 'NO_TOKEN');
  });

  it('GET /api/auth/pm-dashboard returns 401 when accessed without token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/pm-dashboard`);
    assert.equal(res.status, 401);
  });

  it('GET /api/auth/pm-dashboard returns 403 Forbidden when accessed by developer role', async () => {
    const devUser = {
      _id: '66141234567890abcdef1111',
      name: 'Developer User',
      email: 'dev@taskforge.ai',
      role: 'developer',
    };
    const { accessToken } = generateTokens(devUser);

    const res = await fetch(`${baseUrl}/api/auth/pm-dashboard`, {
      headers: {
        Cookie: `accessToken=${accessToken}`,
      },
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Forbidden.*Role 'developer' is not authorized/);
  });

  it('GET /api/auth/pm-dashboard returns 200 OK when accessed by project_manager role', async () => {
    const pmUser = {
      _id: '66141234567890abcdef2222',
      name: 'PM User',
      email: 'pm@taskforge.ai',
      role: 'project_manager',
    };
    const { accessToken } = generateTokens(pmUser);

    const res = await fetch(`${baseUrl}/api/auth/pm-dashboard`, {
      headers: {
        Cookie: `accessToken=${accessToken}`,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.match(data.message, /Project Manager Workspace/);
    assert.equal(data.user.role, 'project_manager');
  });

  it('GET /api/auth/dev-dashboard returns 200 OK when accessed by developer role', async () => {
    const devUser = {
      _id: '66141234567890abcdef3333',
      name: 'Dev User',
      email: 'alex@taskforge.ai',
      role: 'developer',
    };
    const { accessToken } = generateTokens(devUser);

    const res = await fetch(`${baseUrl}/api/auth/dev-dashboard`, {
      headers: {
        Authorization: `Bearer ${accessToken}`, // Verify Bearer header fallback works
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.match(data.message, /Developer Workspace/);
  });

  it('GET /api/auth/dev-dashboard returns 403 Forbidden when accessed by project_manager role', async () => {
    const pmUser = {
      _id: '66141234567890abcdef4444',
      name: 'PM User',
      email: 'pm@taskforge.ai',
      role: 'project_manager',
    };
    const { accessToken } = generateTokens(pmUser);

    const res = await fetch(`${baseUrl}/api/auth/dev-dashboard`, {
      headers: {
        Cookie: `accessToken=${accessToken}`,
      },
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Forbidden.*Role 'project_manager' is not authorized/);
  });

  it('GET /api/ai/status returns 401 when accessed without token', async () => {
    const res = await fetch(`${baseUrl}/api/ai/status`);
    assert.equal(res.status, 401);
  });

  it('GET /api/ai/status returns 403 Forbidden when accessed by developer', async () => {
    const devUser = {
      _id: '66141234567890abcdef5555',
      name: 'Dev User',
      email: 'alex@taskforge.ai',
      role: 'developer',
    };
    const { accessToken } = generateTokens(devUser);

    const res = await fetch(`${baseUrl}/api/ai/status`, {
      headers: { Cookie: `accessToken=${accessToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('GET /api/ai/status returns 200 with safe provider status when accessed by PM', async () => {
    const pmUser = {
      _id: '66141234567890abcdef4444',
      name: 'PM User',
      email: 'pm@taskforge.ai',
      role: 'project_manager',
    };
    const { accessToken } = generateTokens(pmUser);

    const res = await fetch(`${baseUrl}/api/ai/status`, {
      headers: { Cookie: `accessToken=${accessToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.activeProvider);
    assert.equal(body.data.apiKey, undefined, 'API key must never be leaked in status response');
  });

  it('POST /api/ai/generate-tasks returns 400 when missing required body fields', async () => {
    const pmUser = {
      _id: '66141234567890abcdef4444',
      name: 'PM User',
      email: 'pm@taskforge.ai',
      role: 'project_manager',
    };
    const { accessToken } = generateTokens(pmUser);

    const res = await fetch(`${baseUrl}/api/ai/generate-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${accessToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'INVALID_PROJECT_ID');
  });
});
