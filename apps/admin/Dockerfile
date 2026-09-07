FROM node:22.23.2-alpine AS build
WORKDIR /workspace
RUN corepack enable
ARG PUBLIC_API_URL
ARG PUBLIC_PROVIDER_ID
ARG PUBLIC_SITE_ID
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_PROVIDER_ID=$PUBLIC_PROVIDER_ID
ENV PUBLIC_SITE_ID=$PUBLIC_SITE_ID
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @provider/admin run build

FROM caddy:2.11.4-alpine
COPY --from=build /workspace/apps/admin/dist /srv
COPY deploy/static.Caddyfile /etc/caddy/Caddyfile
