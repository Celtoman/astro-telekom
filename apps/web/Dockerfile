FROM node:22.23.2-alpine AS source
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile

FROM source AS publisher
CMD ["sh", "apps/web/scripts/publish-static.sh"]

FROM source AS build
ARG PUBLIC_API_URL
ARG SITE_DATA_API_URL
ARG PUBLIC_SITE_URL
ARG PUBLIC_SITE_SLUG
ARG PUBLIC_YANDEX_METRIKA_ID
ARG PUBLIC_SUPPORT_PHONE
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV SITE_DATA_API_URL=$SITE_DATA_API_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ENV PUBLIC_SITE_SLUG=$PUBLIC_SITE_SLUG
ENV PUBLIC_YANDEX_METRIKA_ID=$PUBLIC_YANDEX_METRIKA_ID
ENV PUBLIC_SUPPORT_PHONE=$PUBLIC_SUPPORT_PHONE
RUN pnpm --filter @provider/web run build

FROM caddy:2.11.4-alpine AS coolify-server
COPY deploy/coolify-web.Caddyfile /etc/caddy/Caddyfile

FROM caddy:2.11.4-alpine
COPY --from=build /workspace/apps/web/dist /srv
RUN mv /srv/redirects.caddy /etc/caddy/redirects.caddy
COPY deploy/web.Caddyfile /etc/caddy/Caddyfile
