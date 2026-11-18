# Үе 5: олон шатлалт build — эцсийн image-д зөвхөн production хамаарал, build хийсэн UI, migration.
# npm/yarn, dev хамаарал, тест, seed (жишээ хэрэглэгч), reset скрипт орохгүй (.dockerignore).

# ---- 1. Frontend build ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- 2. Серверийн production хамаарал ----
FROM node:22-alpine AS deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force \
 # Ажиллахад хэрэггүй файлууд (README, source map, TypeScript тодорхойлолт). Хавтас устгахгүй — runtime код эвдэхгүй
 && find node_modules -type f \( -name '*.md' -o -name '*.map' -o -name '*.d.ts' -o -name '*.d.cts' -o -name '*.d.mts' \) -delete

# ---- 3. Ажиллах image ----
FROM node:22-alpine
ENV NODE_ENV=production
# Ажиллах үед npm, yarn, corepack хэрэггүй — эмзэг байдлын гадаргуу, хэмжээг багасгана
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=deps --chown=root:root /app/server/node_modules server/node_modules
COPY --chown=root:root server/package.json server/
COPY --chown=root:root server/src server/src
COPY --chown=root:root server/scripts server/scripts
COPY --chown=root:root database/ database/
COPY --from=client --chown=root:root /app/client/dist client/dist
# Код root-ийнх (зөвхөн уншина); бичих эрх зөвхөн хувийн файлын хавтсанд
RUN mkdir -p server/storage && chown node:node server/storage && chmod 700 server/storage
USER node
WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1
# Эхлэхдээ DB-г хүлээж, хэрэгжээгүй migration-уудыг ажиллуулна (өгөгдөл устгахгүй), дараа нь сервер.
# exec → node нь PID 1-ийн хүүхэд биш, дохиог (SIGTERM) шууд хүлээн авч зөв зогсоно (compose: init: true).
CMD ["sh", "-c", "node scripts/migrate.js --wait 60 && exec node src/index.js"]
