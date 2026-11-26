FROM node:22.23.4-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY services/worker/package.json ./services/worker/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY scripts/pnpm-install-retry.sh ./scripts/pnpm-install-retry.sh
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    sh scripts/pnpm-install-retry.sh --filter @provider/admin --frozen-lockfile --trust-lockfile
COPY . .
ARG PUBLIC_API_URL
ARG PUBLIC_PROVIDER_ID
ARG PUBLIC_SITE_ID
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_PROVIDER_ID=$PUBLIC_PROVIDER_ID
ENV PUBLIC_SITE_ID=$PUBLIC_SITE_ID
RUN pnpm --filter @provider/admin run build

FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
RUN apk add --no-cache 'zlib>=1.4-r0'
COPY --from=build /workspace/apps/admin/dist /srv
COPY deploy/static.Caddyfile /etc/caddy/Caddyfile
