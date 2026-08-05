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
ARG VITE_BETTER_AUTH_URL
ENV VITE_BETTER_AUTH_URL=$VITE_BETTER_AUTH_URL
COPY --from=install /usr/src/app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run build

# production stage
FROM base AS release

# curl is required for container healthchecks (Coolify/Docker)
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Se copia desde `prerelease` y no desde `install` a propósito. Con `install`,
# BuildKit ve que esta etapa no depende del build y la arranca en paralelo:
# los ~58s de copiar node_modules caían justo sobre el pico de memoria del
# bundling, en un servidor que ya está al límite. Tomándolo de `prerelease`
# la etapa queda encadenada y espera a que el build termine.
#
# Cada COPY lleva --chown en vez de un `RUN chown -R` al final: recorrer
# node_modules entero para cambiarle el dueño tardaba ~145s y duplicaba esas
# capas en la imagen.
COPY --from=prerelease --chown=bun:bun /usr/src/app/node_modules ./node_modules
COPY --from=prerelease --chown=bun:bun /usr/src/app/dist ./dist
COPY --from=prerelease --chown=bun:bun /usr/src/app/server.ts ./server.ts
COPY --from=prerelease --chown=bun:bun /usr/src/app/lib ./lib
COPY --from=prerelease --chown=bun:bun /usr/src/app/src ./src
COPY --from=prerelease --chown=bun:bun /usr/src/app/drizzle ./drizzle
COPY --from=prerelease --chown=bun:bun /usr/src/app/tsconfig.json ./tsconfig.json
COPY --chown=bun:bun package.json ./

# run the app
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "start"]