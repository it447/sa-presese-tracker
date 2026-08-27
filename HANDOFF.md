# Presence Tracker — Handoff & Setup

Internal meeting-punctuality tracker for Scale Army. Syncs Google Calendar and
Google Meet attendance data, then scores who joins meetings on time.

**This archive contains no credentials.** Every secret has been stripped. See
[Getting credentials](#getting-credentials) below for how to obtain your own.

---

## What it does

Two cron jobs run on Vercel:

| Job | Schedule | What it does |
|---|---|---|
| `/api/cron/sync-calendar` | every 5 min | Pulls Calendar events for monitored users, upserts meetings and their invitee lists |
| `/api/cron/process-meetings` | every 10 min | Pulls the Google Meet Reports API for finished meetings to get actual join/leave times |

Lateness is computed as `joinTime - scheduledStart`. Anything over **1 minute**
is flagged late (`wasLate`). A null `joinTime` means the person never joined —
a no-show.

Only `@scalearmy.com` addresses are tracked. External guests are filtered out at
ingest and again in every query.

---

## Stack

- **Frontend** — React 19, Vite, TypeScript, React Router, recharts, lucide-react
- **Backend** — Express 4, Prisma 5, Postgres (Supabase), googleapis
- **Hosting** — Vercel. The whole Express app is served through one serverless
  function (`api/index.ts`); `vercel.json` rewrites `/api/*` to it and everything
  else to the SPA.
- **Tests** — Playwright, with a GitHub Actions workflow in
  `frontend/.github/workflows/playwright.yml`

### Data model (`backend/prisma/schema.prisma`)

- `Meeting` — one per calendar event, linked to a Meet conference ID
- `Attendee` — one global record per person, with `hidden` and `isLeadership` flags
- `MeetingAttendance` — one row per (meeting, attendee): join/leave times,
  `minutesLate`, `wasLate`, `wasInvited`
- `MeetingExclusionRule` — title patterns for meetings to leave out of analytics

---

## Local setup

```bash
# 1. Backend
cd backend
npm install
cp ../.env.example .env      # then fill in — see below
npx prisma generate
npx prisma migrate deploy    # against your own dev database, not production
npm run dev                  # http://localhost:3001

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5174
```

Note: `PLAN.md` says to always test against the live Vercel URL. That was written
for a specific debugging situation. For development work, use a local backend
pointed at a **development database** — do not run migrations or backfill scripts
against the production Postgres.

---

## Getting credentials

Nothing in this repo will run until these are populated. Don't ask for them to be
sent over email or Slack — provision your own through the consoles below.

### 1. Vercel project access

Ask Alex to add you to the Vercel project. Then:

```bash
npx vercel link
npx vercel env pull backend/.env
```

This writes the production environment variables to a local file without anyone
having to transmit them. That file is gitignored.

### 2. Google service account

The app authenticates as a service account with **domain-wide delegation** over
the Scale Army Workspace. Required scopes:

- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/admin.reports.audit.readonly`

Ask for IAM access to the `timeliness-bot` Google Cloud project, then generate
your own key from the console (IAM & Admin → Service Accounts → Keys). Paste the
JSON as a single line into `GOOGLE_SERVICE_ACCOUNT_JSON`.

> **Note:** `timeliness-bot` refers to the original GCP project/service account.
> If you're creating a fresh service account under the new "Presence Tracker"
> name (see conversation history), update this section with the actual project
> and service account name once created — don't guess it here.

This key can read calendar and Meet data for every account in the Workspace.
Treat it accordingly — no key files in the repo, no keys in chat.

### 3. Database

Get your own Supabase project credentials, or a scoped database user on the
existing project. `DATABASE_URL` is the pooled connection string;
`DIRECT_URL` is the direct one Prisma migrations need.

### 4. App passwords

`DASHBOARD_PASSWORD`, `ADMIN_PASSWORD`, and `CRON_SECRET` should come to you
through a password manager share, not a message.

Full variable list with descriptions: `.env.example`.

---

## API reference

All protected endpoints require `Authorization: Bearer <DASHBOARD_PASSWORD>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Dashboard login |
| POST | `/api/settings/auth` | Settings page login |
| GET | `/api/dashboard/summary` | Main dashboard payload |
| GET | `/api/people` | Leaderboard |
| GET | `/api/people/:email/stats` | Person detail stats |
| GET | `/api/heatmap` | Person × meeting attendance grid |
| GET | `/api/search` | Global search across people and meetings |
| GET | `/api/settings/people` | People list for admin |
| POST | `/api/settings/people/:email/leadership` | Toggle leadership flag |
| POST | `/api/settings/people/:email/hidden` | Hide/unhide a person |
| GET | `/api/settings/exclusion-rules` | List meeting exclusion rules |
| POST | `/api/settings/exclusion-rules` | Create rule |
| GET | `/api/settings/exclusion-rules/preview` | Preview what a rule would exclude |
| DELETE | `/api/settings/exclusion-rules/:id` | Delete rule |
| POST | `/api/backfill` | Reprocess a historical window |

Most endpoints accept `?since=` and `?until=` for date filtering.

---

## Known issues worth addressing

1. **Auth is a single shared password.** There are no user accounts and no audit
   log. Anyone holding the string can see the complete attendance record of every
   employee. Worth moving to Google SSO restricted to the Workspace domain,
   especially given what the data is.

2. **Secrets were previously committed to the working tree.** `.env`,
   `.env.production.local`, and `service-account.json` were sitting in the project
   directory, and the old root `.gitignore` only covered `.vercel`. The
   `.gitignore` in this copy is fixed. If the git history contains any of those
   files, they need purging from history, not just deletion.

3. **Credentials from the pre-handoff copy should be rotated** regardless of
   whether exposure is confirmed — Google service account key
   (`timeliness-bot@timeliness-bot.iam.gserviceaccount.com`, key ID starting
   `1309f01b`), Supabase database credentials, and all three app passwords.

4. **A local SQLite dev database with ~90 real employee records** was present in
   `backend/prisma/`. Removed from this copy. Check for other copies on any
   machine that had the project.

5. **The 1-minute late threshold is hardcoded** in three places
   (`api/cron.ts`, `scheduler/index.ts`, `scripts/backfill-week.ts`). If it ever
   needs changing, it should be one config value, not three literals that can
   drift apart.

6. **This tool monitors employees.** Before expanding it, confirm the team knows
   it exists and that its use is consistent with whatever employment terms and
   privacy obligations apply — including for staff in jurisdictions with stricter
   monitoring rules than the US.

---

## Deploying

```bash
npx vercel --prod
```

Verify after deploy: `/api/dashboard/summary`, `/api/people`, `/api/heatmap`.
