# ---- 1. Frontend build ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- 2. Server ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY server/ server/
COPY database/ database/
COPY --from=client /app/client/dist client/dist
RUN mkdir -p server/storage && chown -R node:node server/storage
USER node
WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
# Эхлэхдээ хэрэгжээгүй migration-уудыг ажиллуулна (өгөгдөл устгахгүй)
CMD ["sh", "-c", "node scripts/migrate.js && exec node src/index.js"]
