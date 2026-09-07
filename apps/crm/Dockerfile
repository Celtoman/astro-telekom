FROM node:22.23.2-alpine AS build
WORKDIR /workspace
RUN corepack enable
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=$PUBLIC_API_URL
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @provider/crm run build

FROM caddy:2.11.4-alpine
COPY --from=build /workspace/apps/crm/dist /srv
COPY deploy/static.Caddyfile /etc/caddy/Caddyfile
