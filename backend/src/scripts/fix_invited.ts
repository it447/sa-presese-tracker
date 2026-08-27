/**
 * Fix wasInvited=false for employees whose meetings are on their calendar.
 * If a meeting appears on someone's calendar, they were invited.
 */

import { getCalendarEventsForRange } from "../calendar/client";
import prisma from "../db/client";

const DAYS_BACK = 30;

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);

  const allAttendees = await prisma.attendee.findMany({
    where: { email: { endsWith: "@scalearmy.com" }, hidden: false },
    select: { email: true, id: true },
    orderBy: { email: "asc" },
  });

  console.log(`Fixing wasInvited for ${allAttendees.length} employees...`);
  console.log(`Period: ${from.toISOString()} → ${now.toISOString()}\n`);

  let totalFixed = 0;

  for (let i = 0; i < allAttendees.length; i++) {
    const { email, id: attendeeId } = allAttendees[i];
    process.stdout.write(`[${i + 1}/${allAttendees.length}] ${email}... `);

    let events;
    try {
      events = await getCalendarEventsForRange(from, now, email);
    } catch (err: any) {
      console.log("✗ Calendar API failed");
      continue;
    }

    let fixed = 0;
    for (const event of events) {
      const meeting = await prisma.meeting.findUnique({
        where: { calendarEventId: event.id },
        select: { id: true },
      });
      if (!meeting) continue;

      // Update: if the row exists with wasInvited=false, set it to true
      const result = await prisma.meetingAttendance.updateMany({
        where: {
          meetingId: meeting.id,
          attendeeId,
          wasInvited: false,
        },
        data: { wasInvited: true },
      });
      fixed += result.count;

      // Also create if completely missing
      const existing = await prisma.meetingAttendance.findUnique({
        where: { meetingId_attendeeId: { meetingId: meeting.id, attendeeId } },
      });
      if (!existing) {
        await prisma.meetingAttendance.create({
          data: { meetingId: meeting.id, attendeeId, wasInvited: true },
        });
        fixed++;
      }
    }

    totalFixed += fixed;
    console.log(`${events.length} events, ${fixed} rows fixed`);
  }

  console.log(`\n✓ Complete. Fixed ${totalFixed} wasInvited flags.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
