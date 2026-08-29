# SOCGrid

Shift-handover dashboard for a 24/7 SOC team — live duty board, schedule editor with fair AI-assisted rotation, swap requests, mandatory handover reports, and a documents repository.

## Stack

Node.js, Express, EJS, SQLite (`better-sqlite3`).

## Local development

```
npm install
cp .env.example .env   # fill in values as needed
npm run dev
```

Default login: `admin` / `soc2026` — change it (or reset any account's password) from the admin panel's User Management page once logged in.

## Docker

```
docker compose up --build
```

## Deployment

Ships with a `Dockerfile` for Render or any Docker-based PaaS. See `.env.example` for required/optional environment variables — `DATA_DIR` for where the SQLite database lives, and `OPENROUTER_API_KEY` to enable AI-assisted schedule generation (falls back to a deterministic fair-rotation generator without it).
