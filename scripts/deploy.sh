#!/usr/bin/env bash
# =============================================================================
# scripts/deploy.sh — TaskForge AI EC2 Deployment Script
#
# Executed on the EC2 instance via SSH by the GitHub Actions CD pipeline.
# All environment variables below are injected by the CD workflow's `env:` block.
#
# Required env vars (set by GitHub Actions secrets):
#   DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, IMAGE_TAG
#   MONGO_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN
#   CLIENT_URL, GIT_SHA
# =============================================================================

set -euo pipefail  # Exit on error, undefined vars, and pipe failures

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
fail() { echo -e "${RED}[deploy] ERROR:${NC} $*" >&2; exit 1; }

# ── Sanity checks ─────────────────────────────────────────────────────────────
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "🚀 TaskForge AI — Production Deployment"
log "   Commit  : ${GIT_SHA:-unknown}"
log "   Image   : ${DOCKERHUB_USERNAME}/taskforge-*:${IMAGE_TAG:-latest}"
log "   Time    : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify required tools are present on EC2
command -v docker      >/dev/null 2>&1 || fail "docker is not installed on this EC2 instance."
command -v docker compose >/dev/null 2>&1 || fail "docker compose (v2) plugin is not installed."

# ── Docker Hub Login ──────────────────────────────────────────────────────────
log "🔐 Logging in to Docker Hub..."
echo "${DOCKERHUB_TOKEN}" | docker login --username "${DOCKERHUB_USERNAME}" --password-stdin \
  || fail "Docker Hub login failed. Check DOCKERHUB_USERNAME / DOCKERHUB_TOKEN secrets."

# ── Write .env for docker compose ────────────────────────────────────────────
# docker-compose.prod.yml reads these vars; write them to a .env file
# so compose can pick them up without needing --env-file flag.
log "📝 Writing production .env..."
DEPLOY_DIR="/home/${USER:-ec2-user}"

cat > "${DEPLOY_DIR}/.env" <<EOF
DOCKERHUB_USERNAME=${DOCKERHUB_USERNAME}
IMAGE_TAG=${IMAGE_TAG:-latest}
MONGO_URI=${MONGO_URI}
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRES_IN=${JWT_ACCESS_EXPIRES_IN}
JWT_REFRESH_EXPIRES_IN=${JWT_REFRESH_EXPIRES_IN}
CLIENT_URL=${CLIENT_URL}
EOF

chmod 600 "${DEPLOY_DIR}/.env"

# ── Pull latest images ────────────────────────────────────────────────────────
log "📦 Pulling Docker images (tag: ${IMAGE_TAG:-latest})..."
docker pull "${DOCKERHUB_USERNAME}/taskforge-server:${IMAGE_TAG:-latest}" \
  || fail "Failed to pull server image."
docker pull "${DOCKERHUB_USERNAME}/taskforge-client:${IMAGE_TAG:-latest}" \
  || fail "Failed to pull client image."

# ── Zero-downtime rolling restart ────────────────────────────────────────────
log "🔄 Restarting containers with new images..."
cd "${DEPLOY_DIR}"

# Bring down old containers gracefully (30s timeout)
docker compose -f docker-compose.yml down --timeout 30 || warn "No existing containers to stop."

# Start new containers in detached mode
docker compose -f docker-compose.yml up -d --remove-orphans \
  || fail "docker compose up failed. Check container logs: docker compose logs"

# ── Wait for server to become healthy ────────────────────────────────────────
log "⏳ Waiting for server health check (max 60s)..."
ATTEMPTS=0
MAX_ATTEMPTS=12  # 12 × 5s = 60s

until docker compose -f docker-compose.yml ps server | grep -q "healthy"; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "${ATTEMPTS}" -ge "${MAX_ATTEMPTS}" ]; then
    fail "Server container did not become healthy within 60 seconds."
  fi
  warn "   Attempt ${ATTEMPTS}/${MAX_ATTEMPTS} — waiting 5s..."
  sleep 5
done

log "✅ Server container is healthy."

# ── Cleanup ───────────────────────────────────────────────────────────────────
log "🧹 Pruning dangling Docker images..."
docker image prune -f --filter "until=24h" || true

# ── Docker Hub Logout ─────────────────────────────────────────────────────────
docker logout || true

# ── Summary ───────────────────────────────────────────────────────────────────
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "🎉 Deployment complete!"
log "   Server : http://\$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'EC2_HOST'):5000/api/health"
log "   Client : http://\$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'EC2_HOST')"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
