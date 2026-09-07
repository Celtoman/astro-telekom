FROM node:22.23.2-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile

FROM node:22.23.2-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/services/worker ./services/worker
COPY --from=build /workspace/package.json ./package.json
CMD ["node", "services/worker/src/index.mjs"]
