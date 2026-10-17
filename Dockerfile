# Production image: Next.js standalone server plus a one-off migration runner.
# Built by GitHub Actions; see deploy/ for how the server runs it.

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile

FROM base AS build
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The db module needs a connection string when pages are loaded during the build;
# nothing connects to it. The real one comes from the server at runtime.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm build
# The migration runner needs the full drizzle-orm and postgres packages (both have no
# dependencies); the standalone output only keeps the files the app itself imports.
RUN mkdir -p /migrate/node_modules \
  && cp -rL node_modules/drizzle-orm node_modules/postgres /migrate/node_modules/ \
  && cp scripts/migrate.mjs /migrate/ \
  && cp -r drizzle /migrate/drizzle

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /migrate ./migrate
USER node
EXPOSE 3000
CMD ["node", "server.js"]
