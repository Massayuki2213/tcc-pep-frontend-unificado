# ── Stage 1: build Angular ──────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: serve com nginx ────────────────────────────────────
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist/tcc-pep-frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
