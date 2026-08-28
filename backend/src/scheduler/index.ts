import cron from "node-cron";
import { getUpcomingMeetings } from "../calendar/client";
import prisma from "../db/client";
import { getMeetAttendance, extractMeetCode } from "../reports/client";
import { LATE_THRESHOLD_MINUTES, computeCameraStats } from "../config";
import { postWeeklyReport } from "../slack/client";
import { getMonitoredEmails } from "../lib/monitoredEmails";

/**
 * Starts two cron jobs:
 * 1. Every 5 min — sync upcoming meetings from Calendar into the DB
 * 2. Every 10 min — process any meetings that have ended but haven't been fetched yet
 */
export function startScheduler(): void {
  console.log("[Scheduler] Starting");

  syncCalendar();
  cron.schedule("*/5 * * * *", syncCalendar);

  processEndedMeetings();
  cron.schedule("*/10 * * * *", processEndedMeetings);

  // Weekly Slack report — Friday 17:00 server time. Adjust the cron string
  // below if the server/deploy timezone isn't the one "EOW" should mean.
  cron.schedule("0 17 * * 5", () => {
    postWeeklyReport().catch((err) => console.error("[Slack] Weekly report failed:", err));
  });
}

// ---------------------------------------------------------------------------
// Step 1: Pull upcoming meetings from Calendar and store them
// ---------------------------------------------------------------------------

async function syncCalendar(): Promise<void> {
  const monitoredEmails = await getMonitoredEmails();
  console.log(`[Calendar] Syncing upcoming meetings for ${monitoredEmails.length} people...`);

  // Track events AND which calendars they appeared on
  const allEvents = new Map<string, Awaited<ReturnType<typeof getUpcomingMeetings>>[number]>();
  const eventCalendarOwners = new Map<string, Set<string>>(); // calendarEventId → set of owner emails

  for (const email of monitoredEmails) {
    try {
      const events = await getUpcomingMeetings(24 * 60, email);
      for (const e of events) {
        allEvents.set(e.id, e); // deduplicate by calendarEventId
        if (!eventCalendarOwners.has(e.id)) eventCalendarOwners.set(e.id, new Set());
        eventCalendarOwners.get(e.id)!.add(email);
      }
    } catch (err) {
      console.error(`[Calendar] Failed to fetch events for ${email}:`, err);
    }
  }
  const events = [...allEvents.values()];

  for (const event of events) {
    const meetCode = extractMeetCode(event.meetUrl);

    let safeMeetCode = meetCode;
    if (meetCode) {
      const conflict = await prisma.meeting.findUnique({
        where: { meetId: meetCode },
        select: { calendarEventId: true },
      });
      if (conflict && conflict.calendarEventId !== event.id) {
        safeMeetCode = null;
      }
    }

    await prisma.meeting.upsert({
      where: { calendarEventId: event.id },
      update: {
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        meetUrl: event.meetUrl,
        organizerEmail: event.organizerEmail,
        meetId: safeMeetCode ?? undefined,
      },
      create: {
        calendarEventId: event.id,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        meetUrl: event.meetUrl,
        organizerEmail: event.organizerEmail,
        meetId: safeMeetCode ?? undefined,
      },
    });

    // Build the full set of @scalearmy.com people who should have attendance rows:
    // the event.attendees list PLUS any calendar owners this event appeared on.
    const invitedEmails = new Set<string>();
    for (const a of event.attendees) {
      if (a.email.endsWith("@scalearmy.com")) invitedEmails.add(a.email);
    }
    for (const owner of eventCalendarOwners.get(event.id) ?? []) {
      if (owner.endsWith("@scalearmy.com")) invitedEmails.add(owner);
    }

    // Upsert each invited attendee globally (one record per email)
    for (const email of invitedEmails) {
      const displayName = event.attendees.find((a) => a.email === email)?.displayName ?? email.split("@")[0];
      await prisma.attendee.upsert({
        where: { email },
        update: { displayName },
        create: { email, displayName },
      });
    }

    // Create MeetingAttendance placeholder rows for each invited attendee
    const meeting = await prisma.meeting.findUnique({
      where: { calendarEventId: event.id },
    });
    if (!meeting) continue;

    for (const email of invitedEmails) {
      const attendee = await prisma.attendee.findUnique({ where: { email } });
      if (!attendee) continue;

      await prisma.meetingAttendance.upsert({
        where: { meetingId_attendeeId: { meetingId: meeting.id, attendeeId: attendee.id } },
        update: {},
        create: {
          meetingId: meeting.id,
          attendeeId: attendee.id,
          wasInvited: true,
        },
      });
    }
  }

  console.log(`[Calendar] Synced ${events.length} meeting(s)`);
}

// ---------------------------------------------------------------------------
// Step 2: After meetings end, fetch Reports API and record actual attendance
// ---------------------------------------------------------------------------

async function processEndedMeetings(): Promise<void> {
  const now = new Date();

  // Find meetings that ended more than 10 minutes ago and haven't been processed
  const unprocessed = await prisma.meeting.findMany({
    where: {
      processed: false,
      endTime: { lt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
  });

  if (!unprocessed.length) return;

  console.log(`[Reports] Processing ${unprocessed.length} ended meeting(s)...`);

  for (const meeting of unprocessed) {
    try {
      const report = await getMeetAttendance(meeting.calendarEventId, meeting.startTime, meeting.endTime);

      if (!report) {
        // Reports API may not have data yet (up to 72h delay) — try again later
        // But if it's been more than 3 days, give up
        const ageDays = (now.getTime() - meeting.endTime.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 3) {
          await prisma.meeting.update({ where: { id: meeting.id }, data: { processed: true } });
          console.log(`[Reports] No data after 3 days for "${meeting.title}" — marking done`);
        }
        continue;
      }

      // Write actual join/leave data
      for (const participant of report.participants) {
        if (!participant.email.endsWith('@scalearmy.com')) continue;

        const attendee = await prisma.attendee.upsert({
          where: { email: participant.email },
          update: { displayName: participant.displayName },
          create: { email: participant.email, displayName: participant.displayName },
        });

        const minutesLate = Math.max(
          0,
          Math.round((participant.joinTime.getTime() - meeting.startTime.getTime()) / 60000)
        );
        const wasLate = minutesLate > LATE_THRESHOLD_MINUTES;
        const camera = computeCameraStats(participant.videoSendSeconds, participant.durationSeconds);

        await prisma.meetingAttendance.upsert({
          where: { meetingId_attendeeId: { meetingId: meeting.id, attendeeId: attendee.id } },
          update: {
            joinTime: participant.joinTime,
            leaveTime: participant.leaveTime,
            durationMin: participant.durationMin,
            minutesLate,
            wasLate,
            ...camera,
          },
          create: {
            meetingId: meeting.id,
            attendeeId: attendee.id,
            joinTime: participant.joinTime,
            leaveTime: participant.leaveTime,
            durationMin: participant.durationMin,
            minutesLate,
            wasLate,
            wasInvited: false, // joined but wasn't on the calendar invite
            ...camera,
          },
        });
      }

      await prisma.meeting.update({ where: { id: meeting.id }, data: { processed: true } });
      console.log(
        `[Reports] Processed "${meeting.title}" — ${report.participants.length} participant(s)`
      );
    } catch (err) {
      console.error(`[Reports] Error processing "${meeting.title}":`, err);
    }
  }
}
