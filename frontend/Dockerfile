# ── Stage 1: Potree ──────────────────────────────────────────────────────────
# Clone the develop branch (COPC support lives there, not in any release).
# The build/ directory is committed to the repo so we might not need to build,
# but we run the build step anyway to ensure up-to-date workers are present.
FROM node:20-alpine AS potree
RUN apk add --no-cache git
WORKDIR /potree
RUN git clone --depth 1 -b develop https://github.com/potree/potree.git .
# Only build if the pre-built library is absent (it is often committed)
RUN if [ ! -f "build/potree/potree.js" ]; then npm install && npm run build; fi

# ── Stage 2: TypeScript frontend ─────────────────────────────────────────────
FROM node:20-alpine AS app
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 3: nginx ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
# Potree library at /potree/ (paths match index.html references)
COPY --from=potree /potree/build/potree /usr/share/nginx/html/potree/build/potree
COPY --from=potree /potree/libs         /usr/share/nginx/html/potree/libs
# Our compiled TypeScript app
COPY --from=app /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
