/**
 * One-time backfill: sync the past 30 days of calendar events for ALL
 * non-hidden @scalearmy.com employees in the DB.
 *
 * Usage: npx ts-node src/scripts/backfill_all.ts
 */

import { getCalendarEventsForRange } from "../calendar/client";
import { extractMeetCode } from "../reports/client";
import prisma from "../db/client";

// These were already synced via MONITORED_EMAILS or a previous backfill
const ALREADY_SYNCED = new Set([
  "alex@scalearmy.com",
  "dijah@scalearmy.com",
  "yosele@scalearmy.com",
  "laura@scalearmy.com",
  "clara@scalearmy.com",
  "ingrid@scalearmy.com",
  "sinead@scalearmy.com",
]);

const DAYS_BACK = 30;

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);

  // Get all non-hidden @scalearmy.com employees
  const allAttendees = await prisma.attendee.findMany({
    where: { email: { endsWith: "@scalearmy.com" }, hidden: false },
    select: { email: true },
    orderBy: { email: "asc" },
  });

  const toBackfill = allAttendees
    .map((a) => a.email)
    .filter((e) => !ALREADY_SYNCED.has(e));

  console.log(`Backfill period: ${from.toISOString()} → ${now.toISOString()}`);
  console.log(`Total employees in DB: ${allAttendees.length}`);
  console.log(`Already synced: ${ALREADY_SYNCED.size}`);
  console.log(`To backfill: ${toBackfill.length}`);
  console.log(`Employees: ${toBackfill.join(", ")}\n`);

  let totalEvents = 0;

  for (let i = 0; i < toBackfill.length; i++) {
    const email = toBackfill[i];
    console.log(`[${i + 1}/${toBackfill.length}] ${email}...`);

    let events;
    try {
      events = await getCalendarEventsForRange(from, now, email);
    } catch (err: any) {
      console.log(`  ✗ Failed: ${err.message?.slice(0, 80)}`);
      continue;
    }

    console.log(`  Found ${events.length} meetings with Meet links`);
    totalEvents += events.length;

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
    }
  }

  console.log(`\n✓ Backfill complete. ${totalEvents} total events synced across ${toBackfill.length} employees.`);
  console.log("The scheduler will pick up attendance data on its next Reports API run.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
