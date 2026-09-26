FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm -r --sort --filter '@forgelex/persistence...' --filter '@forgelex/source-providers...' run build

FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /src/node_modules ./node_modules
COPY --from=build --chown=node:node /src/packages ./packages
COPY --from=build --chown=node:node /src/scripts/ingest-stj-open-data.mjs ./scripts/ingest-stj-open-data.mjs
COPY --from=build --chown=node:node /src/scripts/report-stj-freshness.mjs ./scripts/report-stj-freshness.mjs

USER node
CMD ["node", "scripts/ingest-stj-open-data.mjs", "--incremental", "--single-flight"]
