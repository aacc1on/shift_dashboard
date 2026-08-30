# SOCGrid

Shift-handover dashboard for a 24/7 SOC (or any shift-based) team — live duty board, schedule editor with fair AI-assisted rotation, swap requests, mandatory handover reports, a documents repository with access control, team chat, and broadcast announcements.

## Features

- **Live duty board** — who's on shift right now, who's next, real-time countdowns.
- **Schedule editor** — manual editing plus an AI-assisted (or deterministic fallback) fair-rotation generator that never rotates a shift backward and balances workload across the team.
- **Swap requests** — operators can hand off a shift to a named colleague, who accepts or rejects it.
- **Handover reports** — a shift can't be marked closed until its report is filed; the next operator sees it immediately.
- **Documents** — markdown, categorized, with visibility levels from team-wide to a restricted per-user allow-list.
- **Team chat** — a shared channel plus private direct messages.
- **Broadcast announcements** — a lead can flash a message across every dashboard.
- **User management** — add/remove team members, reset passwords, activate/deactivate, all from the UI.

## Getting started

```
npm install
cp .env.example .env   # fill in values as needed
npm run dev
```

A fresh install creates exactly **one** account — no demo data, no sample team. On first boot, the server logs its username/password to the console (`admin` / `soc2026` by default; override with `SOC_USER`/`SOC_PASS` env vars for a scripted deploy). Log in, then:

1. Change that password immediately — click your profile badge (top of any page) → Change Password.
2. Add your team — Admin → Users → **+ Add Team Member** (or add people directly from the schedule editor, which creates their account automatically).

## Stack

Node.js, Express, EJS, SQLite (`better-sqlite3`).

## Docker

```
docker compose up --build
```

## Deployment

Ships with a `Dockerfile` for Render or any Docker-based PaaS. See `.env.example` for environment variables — `DATA_DIR` for where the SQLite database lives (point it at a persistent volume in production), `SOC_USER`/`SOC_PASS` for the initial account, and `OPENROUTER_API_KEY` to enable AI-assisted schedule generation (falls back to a deterministic fair-rotation generator without it).

## License

MIT — see [LICENSE](LICENSE).
