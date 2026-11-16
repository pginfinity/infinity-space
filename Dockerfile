# Infinity Space: servidor do mundo + app web compilado, numa imagem só.
# Build:  docker build -t infinity-space .
# Uso em produção: deploy/docker-compose.yml (com LiveKit e Caddy).

# ---- compila o app web ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/world/package.json packages/world/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts
COPY packages ./packages
COPY apps ./apps
RUN npm run build -w @infinity/web

# ---- imagem final: só o necessário para rodar ----
FROM node:24-bookworm-slim
# ffmpeg codifica as gravações de reunião (Opus).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    STATIC_DIR=/app/apps/web/dist \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    DATA_DIR=/var/lib/infinity/data \
    PORT=2567
COPY package.json package-lock.json ./
COPY packages/world/package.json packages/world/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts --workspace @infinity/server --workspace @infinity/world \
  && npm cache clean --force
COPY packages/world ./packages/world
COPY apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /var/lib/infinity/data && chown -R node:node /var/lib/infinity
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:2567/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
