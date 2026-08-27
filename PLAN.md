# Presence Tracker — Product Plan

## Data Scope Constraint
**Only ScaleArmy.com email addresses are tracked.** All backend queries and data ingestion (calendar sync, reports processing, dashboard, people endpoints) must filter out any attendee or organiser whose email does not end in `@scalearmy.com`. Non-ScaleArmy guests who join a meeting should be excluded from all analytics.

---

## Phase 1 — Core Analytics (High Value, Low Complexity)

### 1. Date Range Filter on Dashboard
Allow the user to switch the leaderboard between preset windows: **This week / Last 30 days / Last 90 days / All time / Custom range**.
- Frontend: date range picker / tab bar in the dashboard header
- Backend: already supports `?since=` param; extend to also accept `?until=` for custom ranges

### 2. Person Detail Page
Clicking a person in the leaderboard navigates to `/people/:email`. Shows:
- Summary stats card (late rate, avg minutes late, total meetings, no-shows, on-time streak)
- Table of every meeting they were late to: meeting title, date/time, minutes late, fellow attendees
- Full attendance history table (all meetings, on-time or not)
- Habitual latecomer badge if late rate > 50%
- Back button to dashboard

### 3. Meetings View / Table
A new top-level page `/meetings` listing all tracked meetings:
- Columns: title, date/time, attendee count, # late, # no-shows, % on time
- Sortable columns
- Link to meeting detail page

### 4. Meeting Detail Page
Clicking a meeting in the meetings table navigates to `/meetings/:id`. Shows:
- Meeting metadata (title, organiser, date, duration)
- Attendee breakdown table: name, join time, minutes late, duration attended, on-time / late / no-show badge
- Organiser's own punctuality score for this meeting

### 5. CSV Export
Export button on any table view (leaderboard, person history, meetings list) that downloads a `.csv` of the currently visible/filtered data.

---

## Phase 2 — Deeper Person Analytics

### 6. Lateness Trend Chart
On the Person Detail Page, show a bar chart of average minutes late per week over the last 12 weeks. Makes improvement or regression immediately visible.

### 7. Worst Offenders by Absolute Minutes
A second sort mode on the leaderboard: rank by **total minutes wasted** (sum of all minutes late) or **average minutes late**, not just late rate %. Toggle between sort modes.

### 8. Habitual Latecomers Badge
In the leaderboard and on the person page, show a distinct warning badge for anyone with a late rate > 50%.

### 9. On-Time Streak
Display each person's current consecutive on-time meeting streak on the leaderboard and person detail page. Also show their all-time best streak.

### 10. Most Improved
A highlighted callout (or separate leaderboard tab) showing who has reduced their late rate the most compared to the prior equivalent period (e.g. last 30 days vs the 30 days before that).

---

## Phase 3 — Meeting & Organiser Analytics

### 11. Meeting Punctuality Heatmap
A grid view where rows = people, columns = meetings (sorted by date), and each cell is colour-coded: green (on time), amber (late), red (no-show), grey (not invited). Makes attendance patterns immediately visible across the whole team.

### 12. Organiser Punctuality Score
On the Meeting Detail Page and the Meetings table, show a stat for how punctual the meeting organiser themselves was to their own meeting.

---

## Phase 4 — Search, Filtering & Sharing

### 13. Global Search
A search bar in the nav that accepts a person name, email, or meeting title and jumps to the relevant person or meeting page.

### 14. Multi-Person Compare
Select 2–5 people via checkboxes in the leaderboard and click "Compare" to see a side-by-side stats panel: late rate, avg minutes late, streak, trend.

### 15. Filter by Organiser
In the Meetings table, a dropdown to show only meetings organised by a specific person.

### 16. Printable / Shareable Report
A clean, print-friendly page at `/report?person=email&since=date&until=date` that summarises a person's punctuality for a given period — suitable for a manager review conversation.

---

## Phase 5 — Insights

### 17. Auto-Insights Strip
A row of plain-English callout cards at the top of the dashboard, auto-generated from the data:
- "Alex is late to 80% of meetings this month"
- "The 9am standup has the highest no-show rate"
- "Team punctuality improved 12% vs last month"
- "5 people haven't been late once this month"

---

## Testing & Deployment

> **Note:** `timeliness.vercel.app` below refers to the original deployment.
> If/when this gets redeployed under the new "Presence Tracker" name to a new
> Vercel project, the actual URL will differ — update this section once that
> deployment exists rather than assuming the URL.

**Live URL: https://timeliness.vercel.app**

> ⚠️ **Always test against the live Vercel URL, never localhost.**
>
> When asked to verify, check, or test anything — API endpoints, UI behaviour, data, authentication — use `https://timeliness.vercel.app` as the base URL. Do **not** test against `http://localhost:3001` or `http://localhost:5174` (or any other local port). The local dev servers may be running but they do not reflect the deployed state.

- **Deploy**: Run `vercel --prod` from `/Users/alexkruger/Coding/presence-tracker` to push the latest local code to production. *(Path assumes the local folder gets renamed to match — update if Alex keeps the old folder name.)*
- **API auth**: All protected endpoints require the header `Authorization: Bearer scale-army`.
- **Login**: `POST /api/auth/login` with `{"password": "scale-army"}`.
- **Key endpoints to verify after any deploy**:
  - `GET /api/dashboard/summary` — main dashboard data
  - `GET /api/meetings` — meetings list
  - `GET /api/people` — people leaderboard
  - `GET /api/heatmap` — attendance heatmap grid

---

## Implementation Notes

- **Routing**: Add React Router (or simple hash routing) to support `/people/:email`, `/meetings`, `/meetings/:id`, `/report`
- **Backend filter**: Add `WHERE email LIKE '%@scalearmy.com'` (or parameterised equivalent) to all Prisma queries that touch `Attendee`
- **Calendar sync filter**: Skip storing attendees whose `email` doesn't end in `@scalearmy.com` at ingest time
- **No new dependencies** preferred — charts can be done with SVG/canvas or a lightweight library (e.g. recharts)
