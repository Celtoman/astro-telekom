FROM node:22.23.2-alpine AS worker-deps
WORKDIR /workspace
RUN corepack enable
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY services/worker/package.json ./services/worker/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY scripts/pnpm-install-retry.sh ./scripts/pnpm-install-retry.sh
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    sh scripts/pnpm-install-retry.sh --filter @provider/worker --prod --frozen-lockfile --trust-lockfile
COPY services/worker ./services/worker

FROM node:22.23.2-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=worker-deps /workspace/node_modules ./node_modules
COPY --from=worker-deps /workspace/services/worker ./services/worker
COPY --from=worker-deps /workspace/package.json ./package.json
CMD ["node", "services/worker/src/index.mjs"]
