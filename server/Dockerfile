# Stage 1: Install dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files only (cache-optimized layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Runtime image
FROM node:20-alpine AS runner

# Set node env for production
ENV NODE_ENV=production

WORKDIR /app

# Copy installed production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all server source files
COPY . .

# Expose the API port
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]
