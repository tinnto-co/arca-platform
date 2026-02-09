# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.2.19 AS base
WORKDIR /usr/src/app

# install dependencies
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# build stage
FROM base AS prerelease
COPY --from=install /usr/src/app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run build

# production stage
FROM base AS release
COPY --from=install /usr/src/app/node_modules ./node_modules
COPY --from=prerelease /usr/src/app/dist ./dist
COPY --from=prerelease /usr/src/app/server.ts ./server.ts
COPY --from=prerelease /usr/src/app/lib ./lib
COPY --from=prerelease /usr/src/app/src ./src
COPY --from=prerelease /usr/src/app/drizzle ./drizzle
COPY --from=prerelease /usr/src/app/tsconfig.json ./tsconfig.json
COPY package.json ./

# Fix permissions before switching to non-root user
RUN chown -R bun:bun /usr/src/app

# run the app
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "start"]