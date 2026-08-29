# better-sqlite3 needs a native build; node:*-alpine (musl) frequently has no
# prebuilt binary for it, so this stage keeps build tools available as a
# fallback and the final stage stays slim without them.
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

FROM node:20-slim
LABEL name="socgrid"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
EXPOSE 3000
CMD ["node", "app.js"]
