# TaskForge AI — Project Management Platform

[![CI — TaskForge AI](https://github.com/vijayadharan21-creator/Horizonv2/actions/workflows/ci.yml/badge.svg)](https://github.com/vijayadharan21-creator/Horizonv2/actions/workflows/ci.yml)

A full-stack MERN project management application with dual-token JWT authentication, role-based access control, and Docker containerisation.

---

## 🏗️ Tech Stack

| Layer    | Technology                                 |
|----------|--------------------------------------------|
| Frontend | React 19 + Vite + Tailwind CSS v4          |
| Backend  | Node.js + Express 5 + Mongoose             |
| Auth     | Dual-token JWT (Access + Refresh) + HTTP-only cookies |
| Database | MongoDB Atlas                              |
| Infra    | Docker + Nginx + GitHub Actions CI         |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- MongoDB Atlas connection string

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/vijayadharan21-creator/Horizonv2.git
cd Horizonv2

# 2. Create environment file
cp server/.env.dev server/.env
# Edit server/.env and fill in your MONGO_URI and JWT secrets

# 3. Start the backend
cd server && npm install && npm run dev

# 4. Start the frontend (separate terminal)
cd client && npm install && npm run dev
```

Frontend: http://localhost:5173  
Backend API: http://localhost:5000/api

---

## 🐳 Docker (Production)

```bash
# Build and run both containers
docker compose up --build

# App runs at http://localhost
```

---

## 🧪 Backend Unit Tests

```bash
cd server
npm test
```

**45 tests** across 5 suites — zero external test runner dependencies (uses Node.js built-in `node:test`):

| Suite | Tests |
|-------|-------|
| User Model | Schema validation, bcrypt, safe object |
| JWT Utilities | Token generation, verification, cookies |
| Auth Middleware | Cookie parser, authenticateUser, authorizeRoles |
| Auth Controller | register, login, refresh, logout, demo-accounts |
| API Endpoints | HTTP integration tests for all routes |

---

## 🔐 Roles

| Role | Dashboard | Credentials (Demo) |
|------|-----------|--------------------|
| Project Manager | `/api/auth/pm-dashboard` | `pm@taskforge.ai` / `Password@123` |
| Developer | `/api/auth/dev-dashboard` | `dev@taskforge.ai` / `Password@123` |

---

## ⚙️ CI/CD Pipeline (GitHub Actions)

The pipeline runs on every push and pull request to `main` and `develop`:

```
Push / PR
    │
    ├── 🧪 Backend Unit Tests     → node tests/runner.js (45 tests)
    ├── 🏗️ Frontend Build          → vite build (validates no compile errors)
    │
    └── [main branch only]
        └── 🐳 Docker Build & Push → Docker Hub (server + client images)
```

### Setup Docker Hub Secrets

To enable Docker image publishing, add these secrets in your GitHub repo:  
**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|-------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token (not password) |

---

## 📁 Project Structure

```
version-2/
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions CI pipeline
├── client/                 # React + Vite frontend
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
├── server/                 # Express backend
│   ├── Dockerfile
│   ├── server.js           # App entry point
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── router/
│   ├── utils/
│   └── tests/              # Unit test suites
├── docker-compose.yml
└── README.md
```
