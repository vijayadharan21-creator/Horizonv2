/**
 * reset_and_seed.mjs
 * ──────────────────
 * 1. Connects to MongoDB
 * 2. Wipes ALL Users, Projects, Tasks, TaskCounters, Invitations
 * 3. Inserts the 5 provided developer users with properly hashed passwords
 *
 * Run:  node server/scripts/reset_and_seed.mjs
 */

import mongoose from 'mongoose';
import bcrypt   from 'bcrypt';
import dotenv   from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from server root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not found in .env');
  process.exit(1);
}

// Minimal inline schemas (avoids ESM circular import issues)
const userSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  password:     { type: String, required: true },
  role:         { type: String, enum: ['project_manager', 'developer', 'admin'], default: 'developer' },
  skills:       { type: [String], default: [] },
  subSkills:    { type: [String], default: [] },
  availability: {
    status:    { type: String, enum: ['available', 'unavailable'], default: 'available' },
    from:      { type: String, default: null },
    to:        { type: String, default: null },
    reason:    { type: String, default: '' },
    updatedAt: { type: Date,   default: Date.now },
  },
  refreshToken: { type: String, default: null },
}, { timestamps: true });

const User        = mongoose.models.User        || mongoose.model('User',        userSchema);
const Project     = mongoose.models.Project     || mongoose.model('Project',     new mongoose.Schema({}, { strict: false }));
const Task        = mongoose.models.Task        || mongoose.model('Task',        new mongoose.Schema({}, { strict: false }));
const TaskCounter = mongoose.models.TaskCounter || mongoose.model('TaskCounter', new mongoose.Schema({}, { strict: false }));
const Invitation  = mongoose.models.Invitation  || mongoose.model('Invitation',  new mongoose.Schema({}, { strict: false }));

// User seed data - password is "<firstName>@1234" e.g. "arun@1234"
const PLAIN_PASSWORD = (firstName) => firstName.toLowerCase() + '@1234';

const USERS = [
  {
    name:      'Arun Kumar',
    email:     'arun.dev101@example.com',
    role:      'developer',
    skills:    ['Node.js', 'MongoDB', 'AWS'],
    subSkills: ['Express.js', 'Mongoose', 'EC2', 'S3'],
    availability: { status: 'available', from: null, to: null, reason: '' },
  },
  {
    name:      'Priya Sharma',
    email:     'priya.dev102@example.com',
    role:      'developer',
    skills:    ['React', 'JavaScript', 'CSS'],
    subSkills: ['React Hooks', 'Redux', 'Tailwind CSS', 'Responsive Design'],
    availability: { status: 'available', from: null, to: null, reason: '' },
  },
  {
    name:      'Karthik Raj',
    email:     'karthik.dev103@example.com',
    role:      'developer',
    skills:    ['Python', 'FastAPI', 'PostgreSQL'],
    subSkills: ['REST APIs', 'SQLAlchemy', 'Database Design', 'Pytest'],
    availability: { status: 'available', from: null, to: null, reason: '' },
  },
  {
    name:      'Divya Priya',
    email:     'divya.dev104@example.com',
    role:      'developer',
    skills:    ['Java', 'Spring Boot', 'MySQL'],
    subSkills: ['Spring Security', 'Hibernate', 'JPA', 'JUnit'],
    availability: { status: 'available', from: null, to: null, reason: '' },
  },
  {
    name:      'Sanjay Kumar',
    email:     'sanjay.dev105@example.com',
    role:      'developer',
    skills:    ['Docker', 'Kubernetes', 'AWS'],
    subSkills: ['Docker Compose', 'CI/CD', 'EC2', 'EKS', 'Prometheus'],
    availability: { status: 'available', from: null, to: null, reason: '' },
  },
];

async function run() {
  console.log('\n[reset] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[reset] Connected.\n');

  // 1. Wipe all collections
  console.log('[reset] Wiping existing data...');
  const [uDel, pDel, tDel, tcDel, invDel] = await Promise.all([
    User.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    TaskCounter.deleteMany({}),
    Invitation.deleteMany({}),
  ]);
  console.log('  Users deleted       :', uDel.deletedCount);
  console.log('  Projects deleted    :', pDel.deletedCount);
  console.log('  Tasks deleted       :', tDel.deletedCount);
  console.log('  TaskCounters deleted:', tcDel.deletedCount);
  console.log('  Invitations deleted :', invDel.deletedCount);
  console.log('');

  // 2. Insert users with hashed passwords
  console.log('[reset] Inserting 5 developer users...');
  const SALT_ROUNDS = 10;

  for (const u of USERS) {
    const firstName = u.name.split(' ')[0];
    const plain     = PLAIN_PASSWORD(firstName);
    const hashed    = await bcrypt.hash(plain, SALT_ROUNDS);

    const created = await User.create({
      ...u,
      password:     hashed,
      refreshToken: null,
    });

    console.log('  [OK]', created.name, '|', created.email, '| password:', plain);
  }

  console.log('\n[reset] Done. Database is clean and seeded.\n');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[reset] Failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
