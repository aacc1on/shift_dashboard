# SOCGrid

Shift-handover dashboard for a 24/7 SOC (or any shift-based) team — live duty board, schedule editor with fair AI-assisted rotation, swap requests, mandatory handover reports, a documents repository with access control, team chat, broadcast announcements, network diagrams, and automatic backups.

## Features

- **Live duty board** — who's on shift right now, who's next, real-time countdowns.
- **Schedule editor** — manual editing plus an AI-assisted (or deterministic fallback) fair-rotation generator that never rotates a shift backward and balances workload across the team.
- **Swap requests** — operators can hand off a shift to a named colleague, who accepts or rejects it.
- **Handover reports** — a shift can't be marked closed until its report is filed; the next operator sees it immediately.
- **Documents** — markdown, categorized, with visibility levels from team-wide to a restricted per-user allow-list.
- **Team chat** — a shared channel plus private direct messages.
- **Broadcast announcements** — a lead can flash a message across every dashboard.
- **User management** — add/remove team members, reset passwords, activate/deactivate, all from the UI.
- **Network diagrams** — a shared canvas (drag-and-drop nodes, connect them) for sketching network topology, saved alongside everything else.
- **Automatic backups** — a full row-level snapshot of the database on every boot and daily thereafter, plus an optional off-site sync of documents + the database to Google Drive.

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

