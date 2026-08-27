/**
 * One-shot backfill: syncs Google Calendar events with Meet links for all
 * monitored accounts, then fetches Reports API attendance for ended meetings.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json src/scripts/backfill-week.ts
 */
import "dotenv/config";
import { getCalendarEventsForRange } from "../calendar/client";
import { getMeetAttendance, extractMeetCode } from "../reports/client";
import prisma from "../db/client";
import { LATE_THRESHOLD_MINUTES, computeCameraStats } from "../config";

const MONITORED_EMAILS = (process.env.MONITORED_EMAILS || process.env.GOOGLE_SUBJECT_EMAIL || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

async function main() {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  console.log(`\nBackfilling meetings from ${weekStart.toISOString()} → ${now.toISOString()}`);
  console.log(`Monitored accounts: ${MONITORED_EMAILS.join(", ")}\n`);

  // ── Step 1: Sync calendar events from all accounts ────────────────────────
  const allEvents = new Map<string, Awaited<ReturnType<typeof getCalendarEventsForRange>>[number]>();

  for (const email of MONITORED_EMAILS) {
    try {
      const events = await getCalendarEventsForRange(weekStart, now, email);
      console.log(`  ${email}: ${events.length} event(s)`);
      for (const e of events) allEvents.set(e.id, e);
    } catch (err: any) {
      console.error(`  Failed for ${email}: ${err.message}`);
    }
  }

  const events = [...allEvents.values()];
  console.log(`\nTotal unique meetings: ${events.length}\n`);

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

    for (const a of event.attendees) {
      await prisma.attendee.upsert({
        where: { email: a.email },
        update: { displayName: a.displayName },
        create: { email: a.email, displayName: a.displayName },
      });
    }

    const meeting = await prisma.meeting.findUnique({ where: { calendarEventId: event.id } });
    if (!meeting) continue;

    for (const a of event.attendees) {
      const attendee = await prisma.attendee.findUnique({ where: { email: a.email } });
      if (!attendee) continue;
      await prisma.meetingAttendance.upsert({
        where: { meetingId_attendeeId: { meetingId: meeting.id, attendeeId: attendee.id } },
        update: {},
        create: { meetingId: meeting.id, attendeeId: attendee.id, wasInvited: true },
      });
    }
  }

  console.log("Calendar sync done.\n");

  // ── Step 2: Mark meetings older than 30 days as processed (skip old data) ───
  const oldUnprocessed = await prisma.meeting.findMany({
    where: { processed: false, startTime: { lt: weekStart } },
    select: { id: true },
  });
  if (oldUnprocessed.length) {
    await prisma.meeting.updateMany({
      where: { id: { in: oldUnprocessed.map((m) => m.id) } },
      data: { processed: true },
    });
    console.log(`Skipped ${oldUnprocessed.length} meeting(s) older than 30 days.\n`);
  }

  // ── Step 3: Process ended meetings via Reports API ─────────────────────────
  const unprocessed = await prisma.meeting.findMany({
    where: {
      processed: false,
      endTime: { lt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
  });

  console.log(`Processing ${unprocessed.length} ended meeting(s) via Reports API...\n`);

  let processed = 0;
  let noData = 0;

  for (const meeting of unprocessed) {
    try {
      const report = await getMeetAttendance(meeting.calendarEventId, meeting.startTime, meeting.endTime);

      if (!report) {
        console.log(`  ⚠ No Reports API data yet for "${meeting.title}"`);
        noData++;
        continue;
      }

      for (const participant of report.participants) {
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
            wasInvited: false,
            ...camera,
          },
        });
      }

      await prisma.meeting.update({ where: { id: meeting.id }, data: { processed: true } });
      console.log(`  ✓ "${meeting.title}" — ${report.participants.length} participant(s)`);
      processed++;
    } catch (err: any) {
      console.error(`  ✗ "${meeting.title}": ${err.message}`);
    }
  }

  console.log(`\nDone. Processed: ${processed}, No data yet: ${noData}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
