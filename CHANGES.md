# Changes — Camera-On Tracking + Weekly Slack Report

Added on top of the existing lateness tracker. Summary for whoever reviews/deploys this.

## New: Camera-on tracking

- **Data source**: Google Meet Reports API's `call_ended` event already includes
  `video_send_seconds` (how long a participant's client sent video) alongside the
  `duration_seconds` this app already pulls. No new Google scopes needed.
- **Metric**: `cameraOnRatio = video_send_seconds / duration_seconds` (0–1).
  `cameraOff = true` when that ratio is below `CAMERA_OFF_THRESHOLD_RATIO` (env var,
  default 0.5 — camera on less than half the meeting).
- **Not a live toggle log.** This is "% of the meeting spent visibly on camera,"
  not a timestamped on/off history. Someone turning their camera off for 5 minutes
  and back on nets out the same as someone who left it off from minute 10–15.
- New Prisma columns on `MeetingAttendance`: `videoSendSeconds`, `cameraOnRatio`, `cameraOff`.
  Migration: `backend/prisma/migrations/20260820000000_add_camera_tracking/`.
- Wired into every place attendance gets written: `scheduler/index.ts` (local),
  `api/cron.ts` (production Vercel cron), and the backfill/reprocess scripts
  (`scripts/backfill-week.ts`, `scripts/process_all.ts`) — so re-running a backfill
  after this update will populate camera data for historical meetings too, not
  just new ones going forward.
- Surfaced in `GET /api/people`, `GET /api/people/:email/stats`, and
  `GET /api/dashboard/summary` as `cameraOffRate`, `cameraOffCount`,
  `cameraTrackedMeetings`, `avgCameraOnRatio`.
- Frontend: new "Camera Off" column on the dashboard leaderboard (sortable, CSV
  export includes it), and a "Camera Off" stat card + meetings table on the
  Person Detail page.

## New: Weekly Slack report

- `POST /api/cron/weekly-report` — computes the trailing 7 days' lateness +
  camera-off leaderboard and posts it to Slack via an Incoming Webhook.
- Scheduled in `vercel.json` for Friday 21:00 UTC — **check this matches your
  actual timezone / definition of "end of week" and adjust the cron string**.
- Config: `SLACK_WEBHOOK_URL` in `.env`. If unset, the endpoint runs and logs a
  warning instead of failing — safe to deploy before Slack is set up.
- Only lists people with tracked meetings that week — nobody gets called out
  for a week with no data.
- **Scope note**: this posts to one channel via a webhook. If the actual ask is
  per-person Slack DMs, that's a materially different build (Slack bot token +
  OAuth scopes + resolving each email to a Slack user ID) — flag if that's what's
  wanted instead.

## Also fixed while in there

- `HANDOFF.md`'s known issue #5 — the late threshold was hardcoded in three
  places that could drift apart. Centralized into `backend/src/config.ts`
  alongside the new camera threshold, both configurable via env vars.
- Extracted the exclusion-rule/attendee-filter logic (previously only in
  `routes.ts`) into `backend/src/lib/attendeeFilters.ts` so the new Slack
  report and the dashboard can't independently drift on who/what counts.

## Still true from before

- The plaintext password in the old `PLAN.md` should be rotated — see
  `HANDOFF.md` known issue #3.
- Before this goes live with camera data, confirm the team's been told
  meeting camera state is tracked (`HANDOFF.md` known issue #6 applies even
  more here than to lateness — camera state can reflect health, disability
  accommodations, childcare, or connectivity issues, not just attentiveness).

## Not verified in this environment

Prisma Client couldn't be generated here (sandbox network blocks
`binaries.prisma.sh`), so the backend type-check has pre-existing "implicit
any" noise unrelated to these changes — run `npx prisma migrate deploy` +
`npx prisma generate` in your own environment and it'll resolve. The new
files (`config.ts`, `slack/client.ts`) type-check clean; the frontend
(`npx tsc --noEmit`) is fully clean.

## Renamed: Timeliness → Presence Tracker

Boss picked the name. Updated everywhere it showed up as display text: page
titles, headers, Slack report text, package.json names, CSV export filenames,
E2E test assertions, doc titles.

**Left untouched on purpose** (these are real infrastructure identifiers, not
display strings — renaming the text wouldn't rename the actual resource, so
it'd just be wrong):
- `HANDOFF.md`'s reference to the `timeliness-bot` GCP project/service account
- `HANDOFF.md`'s reference to the specific compromised key
  (`timeliness-bot@timeliness-bot.iam.gserviceaccount.com`) flagged for rotation
- `PLAN.md`'s `https://timeliness.vercel.app` live URL

Each of those has an inline note flagging that it needs a manual update once
the actual new GCP project / Vercel deployment exist under the new name —
don't guess those values, confirm them once they're real.
