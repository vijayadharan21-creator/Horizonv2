import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import User from '../models/User.js';

describe('Unit Tests: User Model', () => {
  it('toSafeObject should return user data without sensitive fields (password, refreshToken)', () => {
    const userInstance = new User({
      name: 'Safe User',
      email: 'safe@taskforge.ai',
      role: 'developer',
      skills: ['React', 'Node.js'],
    });

    const safeObj = userInstance.toSafeObject();

    assert.equal(safeObj.name, 'Safe User');
    assert.equal(safeObj.email, 'safe@taskforge.ai');
    assert.equal(safeObj.role, 'developer');
    assert.deepEqual(safeObj.skills, ['React', 'Node.js']);
    assert.equal('password' in safeObj, false, 'Password must not be in safe object');
    assert.equal('refreshToken' in safeObj, false, 'RefreshToken must not be in safe object');
  });

  it('comparePassword should return true for matching password and false for non-matching', async () => {
    const plainPassword = 'SecretPassword123!';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    const userInstance = new User({
      name: 'Bcrypt Test',
      email: 'bcrypt@taskforge.ai',
      password: hashedPassword,
    });

    const isMatch = await userInstance.comparePassword(plainPassword);
    const isMismatch = await userInstance.comparePassword('WrongPassword');

    assert.equal(isMatch, true, 'Correct password must match');
    assert.equal(isMismatch, false, 'Incorrect password must not match');
  });

  it('should validate role enum: only project_manager, developer, admin are allowed', () => {
    const validUser = new User({
      name: 'Valid Role',
      email: 'valid@example.com',
      password: 'Password123',
      role: 'project_manager',
    });
    const error = validUser.validateSync();
    assert.equal(error, undefined, 'Valid role should not produce validation errors');

    const invalidUser = new User({
      name: 'Invalid Role',
      email: 'invalid@example.com',
      password: 'Password123',
      role: 'superadmin_nonexistent',
    });
    const invalidError = invalidUser.validateSync();
    assert.ok(invalidError.errors['role'], 'Should produce validation error for invalid role');
  });

  it('should validate email format properly', () => {
    const badEmailUser = new User({
      name: 'Bad Email',
      email: 'not-an-email',
      password: 'Password123',
    });
    const error = badEmailUser.validateSync();
    assert.ok(error.errors['email'], 'Should produce validation error for invalid email');
  });
});
