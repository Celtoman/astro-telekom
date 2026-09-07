FROM node:22.23.2-alpine AS build
WORKDIR /workspace
RUN corepack enable
ARG PUBLIC_API_URL
ARG PUBLIC_SITE_URL
ARG PUBLIC_YANDEX_METRIKA_ID
ARG PUBLIC_SUPPORT_PHONE
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ENV PUBLIC_YANDEX_METRIKA_ID=$PUBLIC_YANDEX_METRIKA_ID
ENV PUBLIC_SUPPORT_PHONE=$PUBLIC_SUPPORT_PHONE
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @provider/web run build

FROM caddy:2.11.4-alpine
COPY --from=build /workspace/apps/web/dist /srv
COPY deploy/static.Caddyfile /etc/caddy/Caddyfile
