# syntax=docker/dockerfile:1
#
# 在 monorepo 根目录构建:
#   docker build -t ai-chatbot:local -f Dockerfile .
#
# 运行（需外部 Postgres/Redis，或下一步用 compose）:
#   docker run --rm -p 3000:3000 \
#     -e DATABASE_URL=... -e REDIS_URL=... -e DEEPSEEK_API_KEY=... \
#     ai-chatbot:local

ARG NODE_VERSION=20

# ---------------------------------------------------------------------------
# deps: 安装 workspace 依赖（含原生模块编译工具）
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/ai-chatbot/package.json ./apps/ai-chatbot/

# 只装 ai-chatbot 及其依赖图（含 workspace 包）
RUN pnpm install --frozen-lockfile --filter ai-chatbot...

# ---------------------------------------------------------------------------
# builder: prisma generate + next build (standalone)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app ./
COPY apps/ai-chatbot ./apps/ai-chatbot

WORKDIR /app/apps/ai-chatbot

# 构建期占位；运行时由 compose/env 覆盖
ENV DATABASE_URL="postgresql://postgres:123456@postgres:5432/clorisdb"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm exec prisma generate \
  && pnpm exec next build

# ---------------------------------------------------------------------------
# runner: 仅 standalone + static + public
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# standalone 根目录含 apps/ai-chatbot/server.js 与精简 node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-chatbot/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-chatbot/.next/static ./apps/ai-chatbot/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-chatbot/public ./apps/ai-chatbot/public

# Prisma 客户端生成物（自定义 output）；schema 供后续 migrate 使用
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-chatbot/app/generated ./apps/ai-chatbot/app/generated
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-chatbot/prisma ./apps/ai-chatbot/prisma
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-chatbot/prisma.config.ts ./apps/ai-chatbot/prisma.config.ts

USER nextjs

EXPOSE 3000

# monorepo standalone 入口
CMD ["node", "apps/ai-chatbot/server.js"]
