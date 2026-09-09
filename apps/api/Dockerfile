FROM node:22.23.2-alpine AS build
WORKDIR /workspace
RUN corepack enable
ENV DATABASE_URL=postgresql://provider:provider@localhost:5432/provider_platform
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY services/worker/package.json ./services/worker/package.json
COPY packages/database/package.json ./packages/database/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @provider/database generate
RUN pnpm --filter @provider/api run build

FROM node:22.23.2-alpine
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/generated ./apps/api/generated
COPY --from=build /workspace/prisma ./prisma
COPY --from=build /workspace/prisma.config.ts ./prisma.config.ts
COPY --from=build /workspace/package.json ./package.json
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
