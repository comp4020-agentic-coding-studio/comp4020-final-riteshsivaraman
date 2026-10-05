# syntax = docker/dockerfile:1

# Seen: Hono + Preact SPA. The image Fly builds and runs: install, build the
# client bundle, keep only production deps and the server source (run via
# tsx --- no server-side compile step, see package.json).

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Hono"

WORKDIR /app
ENV NODE_ENV=production

ARG PNPM_VERSION=11.9.0
RUN npm install -g pnpm@$PNPM_VERSION

# --- build stage: install everything, build the client, prune to prod deps -
FROM base AS build

# toolchain for native modules (better-sqlite3), in case no prebuilt binary
# matches the image platform (crit 7's Dockerfile hit the same need)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm run build
RUN pnpm prune --prod

# --- runtime stage: just the server source, static client bundle, prod deps
FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y sqlite3 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/static /app/static
COPY --from=build /app/src/server /app/src/server
COPY --from=build /app/drizzle /app/drizzle
COPY --from=build /app/README.md /app/README.md
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/tsconfig.json /app/tsconfig.json

ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_PATH=/data/app.db
EXPOSE 8080
CMD ["npx", "tsx", "src/server/index.ts"]
