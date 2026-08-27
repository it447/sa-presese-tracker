import prisma from "../db/client";
import { getValidAttendeeIds, getExcludedMeetingIds } from "../lib/attendeeFilters";

/**
 * Posts the week's lateness + camera-off leaderboard to Slack via an
 * Incoming Webhook (https://api.slack.com/messaging/webhooks).
 *
 * ASSUMPTIONS — adjust if these don't match what your boss actually wants:
 *   - "The week" = the trailing 7 days ending now, not Mon–Sun. If EOW should
 *     mean "this calendar week" instead, change `since` below.
 *   - Reports go to one channel via one webhook URL (SLACK_WEBHOOK_URL).
 *     If you want per-person DMs instead of a channel post, that needs the
 *     Slack Web API + a bot token + resolving Slack user IDs from emails —
 *     a materially bigger change (OAuth scopes, user lookup) than a webhook.
 *   - Only people who actually had tracked meetings this week are listed —
 *     nobody is called out for a week with zero data.
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface WeeklyPersonStats {
  email: string;
  displayName: string;
  assessedMeetings: number;
  lateCount: number;
  lateRate: number;
  cameraTrackedMeetings: number;
  cameraOffCount: number;
  cameraOffRate: number;
}

async function computeWeeklyStats(): Promise<{ since: Date; until: Date; people: WeeklyPersonStats[] }> {
  const until = new Date();
  const since = new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [excludedIds, validAttendeeIds] = await Promise.all([
    getExcludedMeetingIds(),
    getValidAttendeeIds(),
  ]);
  const excludedFilter = excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {};

  const attendance = await prisma.meetingAttendance.findMany({
    where: {
      wasInvited: true,
      attendeeId: { in: validAttendeeIds },
      meeting: { processed: true, startTime: { gte: since, lte: until }, ...excludedFilter },
    },
    include: { attendee: true },
  });

  const byPerson = new Map<string, WeeklyPersonStats & { cameraOnRatioSum: number }>();

  for (const a of attendance) {
    const key = a.attendee.email;
    const existing = byPerson.get(key) ?? {
      email: a.attendee.email,
      displayName: a.attendee.displayName,
      assessedMeetings: 0,
      lateCount: 0,
      lateRate: 0,
      cameraTrackedMeetings: 0,
      cameraOffCount: 0,
      cameraOffRate: 0,
      cameraOnRatioSum: 0,
    };
    const hasCameraData = a.joinTime !== null && a.cameraOnRatio !== null;
    byPerson.set(key, {
      ...existing,
      assessedMeetings: existing.assessedMeetings + 1,
      lateCount: existing.lateCount + (a.wasLate ? 1 : 0),
      cameraTrackedMeetings: existing.cameraTrackedMeetings + (hasCameraData ? 1 : 0),
      cameraOffCount: existing.cameraOffCount + (hasCameraData && a.cameraOff ? 1 : 0),
      cameraOnRatioSum: existing.cameraOnRatioSum + (hasCameraData ? a.cameraOnRatio ?? 0 : 0),
    });
  }

  const people = Array.from(byPerson.values()).map((p) => ({
    ...p,
    lateRate: p.assessedMeetings > 0 ? Math.round((p.lateCount / p.assessedMeetings) * 100) : 0,
    cameraOffRate: p.cameraTrackedMeetings > 0 ? Math.round((p.cameraOffCount / p.cameraTrackedMeetings) * 100) : 0,
  }));

  return { since, until, people };
}

function formatSlackMessage(since: Date, until: Date, people: WeeklyPersonStats[]) {
  const dateRange = `${since.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${until.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const withMeetings = people.filter((p) => p.assessedMeetings > 0);
  const lateLeaders = [...withMeetings].sort((a, b) => b.lateRate - a.lateRate || b.lateCount - a.lateCount).slice(0, 5);
  const cameraLeaders = [...withMeetings]
    .filter((p) => p.cameraTrackedMeetings > 0)
    .sort((a, b) => b.cameraOffRate - a.cameraOffRate || b.cameraOffCount - a.cameraOffCount)
    .slice(0, 5);

  const lateLines = lateLeaders.length
    ? lateLeaders.map((p) => `• *${p.displayName}* — ${p.lateRate}% late (${p.lateCount}/${p.assessedMeetings})`).join("\n")
    : "No lateness data for this period.";

  const cameraLines = cameraLeaders.length
    ? cameraLeaders
        .map((p) => `• *${p.displayName}* — camera off ${p.cameraOffRate}% of tracked meetings (${p.cameraOffCount}/${p.cameraTrackedMeetings})`)
        .join("\n")
    : "No camera data for this period.";

  const text = `*Presence Tracker — Weekly Report (${dateRange})*\n\n*Lateness*\n${lateLines}\n\n*Camera Off*\n${cameraLines}`;

  return {
    text, // fallback for notifications
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Presence Tracker — Weekly Report (${dateRange})` } },
      { type: "section", text: { type: "mrkdwn", text: `*Lateness*\n${lateLines}` } },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: `*Camera Off*\n${cameraLines}` } },
    ],
  };
}

export async function postWeeklyReport(): Promise<{ ok: boolean; posted: boolean; peopleCount: number; reason?: string }> {
  const { since, until, people } = await computeWeeklyStats();

  if (!SLACK_WEBHOOK_URL) {
    console.warn("[Slack] SLACK_WEBHOOK_URL not set — skipping post. Report would have covered", people.length, "people.");
    return { ok: true, posted: false, peopleCount: people.length, reason: "SLACK_WEBHOOK_URL not configured" };
  }

  const payload = formatSlackMessage(since, until, people);

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed: ${res.status} ${body}`);
  }

  return { ok: true, posted: true, peopleCount: people.length };
}
