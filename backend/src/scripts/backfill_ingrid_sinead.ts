/**
 * One-time backfill: sync the past 30 days of calendar events for
 * ingrid@scalearmy.com and sinead@scalearmy.com into the DB.
 *
 * Run from the backend directory:
 *   node -r ts-node/register src/scripts/backfill_ingrid_sinead.ts
 * Or compile first:
 *   npx ts-node src/scripts/backfill_ingrid_sinead.ts
 */

import { getCalendarEventsForRange } from "../calendar/client";
import { extractMeetCode } from "../reports/client";
import prisma from "../db/client";

const EMAILS = ["ingrid@scalearmy.com", "sinead@scalearmy.com"];
const DAYS_BACK = 30;

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);

  console.log(`Backfilling calendar events from ${from.toISOString()} to ${now.toISOString()}`);

  for (const email of EMAILS) {
    console.log(`\n--- Fetching calendar for ${email} ---`);

    let events;
    try {
      events = await getCalendarEventsForRange(from, now, email);
    } catch (err) {
      console.error(`  Failed to fetch calendar for ${email}:`, err);
      continue;
    }

    console.log(`  Found ${events.length} meetings with Meet links`);

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
          processed: false,
        },
      });

      // Upsert all @scalearmy.com attendees
      for (const a of event.attendees) {
        if (!a.email.endsWith("@scalearmy.com")) continue;
        await prisma.attendee.upsert({
          where: { email: a.email },
          update: { displayName: a.displayName },
          create: { email: a.email, displayName: a.displayName },
        });
      }

      const meeting = await prisma.meeting.findUnique({
        where: { calendarEventId: event.id },
      });
      if (!meeting) continue;

      // Create placeholder attendance rows for all invited @scalearmy.com people
      for (const a of event.attendees) {
        if (!a.email.endsWith("@scalearmy.com")) continue;
        const attendee = await prisma.attendee.findUnique({ where: { email: a.email } });
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

      console.log(`  ✓ ${event.startTime.toISOString().slice(0, 16)} — ${event.title.slice(0, 60)}`);
    }
  }

  console.log("\nBackfill complete. The scheduler will process attendance on its next run.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
