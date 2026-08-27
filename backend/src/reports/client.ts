import { google } from "googleapis";
import { getAuthClient } from "../auth/google";

export interface MeetParticipant {
  email: string;
  displayName: string;
  joinTime: Date;
  leaveTime: Date;
  durationMin: number;
  durationSeconds: number;    // raw seconds, for accurate camera-on ratio math
  videoSendSeconds: number | null; // null = Meet reported no video stats for this participant
}

export interface MeetSession {
  conferenceId: string;
  calendarEventId: string | null; // matches Calendar API event ID when present
  participants: MeetParticipant[];
}

/**
 * Fetches all Google Meet sessions that ended within [from, to].
 * Groups call_ended events by conference_id and returns one MeetSession per unique meeting.
 */
export async function getMeetSessionsForRange(from: Date, to: Date): Promise<MeetSession[]> {
  const auth = getAuthClient();
  const reports = google.admin({ version: "reports_v1", auth });

  let pageToken: string | undefined;

  // conferenceId → { calendarEventId, participants map }
  const sessions = new Map<string, {
    calendarEventId: string | null;
    participants: Map<string, MeetParticipant>;
  }>();

  do {
    const response = await reports.activities.list({
      userKey: "all",
      applicationName: "meet",
      eventName: "call_ended",
      startTime: from.toISOString(),
      endTime: to.toISOString(),
      maxResults: 1000,
      ...(pageToken ? { pageToken } : {}),
    });

    for (const activity of response.data.items ?? []) {
      const params = activity.events?.[0]?.parameters ?? [];
      const conferenceId = getParam(params, "conference_id");
      if (!conferenceId) continue;

      const email = getParam(params, "identifier") ?? activity.actor?.email ?? "";
      const displayName = getParam(params, "display_name") ?? email.split("@")[0];
      const durationSeconds = parseInt(getParam(params, "duration_seconds") ?? "0", 10);
      const startTimestampSeconds = parseInt(getParam(params, "start_timestamp_seconds") ?? "0", 10);
      const calendarEventId = getParam(params, "calendar_event_id");
      const videoSendSecondsRaw = getParam(params, "video_send_seconds");
      const videoSendSeconds = videoSendSecondsRaw != null ? parseInt(videoSendSecondsRaw, 10) : null;
      const leaveTimeRaw = activity.id?.time;

      if (!email || !leaveTimeRaw) continue;

      const leaveTime = new Date(leaveTimeRaw);
      const durationMin = Math.round(durationSeconds / 60);
      const joinTime = startTimestampSeconds > 0
        ? new Date(startTimestampSeconds * 1000)
        : new Date(leaveTime.getTime() - durationSeconds * 1000);

      if (!sessions.has(conferenceId)) {
        sessions.set(conferenceId, { calendarEventId, participants: new Map() });
      }
      const session = sessions.get(conferenceId)!;

      // Prefer a non-null calendarEventId for the session
      if (!session.calendarEventId && calendarEventId) {
        session.calendarEventId = calendarEventId;
      }

      // Keep earliest join if someone rejoined
      const existing = session.participants.get(email);
      if (!existing || joinTime < existing.joinTime) {
        session.participants.set(email, { email, displayName, joinTime, leaveTime, durationMin, durationSeconds, videoSendSeconds });
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return Array.from(sessions.values()).map((s) => ({
    conferenceId: "",
    calendarEventId: s.calendarEventId,
    participants: Array.from(s.participants.values()),
  }));
}

/**
 * Fetches Meet attendance for a single meeting identified by its Calendar event ID.
 * Queries the Reports API for a window around the meeting and matches by calendar_event_id.
 *
 * Falls back to time-based matching (participants who joined within the meeting window)
 * when calendar_event_id is not available.
 */
export async function getMeetAttendance(
  calendarEventId: string,
  startTime: Date,
  endTime: Date
): Promise<{ participants: MeetParticipant[] } | null> {
  const auth = getAuthClient();
  const reports = google.admin({ version: "reports_v1", auth });

  // Query a window: 5 min before start → 3 hours after end (to catch late joiners / long overruns)
  const windowStart = new Date(startTime.getTime() - 5 * 60 * 1000);
  const windowEnd = new Date(endTime.getTime() + 3 * 60 * 60 * 1000);

  let pageToken: string | undefined;

  // conferenceId → { calendarEventId, participants }
  const sessions = new Map<string, {
    calendarEventId: string | null;
    participants: Map<string, MeetParticipant>;
  }>();

  do {
    const response = await reports.activities.list({
      userKey: "all",
      applicationName: "meet",
      eventName: "call_ended",
      startTime: windowStart.toISOString(),
      endTime: windowEnd.toISOString(),
      maxResults: 1000,
      ...(pageToken ? { pageToken } : {}),
    });

    for (const activity of response.data.items ?? []) {
      const params = activity.events?.[0]?.parameters ?? [];
      const conferenceId = getParam(params, "conference_id");
      if (!conferenceId) continue;

      const email = getParam(params, "identifier") ?? activity.actor?.email ?? "";
      const displayName = getParam(params, "display_name") ?? email.split("@")[0];
      const durationSeconds = parseInt(getParam(params, "duration_seconds") ?? "0", 10);
      const startTimestampSeconds = parseInt(getParam(params, "start_timestamp_seconds") ?? "0", 10);
      const eventCalendarId = getParam(params, "calendar_event_id");
      const videoSendSecondsRaw = getParam(params, "video_send_seconds");
      const videoSendSeconds = videoSendSecondsRaw != null ? parseInt(videoSendSecondsRaw, 10) : null;
      const leaveTimeRaw = activity.id?.time;

      if (!email || !leaveTimeRaw) continue;

      const leaveTime = new Date(leaveTimeRaw);
      const durationMin = Math.round(durationSeconds / 60);
      const joinTime = startTimestampSeconds > 0
        ? new Date(startTimestampSeconds * 1000)
        : new Date(leaveTime.getTime() - durationSeconds * 1000);

      if (!sessions.has(conferenceId)) {
        sessions.set(conferenceId, { calendarEventId: eventCalendarId, participants: new Map() });
      }
      const session = sessions.get(conferenceId)!;
      if (!session.calendarEventId && eventCalendarId) session.calendarEventId = eventCalendarId;

      const existing = session.participants.get(email);
      if (!existing || joinTime < existing.joinTime) {
        session.participants.set(email, { email, displayName, joinTime, leaveTime, durationMin, durationSeconds, videoSendSeconds });
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (sessions.size === 0) return null;

  // 1. Try exact calendar_event_id match
  for (const session of sessions.values()) {
    if (session.calendarEventId === calendarEventId) {
      return { participants: Array.from(session.participants.values()) };
    }
    // Recurring events: Reports API may strip the instance suffix
    if (
      session.calendarEventId &&
      calendarEventId.startsWith(session.calendarEventId.replace(/_[^_]+$/, ""))
    ) {
      return { participants: Array.from(session.participants.values()) };
    }
  }

  // 2. Fallback: pick the session whose earliest join time is closest to startTime
  let bestSession: Map<string, MeetParticipant> | null = null;
  let bestDelta = Infinity;

  for (const session of sessions.values()) {
    const participants = Array.from(session.participants.values());
    const firstJoin = Math.min(...participants.map((p) => p.joinTime.getTime()));
    const delta = Math.abs(firstJoin - startTime.getTime());
    // Only consider sessions that started within ±30 minutes of the scheduled start
    if (delta < 30 * 60 * 1000 && delta < bestDelta) {
      bestDelta = delta;
      bestSession = session.participants;
    }
  }

  return bestSession ? { participants: Array.from(bestSession.values()) } : null;
}

/**
 * Extract a named string or integer parameter value from a Reports API activity parameter list.
 */
function getParam(
  params: Array<{ name?: string | null; value?: string | null; intValue?: string | null }>,
  name: string
): string | null {
  const p = params.find((p) => p.name === name);
  return p?.value ?? p?.intValue ?? null;
}

/**
 * Extracts the meeting code from a Google Meet URL.
 * e.g. "https://meet.google.com/abc-defg-hij" → "abc-defg-hij"
 */
export function extractMeetCode(meetUrl: string): string | null {
  const match = meetUrl.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return match?.[1] ?? null;
}
