# Multi-stage build for optimized production image

# Stage 1: Dependencies
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DOCKER_BUILD=1

# Build-time defaults for NEXT_PUBLIC_* vars (inlined into client JS bundle).
# Auth client uses window.location.origin at runtime, so no URL placeholders needed.
ENV NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false
ENV NEXT_PUBLIC_AUTH_AZURE_ENABLED=false

# Dummy secret for build-time (real value injected at runtime via env vars).
ENV BETTER_AUTH_SECRET=docker-build-placeholder-secret-not-used-at-runtime
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder

RUN pnpm build

# Stage 3: Runner
FROM node:24-alpine AS runner
RUN apk add --no-cache curl openssl netcat-openbsd
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy prisma config, schema + migrations for migrate deploy, and seed source
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

# Copy package files and install only what's needed for migrations/seed
COPY package.json pnpm-lock.yaml* ./
RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
    pnpm install --prod --frozen-lockfile --ignore-scripts && \
    pnpm add prisma tsx && \
    DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
    pnpm exec prisma generate

# Copy entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
