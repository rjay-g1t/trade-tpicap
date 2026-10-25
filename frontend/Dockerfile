# Build context is the repo root (see docker-compose.yml), because the frontend
# depends on the `shared` workspace and the root TypeScript config.

# ---- Build: type-check and bundle the app ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace @trade-blotter/frontend --include-workspace-root
COPY shared shared
COPY frontend frontend
RUN npm run build --workspace @trade-blotter/frontend

# ---- Runtime: nginx serves the static files and proxies /api to the backend ----
FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
