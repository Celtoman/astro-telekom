FROM node:22.23.2-alpine AS manifests
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY services/worker/package.json ./services/worker/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY scripts/pnpm-install-retry.sh ./scripts/pnpm-install-retry.sh

FROM manifests AS build-deps
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    sh scripts/pnpm-install-retry.sh --filter @provider/api --filter @provider/database --frozen-lockfile --trust-lockfile

FROM manifests AS runtime-deps
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    sh scripts/pnpm-install-retry.sh --filter @provider/api --prod --frozen-lockfile --trust-lockfile

FROM build-deps AS build
ENV DATABASE_URL=postgresql://provider:provider@localhost:5432/provider_platform
COPY . .
RUN pnpm --filter @provider/database generate
RUN pnpm --filter @provider/api run build

FROM node:22.23.2-alpine AS migration
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build-deps /workspace/node_modules ./node_modules
COPY --from=build-deps /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/generated ./apps/api/generated
COPY --from=build /workspace/prisma ./prisma
COPY --from=build /workspace/prisma.config.ts ./prisma.config.ts

FROM node:22.23.2-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/package.json ./package.json
COPY --from=runtime-deps /workspace/node_modules ./node_modules
COPY --from=runtime-deps /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/generated ./apps/api/generated
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