Node.js, Express, EJS, SQLite — via `@libsql/client`, which speaks to either
a plain local `.db` file (the default, zero setup) or a remote [Turso](https://turso.tech)
database with the exact same code, which is what makes the free Render
deployment below possible (see "Deploying for free").

## Docker

```
docker compose up --build
```

Uses the included `Dockerfile` + `docker-compose.yml`. `./data` is mounted as a volume, so the database survives container rebuilds/restarts the same way it does on a bare-metal install.

---

## Running directly on a server (Windows or any OS, no Docker)

This is the setup for a small team's own machine — plain `node`/`nodemon` in a
console window, no process manager, no container.

### Why `git pull` never touches your data

The database (`data/baton.db`) lives inside `data/`, and `data/` is in
`.gitignore`. `git pull` only ever touches files git tracks, so it can never
overwrite, delete, or reset anything in `data/` — new users, schedule
changes, chat messages, documents, everything, survive every update
untouched. The same is true of `audit.log`.

The only two things that make an update risky are things `git` doesn't
control:

- **Someone manually deletes or edits `data/`** — not a `git` operation, so
  no `git` safeguard helps here; that's what the backups below are for.
- **A code change alters the database schema.** Every migration in `db.js`
  is written to be non-destructive on an existing database (it checks
  whether a column/table already exists before adding it, and never drops
  data) — keep any future schema change to that same pattern.

### First-time setup

```
git clone <your fork's URL> socgrid
cd socgrid
npm install
copy .env.example .env
notepad .env    :: fill in SOC_USER / SOC_PASS / SESSION_SECRET
npm run dev
```

Leave that console window open — this is the running server. `npm run dev`
uses `nodemon`, which auto-restarts the process whenever a source file
changes (see `nodemon.json` — it explicitly ignores `data/`, `*.db*` and
`audit.log`, so the frequent writes those files get during normal use never
trigger a restart).

### Updating to new code

In the same directory, with the server running:

```
git pull
npm install
```

- `git pull` updates the source files. Since `nodemon` is watching them, it
  restarts the server automatically within a second or two — you don't need
  to stop it yourself.
- Run `npm install` whenever `package.json` changed (new dependency) — it
  won't run itself. If nothing but `.js`/`.ejs` files changed, you can skip
  it.
- `data/` is never part of `git pull` — nothing to worry about there.

If you'd rather not leave a console window open long-term (e.g. so it
survives closing the RDP session or a reboot), the straightforward next step
is wrapping the same `npm start` command as a Windows Service with
[node-windows](https://github.com/coreybutler/node-windows) or
[NSSM](https://nssm.cc/).

### Backups

Two layers, both automatic, no configuration required for the first one:

1. **Local snapshots** — a full row-level dump of every table (JSON, human-
   readable) is written on every server boot and once every 24 hours after
   that, kept in `data/backups/` (last 30 kept, older ones pruned
   automatically). See `lib/backup.js` — this works the same way whether the
   database is a local file or a remote Turso database (see "Deploying for
   free" below), since it reads through the same client either way rather
   than copying a file that might not exist locally. Since `data/` isn't in
   git, remember these backups live only on this machine — copy
   `data/backups/` elsewhere periodically if you want protection against the
   whole machine failing.
2. **Google Drive backup** (optional, off-site) — see below.

A lead can also trigger an on-demand backup of both kinds from **Admin →
sidebar → Backup Now**, and see when the last one ran.

### Google Drive integration — step by step

Mirrors every document (as readable `.md` files) plus the latest database
snapshot into a "SOCGrid Backups" folder in a Google Drive account of your
choosing — so if this machine is ever lost, the documents (and, from the
`.json` snapshot, everything else) are recoverable from Drive. It only ever
requests access to files it creates itself (the `drive.file` OAuth scope) —
never the rest of that Drive account.

**1. Create a Google Cloud project**

Go to the [Google Cloud Console](https://console.cloud.google.com/) →
top-left project dropdown → **New Project**. Any name is fine (e.g.
"SOCGrid Backups"). Wait for it to finish creating, then make sure it's
selected in that same dropdown.

**2. Enable the Drive API**

Left sidebar (or search bar) → **APIs & Services → Library** → search
"Google Drive API" → open it → **Enable**.

**3. Configure the OAuth consent screen** (first time only)

**APIs & Services → OAuth consent screen**. Choose **External** unless you
have a Google Workspace organization (then Internal is fine). Fill in an
app name (e.g. "SOCGrid") and your email in the required fields, save
through the remaining steps with defaults. On the **Test users** step, add
the Google account you intend to back up to — while the app is in "Testing"
mode only accounts listed here can authorize it, which is fine for this use
case (nobody else needs to).

**4. Create the OAuth client**

**APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
- Application type: **Desktop app**
- Name: anything (e.g. "SOCGrid server")

Click Create — a dialog shows a **Client ID** and **Client Secret**. Copy
both.

**5. Add the credentials to `.env`**

```
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

**6. Run the one-time connection script**

```
node scripts/google-auth-setup.js
```

It prints a URL — open it in a browser, sign in with the Google account
backups should land in (the one you added as a test user in step 3),
approve access, and it'll show you a code. Paste that code back into the
terminal. This writes `data/google-token.json`, which is what actually
turns the feature on.

**7. Restart the server** so it picks up the new token — from then on,
backups to Drive run automatically once a day (plus on-demand via **Admin →
Backup Now**), no further logins needed. `data/google-token.json` is
gitignored, same as the rest of `data/` — it never leaves this machine
through git.

If `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` aren't set, or step 6 hasn't
been run yet, the app just skips the Drive step silently and keeps doing
local backups only — nothing breaks, and **Admin → Backup Now** will tell
you Drive isn't connected.

**What ends up in Drive:** a "SOCGrid Backups" folder containing
`database-latest.json` (the full row-level snapshot described above,
overwritten in place each run — open its revision history in Drive's UI to
see older versions) and a `documents/` subfolder with one `.md` file per
document (title, tags, visibility, author in the frontmatter, then its
content) — browsable and readable directly in Drive, not just a restorable
blob.

## Network diagrams

**Network** (top nav on any page) opens a shared drag-and-drop canvas for
sketching topology — drag a shape (server, firewall, router, switch,
workstation, cloud/WAN, database, VPN, access point, generic device) from
the palette onto the canvas, drag from one node's edge dot to another to
connect them, double-click a node's label to rename it. Keep as many
separate named diagrams as you want (e.g. "Office LAN", "DMZ", "VPN
topology") — pick one from the sidebar, edit, **Save**. Anyone on the team
can edit; only the diagram's author or a lead can delete one.

## Deploying for free (Render + Turso)

Render's free tier has no persistent disk — anything written to the
filesystem is wiped on every deploy and periodically otherwise. That's a
dealbreaker for a plain local SQLite file, but not for this app: point it at
a [Turso](https://turso.tech) database instead (a hosted, SQLite-compatible
database with a generous free tier — 500 databases, several GB of storage)
and the app talks to it exactly like it would a local file, over the
network, so Render's ephemeral disk stops mattering. This is the free,
fully-hosted setup — no server of your own to maintain.

### 1. Create a Turso database

Easiest via their CLI:

```
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup          # opens a browser to sign in/sign up (free)
turso db create socgrid
turso db show socgrid --url        # -> libsql://socgrid-yourname.turso.io
turso db tokens create socgrid     # -> a long auth token
```

(Or use the [Turso web dashboard](https://app.turso.tech) instead of the CLI
— create a database there and it shows you the same URL + token to copy.)

Keep both values — the database URL and the token — you'll paste them into
Render as environment variables next. Nothing needs to be created inside the
database by hand; the app creates its own tables on first boot, same as it
does locally.

### 2. Create the Render service

1. Push this repo to GitHub (if it isn't already).
2. On [Render](https://render.com), **New → Web Service**, connect the repo.
3. Environment: **Docker** (it'll pick up the included `Dockerfile`
   automatically). Instance type: **Free** is enough.
4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | the `libsql://...` URL from step 1 |
   | `TURSO_AUTH_TOKEN` | the token from step 1 |
   | `SESSION_SECRET` | any long random string |
   | `SOC_USER` | the username for the first account (optional, defaults to `admin`) |
   | `SOC_PASS` | its password (optional, defaults to `soc2026` — **do set this** so you're not relying on the default in a public deployment) |

   `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` and `GOOGLE_CLIENT_ID`/
   `GOOGLE_CLIENT_SECRET` are optional, same as anywhere else (see the
   Google Drive section above — the one-time `google-auth-setup.js` step
   needs to be run against the same Turso database, so it's easiest to run
   it locally with `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` in your local
   `.env` pointed at the same database before deploying, then remove them
   locally again if you want local dev back on a plain file).

5. Deploy. Render builds the Docker image and starts it; the app connects to
   Turso on boot, creates its schema there, and logs the first account's
   credentials — check the Render logs the first time to grab them, since
   there's no local console here.

   A brand-new Turso database can be slow to respond to its very first
   request or two, which can make that very first deploy crash on startup —
   `db.js` retries its own startup (schema creation/migrations) up to 5
   times with backoff specifically for this, so a plain redeploy (or
   Render's own auto-restart) recovers on its own; you shouldn't need to do
   anything.

### 3. Redeploying

Push to the branch Render is watching (or click **Manual Deploy**) — same as
any Render app. Because the database lives in Turso, not on Render's disk,
a redeploy (or Render restarting the free instance after inactivity) never
touches your data — this is the whole reason Turso is in the picture.

### Free-tier caveat

Render's free web services spin down after a period of no traffic and take
a few seconds to wake back up on the next request — fine for an internal
team tool, just don't expect it to feel instant after being idle. Turso's
free tier has its own (generous) usage limits; check
[turso.tech/pricing](https://turso.tech/pricing) if the team grows a lot.

### Everything else (Docker Compose, a plain VPS, etc.)

The `Dockerfile` works anywhere Docker runs. Without `TURSO_DATABASE_URL`
set, the container falls back to a local file under `DATA_DIR` — fine as
long as that path is a persistent volume (see `docker-compose.yml`, which
does exactly this for a self-hosted Docker setup where the disk *isn't*
ephemeral). See `.env.example` for the full list of environment variables.

## License

MIT — see [LICENSE](LICENSE).
