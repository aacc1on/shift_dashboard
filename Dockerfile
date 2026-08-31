# @libsql/client ships prebuilt native binaries for linux-x64 (both glibc and
# musl) — no build toolchain needed, unlike the better-sqlite3 setup this
# replaced.
FROM node:20-slim
LABEL name="socgrid"
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "app.js"]
