# ─────────────────────────────────────────────────────────────────────────────
# PRISM — production Dockerfile (multi-stage)
#
# Stage 1 (deps):    install production + dev dependencies cleanly
# Stage 2 (builder): copy source, run `next build` with standalone output
# Stage 3 (runner):  minimal Alpine image — only the standalone artefacts
#
# Why standalone?
#   next.config.mjs sets output:'standalone'. Next.js emits a self-contained
#   server.js + bundled node_modules so the final image needs NO node_modules
#   folder and starts in ~50 MB instead of ~600 MB.
#
# Cache discipline:
#   No BuildKit cache mounts are used. Every layer is deterministic.
#   node_modules/.cache never survives between stages.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: install all deps ─────────────────────────────────────────────────
FROM node:22-alpine AS deps

# libc6-compat is needed by some native Node addons on Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy lockfile + manifest only — layer is cached until they change
COPY package.json package-lock.json ./

# npm ci: clean install from lockfile, no surprises, no leftover caches
RUN npm ci


# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Bring in installed modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source (respects .dockerignore — node_modules, .next excluded)
COPY . .

# Disable Next.js anonymous telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build — outputs to .next/standalone because next.config.mjs sets output:'standalone'
RUN npm run build


# ── Stage 3: runner (minimal production image) ────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Static assets (served by Next.js CDN layer)
COPY --from=builder /app/public ./public

# Standalone server bundle — self-contained, includes bundled node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static

# DB init script — runs at startup before the server.
# Must be copied explicitly; it is not part of the standalone bundle.
# It uses `pg` which is available via the standalone node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Schema SQL read by scripts/init_db.mjs at startup.
# Without this, init_db crashes with ENOENT and the container never serves.
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/schema.sql ./lib/db/schema.sql

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Railway overrides this with startCommand from railway.toml:
#   node scripts/init_db.mjs && node server.js
# CMD here is the fallback for plain `docker run` without Railway.
CMD ["node", "server.js"]
