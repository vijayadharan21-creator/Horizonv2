/**
 * TaskForge Backend - Unified Test Runner
 * Uses Node.js built-in test runner (no external dependencies required).
 *
 * Sets NODE_ENV=test FIRST so server.js skips auto-starting (DB connect + port listen).
 */

// MUST be set before any test files are imported/required
process.env.NODE_ENV = 'test';

import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
  path.join(__dirname, 'userModel.test.js'),
  path.join(__dirname, 'jwt.test.js'),
  path.join(__dirname, 'authMiddleware.test.js'),
  path.join(__dirname, 'authController.test.js'),
  path.join(__dirname, 'api.test.js'),
  path.join(__dirname, 'ai.test.js'),
  path.join(__dirname, 'scheduleValidator.test.js'),
  path.join(__dirname, 'recovery.test.js'),
  path.join(__dirname, 'edurEngine.test.js'),
];

console.log('🧪 TaskForge Backend — Running Unit Tests...\n');
console.log('📁 Test files:');
testFiles.forEach((f) => console.log(`   • ${path.basename(f)}`));
console.log('');

run({
  files: testFiles,
  concurrency: 1, // Sequential — deterministic output and no port conflicts
})
  .compose(spec)
  .pipe(process.stdout);
