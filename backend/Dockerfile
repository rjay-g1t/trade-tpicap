# Build context is the repo root (see docker-compose.yml), because the backend
# depends on the `shared` workspace and reads migrations from `database/`.

# ---- Build: install the backend's dependencies and bundle it (tsup inlines `shared`) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace @trade-blotter/backend
COPY shared shared
COPY backend backend
RUN npm run build --workspace @trade-blotter/backend

# ---- Runtime: production dependencies, the bundle and the SQL migrations ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace @trade-blotter/backend --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
COPY database/migrations database/migrations
USER node
EXPOSE 3000
CMD ["node", "backend/dist/index.js"]
