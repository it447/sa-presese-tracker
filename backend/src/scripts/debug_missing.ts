/**
 * Debug: figure out why meetings are missing after backfill.
 * Checks rodas@scalearmy.com — worst case with 28 missing.
 */

import { getCalendarEventsForRange } from "../calendar/client";
import prisma from "../db/client";

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const email = "rodas@scalearmy.com";
  const calEvents = await getCalendarEventsForRange(from, now, email);

  const attendee = await prisma.attendee.findUnique({ where: { email } });
  if (!attendee) { console.log("Not found"); return; }

  const dbRows = await prisma.meetingAttendance.findMany({
    where: { attendeeId: attendee.id, wasInvited: true, meeting: { startTime: { gte: from, lte: now } } },
    include: { meeting: { select: { calendarEventId: true } } },
  });
  const dbEventIds = new Set(dbRows.map((r) => r.meeting.calendarEventId));

  const missing = calEvents.filter((e) => !dbEventIds.has(e.id));

  console.log(`Missing ${missing.length} meetings for ${email}:\n`);
  for (const m of missing.slice(0, 15)) {
    // Check if the meeting exists in DB at all (maybe just missing attendance)
    const dbMeeting = await prisma.meeting.findUnique({
      where: { calendarEventId: m.id },
    });

    // Check if the person is in the event's attendee list
    const isInAttendees = m.attendees.some((a: any) => a.email === email);

    console.log(`  ${m.startTime.toISOString().slice(0, 16)} | ${m.title.slice(0, 50)}`);
    console.log(`    calendarEventId: ${m.id.slice(0, 40)}...`);
    console.log(`    meeting in DB: ${dbMeeting ? 'YES (id=' + dbMeeting.id.slice(0, 10) + ')' : 'NO'}`);
    console.log(`    ${email} in attendees list: ${isInAttendees}`);
    console.log(`    attendees count: ${m.attendees.length}`);
    if (!isInAttendees) {
      console.log(`    attendees: ${m.attendees.map((a: any) => a.email).join(', ')}`);
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
