import { google, calendar_v3 } from "googleapis";
import { getAuthClient } from "../auth/google";

// Matches Google Meet link patterns in event descriptions / conference data
const MEET_URL_PATTERN = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  meetUrl: string;
  organizerEmail: string;
  attendees: { email: string; displayName: string }[];
}

function getCalendar(subjectEmail?: string): calendar_v3.Calendar {
  return google.calendar({ version: "v3", auth: getAuthClient(subjectEmail) });
}

/**
 * Fetch calendar events with a Google Meet link between two explicit timestamps.
 * Pass subjectEmail to impersonate a specific user; defaults to GOOGLE_SUBJECT_EMAIL.
 */
export async function getCalendarEventsForRange(from: Date, to: Date, subjectEmail?: string): Promise<CalendarEvent[]> {
  const calendar = getCalendar(subjectEmail);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const items = response.data.items ?? [];
  const meetingEvents: CalendarEvent[] = [];

  for (const event of items) {
    const meetUrl = extractMeetUrl(event);
    if (!meetUrl) continue;

    const startTime = parseEventTime(event.start);
    const endTime = parseEventTime(event.end);
    if (!startTime || !endTime) continue;

    const attendees = extractAttendees(event);
    const organizerEmail = event.organizer?.email ?? "";

    meetingEvents.push({
      id: event.id!,
      title: event.summary ?? "(No title)",
      startTime,
      endTime,
      meetUrl,
      organizerEmail,
      attendees,
    });
  }

  return meetingEvents;
}

/**
 * Fetch all upcoming calendar events that have a Google Meet link.
 * Looks ahead `lookaheadMinutes` minutes from now.
 */
export async function getUpcomingMeetings(lookaheadMinutes = 60, subjectEmail?: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMax = new Date(now.getTime() + lookaheadMinutes * 60 * 1000);
  return getCalendarEventsForRange(now, timeMax, subjectEmail);
}

function extractMeetUrl(event: calendar_v3.Schema$Event): string | null {
  // Check conference data first (most reliable)
  const entryPoints = event.conferenceData?.entryPoints ?? [];
  for (const ep of entryPoints) {
    if (ep.entryPointType === "video" && ep.uri) {
      return ep.uri;
    }
  }

  // Fall back to scanning description and location
  const textFields = [event.description ?? "", event.location ?? ""];
  for (const text of textFields) {
    const match = text.match(MEET_URL_PATTERN);
    if (match) return match[0];
  }

  return null;
}

function parseEventTime(
  timeObj: calendar_v3.Schema$EventDateTime | null | undefined
): Date | null {
  if (!timeObj) return null;
  const raw = timeObj.dateTime ?? timeObj.date;
  if (!raw) return null;
  return new Date(raw);
}

function extractAttendees(
  event: calendar_v3.Schema$Event
): { email: string; displayName: string }[] {
  const rawAttendees = event.attendees ?? [];
  return rawAttendees
    .filter((a) => a.email && a.responseStatus !== "declined")
    .map((a) => ({
      email: a.email!,
      displayName: a.displayName ?? a.email!.split("@")[0],
    }));
}
