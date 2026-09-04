# ============================================================
# CF Manager — All-in-One Docker Image
# 单容器：Node.js 后端 + 前端静态文件（无 nginx）
# ============================================================

# ---- Stage 1: Build Frontend ----
FROM node:24-alpine AS frontend-builder

WORKDIR /app
COPY frontend/package*.json ./
# 使用 npm install 而非 npm ci：lock 在 macOS 生成、Docker 为 Linux，
# 平台专属可选原生依赖（如 @emnapi/core）版本不一致会导致 npm ci 严格校验失败。
RUN --mount=type=cache,target=/root/.npm npm install
COPY frontend/tsconfig*.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

# ---- Stage 2: Build Backend ----
FROM node:24-alpine AS backend-builder

RUN --mount=type=cache,target=/var/cache/apk apk add --no-cache python3 make g++

WORKDIR /app
COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install
COPY backend/tsconfig.json ./
COPY scripts/gen-version.js ./scripts/gen-version.js
COPY CHANGELOG.md ./CHANGELOG.md
COPY backend/src ./src
# 版本信息：从 CHANGELOG.md 提取版本号，git commit 通过 build-arg 注入（缺省为空）
ARG GIT_COMMIT=""
ENV BACKEND_SRC=/app/src
ENV GIT_COMMIT=${GIT_COMMIT}
RUN node scripts/gen-version.js backend
# model-pricing.json / catalog.schema.json / catalogValidator.ts 均为 .gitignore 的
# 生成产物（来源在 shared/，本地由 scripts/sync-shared.js 生成），Docker 中需手动拷贝。
COPY shared/model-pricing.json ./src/data/model-pricing.json
COPY shared/catalog.schema.json ./src/services/catalog.schema.json
COPY shared/catalogValidator.ts ./src/services/catalogValidator.ts
# catalog 校验器由 ajv standalone 预编译生成（运行时避免 new Function，兼容 Cloudflare）。
COPY scripts/gen-catalog-validator.js ./scripts/gen-catalog-validator.js
RUN CATALOG_SCHEMA_PATH=/app/src/services/catalog.schema.json \
    CATALOG_VALIDATOR_OUT=/app/src/services/catalogValidate.generated.ts \
    node scripts/gen-catalog-validator.js
RUN npx tsc
# Prune dev deps in builder so production just copies clean node_modules
RUN npm prune --omit=dev

# ---- Stage 3: Production (All-in-One) ----
FROM node:24-alpine

WORKDIR /app

# Backend: compiled dist + production node_modules
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/dist ./dist

# Frontend: built static assets (served by Express via express.static)
COPY --from=frontend-builder /app/dist ./public

RUN mkdir -p /app/data

ENV PORT=3000
ENV DB_PATH=/app/data/cf-manager.db

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

# 以非 root 用户运行，降低容器被攻破后的影响面（需确保 /app/data 可写）
# node:24-alpine 已自带 node 用户/组（UID/GID = 1000），无需 adduser/addgroup。
# /app/data 由上一行的 mkdir 在 root 下创建，chown 后由 node 拥有可写。
RUN chown -R node:node /app
USER node

CMD ["node", "dist/index.js"]
