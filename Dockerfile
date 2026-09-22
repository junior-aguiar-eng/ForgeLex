FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @forgelex/api deploy --prod /runtime
RUN find /runtime/node_modules/.pnpm -path '*/node_modules/@forgelex/*/src' -type d -prune -exec rm -rf '{}' +

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    FORGELEX_WEB_ROOT=/app/web

WORKDIR /app

COPY --from=build --chown=node:node /runtime ./api
COPY --from=build --chown=node:node /src/apps/web/dist ./web

USER node
EXPOSE 8080

CMD ["node", "api/dist/server.js"]
