# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Build & Assets Compilation
# ==============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Optimize Node memory and Playwright download behavior during build
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy dependency manifests first for optimal Docker layer caching
COPY package.json package-lock.json* ./

# Install all dependencies required for compiling the frontend and bundling the server
RUN npm ci || npm install --include=dev

# Copy complete application source
COPY . .

# Build Vite client SPA (dist/) + bundle Express server with esbuild (dist/server.cjs)
RUN npm run build

# Download only Chromium and headless-shell needed for web automation/testing
RUN npx playwright install chromium chromium-headless-shell && \
    chmod -R 777 /ms-playwright

# Remove devDependencies to minimize production image footprint
RUN npm prune --omit=dev


# ==============================================================================
# Stage 2: Production Runtime (Cloud Run, ECS, Kubernetes, or Docker)
# ==============================================================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# ==============================================================================
# System dependencies for Playwright, Chromium & Headless execution on Debian 12
# ==============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    procps \
    xvfb \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    fonts-unifont \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-tlwg-loma-otf \
    xfonts-scalable \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libfontconfig1 \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/*


# ==============================================================================
# Create runtime directories & symlinks for browser caching
# ==============================================================================
RUN mkdir -p \
    /app/data/artifacts \
    /app/data/project_backups \
    /app/public \
    /app/extension \
    /root/.cache \
    && chmod -R 777 /app/data \
    && ln -sfn /ms-playwright /tmp/ms-playwright \
    && ln -sfn /ms-playwright /root/.cache/ms-playwright


# ==============================================================================
# Copy application files & production dependencies
# ==============================================================================
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules

# Compiled application & assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/extension ./extension
COPY --from=builder /app/data ./data

# Application state and configuration files
COPY --from=builder /app/*.json ./

# Pre-downloaded Playwright browser binaries
COPY --from=builder /ms-playwright /ms-playwright


# ==============================================================================
# Local runtime persistence/cache permissions
# ==============================================================================
RUN chmod -R 777 /app/data /ms-playwright && \
    touch /app/ai_cache_store.json && \
    chmod 666 /app/ai_cache_store.json


# ==============================================================================
# Container Networking
# ==============================================================================
EXPOSE 8080
EXPOSE 3000


# ==============================================================================
# Health Check
# ==============================================================================
HEALTHCHECK --interval=30s \
    --timeout=5s \
    --start-period=20s \
    --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"


# ==============================================================================
# Start Production Server
# ==============================================================================
CMD ["node", "dist/server.cjs"]
