FROM node:22.23.2-alpine AS build
WORKDIR /workspace
RUN corepack enable
ENV DATABASE_URL=postgresql://provider:provider@localhost:5432/provider_platform
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @provider/database generate
RUN pnpm --filter @provider/api run build

FROM node:22.23.2-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/generated ./generated
COPY --from=build /workspace/prisma ./prisma
COPY --from=build /workspace/prisma.config.ts ./prisma.config.ts
COPY --from=build /workspace/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
