FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS web-deps
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
    sh scripts/pnpm-install-retry.sh --filter @provider/web --frozen-lockfile --trust-lockfile

FROM web-deps AS web-sources
COPY . .

FROM web-sources AS publisher
CMD ["sh", "apps/web/scripts/publish-static.sh"]

FROM web-sources AS build
ARG PUBLIC_API_URL
ARG SITE_DATA_API_URL
ARG PUBLIC_SITE_URL
ARG PUBLIC_SITE_SLUG
ARG PUBLIC_YANDEX_METRIKA_ID
ARG PUBLIC_CONNECTION_PHONE
ARG PUBLIC_SUPPORT_PHONE
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV SITE_DATA_API_URL=$SITE_DATA_API_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ENV PUBLIC_SITE_SLUG=$PUBLIC_SITE_SLUG
ENV PUBLIC_YANDEX_METRIKA_ID=$PUBLIC_YANDEX_METRIKA_ID
ENV PUBLIC_CONNECTION_PHONE=$PUBLIC_CONNECTION_PHONE
ENV PUBLIC_SUPPORT_PHONE=$PUBLIC_SUPPORT_PHONE
RUN pnpm --filter @provider/web run build

FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0 AS coolify-server
COPY deploy/coolify-web.Caddyfile /etc/caddy/Caddyfile

FROM web-deps AS publication-runtime
RUN apk add --no-cache 'zlib>=1.4-r0'
COPY .npmrc ./.npmrc
COPY apps/web ./apps/web
COPY apps/api/src ./apps/api/src
COPY scripts ./scripts
COPY deploy/coolify-web.Caddyfile ./deploy/coolify-web.Caddyfile
COPY --from=coolify-server /usr/bin/caddy /usr/bin/caddy
EXPOSE 80
CMD ["node", "apps/web/scripts/publication/runtime.mjs"]

FROM coolify-server
RUN apk add --no-cache 'zlib>=1.4-r0'
COPY --from=build /workspace/apps/web/dist /srv
RUN mv /srv/redirects.caddy /etc/caddy/redirects.caddy
COPY deploy/web.Caddyfile /etc/caddy/Caddyfile
