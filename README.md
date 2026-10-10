# TaskForge AI — Project Management Platform

[![CI — TaskForge AI](https://github.com/vijayadharan21-creator/Horizonv2/actions/workflows/ci.yml/badge.svg)](https://github.com/vijayadharan21-creator/Horizonv2/actions/workflows/ci.yml)

A full-stack MERN project management application featuring dual-provider AI integration (local Ollama & cloud OpenAI), intelligent developer allocation, live sprint insights, recovery center simulation, dual-token JWT authentication, and role-based access control.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Backend | Node.js (v20+) + Express 5 + Mongoose |
| AI Engine | Ollama (`qwen3:4b`) + OpenAI (`gpt-4o-mini`) |
| Validation | Zod schema validation & topological dependency analysis |
| Auth | Dual-token JWT (Access + Refresh) + HTTP-only cookies |
| Database | MongoDB Atlas |
| Infra | Docker + Nginx + GitHub Actions CI |

---

## 🤖 AI Architecture & Providers

TaskForge AI integrates two independent AI providers through a unified backend architecture:

1. **Ollama (Local AI):** Default local model `qwen3:4b` using Ollama's Chat API with JSON mode. Zero cloud cost and private inference.
2. **OpenAI (Cloud AI):** Official OpenAI Node.js SDK and structured output API (e.g., `gpt-4o-mini`).

```text
server/
├── config/
│   └── ai.config.js                    # AI configuration & startup validator
├── service/
│   └── ai/
│       ├── ai.service.js               # Central provider router & fallback engine
│       ├── ollama.provider.js          # Local Ollama HTTP Chat API client
│       ├── openai.provider.js          # Cloud OpenAI Node.js SDK client
│       ├── ai.schemas.js               # Zod validation schemas & graph cycle detector
│       ├── task-generation.service.js  # Feature 1: Task generation & approval
│       ├── assignment-recommendation.service.js # Feature 2: Workload-based allocation
│       ├── sprint-insights.service.js  # Feature 3: Live sprint health & bottlenecks
│       └── recovery-ai.service.js      # Feature 4: Recovery replanning & disruption engine
├── controllers/
│   └── ai.controller.js                # API request handling & authorization
├── router/
│   └── aiRoutes.js                     # AI HTTP route definitions with RBAC
└── validators/
    └── ai.validators.js                # Express request validation middlewares
```

### Provider Selection & Fallback Policy

AI provider routing is governed strictly by environment variables in `server/.env`:

```env
AI_PROVIDER=ollama          # "ollama" or "openai"
AI_FALLBACK_ENABLED=false   # true or false
```

- When `AI_PROVIDER=ollama` and `AI_FALLBACK_ENABLED=false`, the server exclusively uses Ollama.
- When `AI_PROVIDER=openai` and `AI_FALLBACK_ENABLED=false`, the server exclusively uses OpenAI.
- When `AI_FALLBACK_ENABLED=true`, if the primary provider encounters a recoverable error (such as local timeout, connection refused, or 429 rate limit), the request automatically attempts the secondary provider. Provider metadata (`meta.fallbackUsed: true`, `meta.provider`) is recorded in the response.
- **Provider Switching:** Change `AI_PROVIDER` in `server/.env` and restart the backend. No business logic modification is required.

---

## 📦 Setting Up Ollama (`qwen3:4b`)

1. **Download & Install Ollama:**
   - macOS / Linux: `curl -fsSL https://ollama.com/install.sh | sh`
   - Windows: Download installer from [ollama.com/download](https://ollama.com/download)

2. **Pull the `qwen3:4b` model:**
   ```bash
   ollama pull qwen3:4b
   ```

3. **Verify Ollama is Running:**
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```
   You should see `qwen3:4b` in the list of available models.

---

## ☁️ Setting Up OpenAI

1. Sign up or log in at [platform.openai.com](https://platform.openai.com/).
2. Create an API key in your OpenAI dashboard.
3. Add the key and model to `server/.env`:
   ```env
   AI_PROVIDER=openai
   AI_FALLBACK_ENABLED=false
   OPENAI_API_KEY=sk-proj-your-key-here
   OPENAI_MODEL=gpt-4o-mini
   ```
4. **Security Notice:** The OpenAI API key resides **strictly on the backend**. It is never bundled into React, Vite, or client-side assets.

---

## 🐳 Docker Networking Considerations

When running TaskForge AI inside Docker containers:
- `127.0.0.1` inside a container refers to the container itself.
- If Ollama is running on your host machine outside Docker, set the base URL in Docker Compose or `.env` to:
  ```env
  OLLAMA_BASE_URL=http://host.docker.internal:11434
  ```
- On Linux Docker engines, ensure `extra_hosts: ["host.docker.internal:host-gateway"]` is present in `docker-compose.yml`.

---

## 🔌 AI API Endpoints Documentation

All AI endpoints require authentication via HTTP-only JWT cookies or Authorization header.

### 1. `GET /api/ai/status`
Inspects operational status of the active AI engine without exposing credentials. (PM/Admin only).

**Response:**
```json
{
  "success": true,
  "data": {
    "activeProvider": "ollama",
    "fallbackEnabled": false,
    "ollama": {
      "configuredModel": "qwen3:4b",
      "baseUrl": "http://127.0.0.1:11434"
    },
    "openai": {
      "configuredModel": "gpt-4o-mini",
      "hasKeyConfigured": false
    },
    "status": "configured"
  }
}
```

### 2. `POST /api/ai/generate-tasks`
Decomposes requirements into structured technical tasks with dependency graphs. Does not persist to DB until approved. (PM only).

**Request:**
```json
{
  "projectId": "66141234567890abcdef1111",
  "requirements": [
    "Implement JWT dual-token authentication",
    "Build task assignment dashboard"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "suggestionId": "SUGG-1",
        "title": "Build Auth API & Tokens",
        "description": "Create access/refresh token generation",
        "suggestedRole": "Backend Engineer",
        "requiredSkills": ["Node.js", "JWT"],
        "effortHours": 6,
        "priority": "High",
        "dependencies": []
      }
    ]
  },
  "meta": {
    "provider": "ollama",
    "model": "qwen3:4b",
    "generatedAt": "2026-10-10T03:30:00Z"
  }
}
```

### 3. `POST /api/ai/approve-tasks`
Persists user-approved task suggestions into MongoDB, generating sequential task IDs (e.g. `T-106`). (PM only).

### 4. `POST /api/ai/recommend-assignments`
Recommends optimal developer assignments based on real developer skills, capacity, and active task workloads. (PM only).

### 5. `GET /api/ai/sprint-insights?projectId=PROJECT_ID`
Analyzes sprint health, overdue deadlines, and dependency bottlenecks grounded in MongoDB data.

### 6. `POST /api/ai/recovery-recommendations`
Simulates developer absence, effort overruns, or dependency delays and produces a schedule recovery proposal that strictly preserves completed tasks. (PM only).

### 7. `POST /api/ai/apply-recovery-plan`
Applies approved recovery reassignments and due-date adjustments to MongoDB tasks. (PM only).

### 8. `POST /api/ai/task-assist`
Context-aware task assistant providing acceptance criteria, effort estimates, and improved descriptions.

---

## 🧪 Automated Testing

Run the unified test suite (65 passing unit & mock tests):

```bash
cd server
npm test
```

Tests include:
- Ollama provider selection & mock
- OpenAI provider selection & mock
- Provider fallback enabled vs disabled
- Timeout, network failure, and malformed JSON recovery
- Zod schema validation & topological circular dependency rejection
- AI task proposal preview & approval persistence
- Assignment capacity and membership enforcement
- Completed task preservation in Recovery Center
- Role-based authorization & security protections

---

## 🚀 Running the Project

```bash
# 1. Start Server
cd server
npm install
node server.js

# 2. Start Client (in a separate terminal)
cd client
npm install
npm run dev
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000/api
- **Demo PM Account:** `pm@taskforge.ai` / `Password@123`
- **Demo Developer Account:** `dev@taskforge.ai` / `Password@123`
