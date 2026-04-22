# Production image for the Knowledge Vault API server.
#
# Multi-stage:
#   1. builder: install deps + esbuild bundle
#   2. runtime: slim image with only the bundle + runtime deps
#
# Usage:
#   docker build -t knowledge-vault-api .
#   docker run -p 3000:3000 --env-file .env knowledge-vault-api

FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
      && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- runtime stage ---
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      wget tini \
      && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/setup-db.ts ./server/setup-db.ts

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
