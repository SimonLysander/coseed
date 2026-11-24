ARG NODE_IMAGE_REPOSITORY=docker.io/library/node
FROM ${NODE_IMAGE_REPOSITORY}:26.13.0-bookworm-slim AS base
WORKDIR /app

FROM base AS build
ARG NPM_CONFIG_REGISTRY
COPY package.json package-lock.json .npmrc ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" && npm ci --no-audit --no-fund
COPY tsconfig*.json vite.config.ts ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production COSEED_DATA_DIR=/var/lib/coseed
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses
COPY --from=build /app/package.json ./
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/dist/contracts ./dist/contracts
COPY --from=build /app/dist/web ./dist/web
COPY --from=build /app/node_modules ./node_modules
COPY migrations ./migrations
COPY docs/operations/agent-integration.md ./docs/operations/agent-integration.md
COPY docker/start.mjs ./docker/start.mjs
RUN mkdir -p /var/lib/coseed && chown node:node /var/lib/coseed
USER node
EXPOSE 4310
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.COSEED_PORT || 4310) + '/api/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "docker/start.mjs"]
