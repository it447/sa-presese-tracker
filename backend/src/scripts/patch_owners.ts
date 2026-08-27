/**
 * Patch backfill: For each @scalearmy.com employee, re-fetch their calendar
 * for the past 30 days and ensure THEY have an attendance row for every
 * meeting on their own calendar (fixing the "calendar owner not in attendees list" bug).
 */

import { getCalendarEventsForRange } from "../calendar/client";
import prisma from "../db/client";

const DAYS_BACK = 30;

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);

  const allAttendees = await prisma.attendee.findMany({
    where: { email: { endsWith: "@scalearmy.com" }, hidden: false },
    select: { email: true, id: true, displayName: true },
    orderBy: { email: "asc" },
  });

  console.log(`Patching ${allAttendees.length} employees — ensuring calendar owners have attendance rows`);
  console.log(`Period: ${from.toISOString()} → ${now.toISOString()}\n`);

  let totalPatched = 0;

  for (let i = 0; i < allAttendees.length; i++) {
    const { email, id: attendeeId } = allAttendees[i];
    process.stdout.write(`[${i + 1}/${allAttendees.length}] ${email}... `);

    let events;
    try {
      events = await getCalendarEventsForRange(from, now, email);
    } catch (err: any) {
      console.log(`✗ Calendar API failed`);
      continue;
    }

    let patched = 0;
    for (const event of events) {
      // Find the meeting in the DB
      const meeting = await prisma.meeting.findUnique({
        where: { calendarEventId: event.id },
        select: { id: true },
      });
      if (!meeting) continue; // meeting not in DB (shouldn't happen after backfill, but skip)

      // Check if this person already has an attendance row
      const existing = await prisma.meetingAttendance.findUnique({
        where: { meetingId_attendeeId: { meetingId: meeting.id, attendeeId } },
      });
      if (existing) continue; // already has a row

      // Create the missing attendance row
      await prisma.meetingAttendance.create({
        data: {
          meetingId: meeting.id,
          attendeeId,
          wasInvited: true,
        },
      });
      patched++;
    }

    totalPatched += patched;
    console.log(`${events.length} events, ${patched} attendance rows added`);
  }

  console.log(`\n✓ Patch complete. Added ${totalPatched} missing attendance rows.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
