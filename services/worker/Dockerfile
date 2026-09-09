FROM node:22.23.2-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY services/worker/package.json ./services/worker/package.json
COPY packages/database/package.json ./packages/database/package.json
RUN pnpm install --frozen-lockfile
COPY . .

FROM node:22.23.2-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/services/worker ./services/worker
COPY --from=build /workspace/package.json ./package.json
CMD ["node", "services/worker/src/index.mjs"]
