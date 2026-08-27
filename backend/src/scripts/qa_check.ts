/**
 * QA: For 5 random employees, compare what's in the DB vs what the Calendar API
 * returns for the past 30 days. They should match.
 */

import { getCalendarEventsForRange } from "../calendar/client";
import prisma from "../db/client";

const DAYS_BACK = 30;

// Pick 5 from the backfilled set (not the original 7 seed emails)
const QA_EMAILS = [
  "hanna@scalearmy.com",
  "joey@scalearmy.com",
  "rodas@scalearmy.com",
  "stefanie@scalearmy.com",
  "mohamed@scalearmy.com",
];

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);

  console.log(`QA check — past 30 days: ${from.toISOString()} → ${now.toISOString()}\n`);

  for (const email of QA_EMAILS) {
    // 1. What does the Calendar API say?
    let calEvents: any[] = [];
    try {
      calEvents = await getCalendarEventsForRange(from, now, email);
    } catch (err: any) {
      console.log(`${email}: ✗ Calendar API failed: ${err.message?.slice(0, 80)}`);
      continue;
    }

    // 2. What does the DB say?
    const attendee = await prisma.attendee.findUnique({ where: { email } });
    if (!attendee) {
      console.log(`${email}: ✗ Not found in DB`);
      continue;
    }

    const dbRows = await prisma.meetingAttendance.findMany({
      where: {
        attendeeId: attendee.id,
        wasInvited: true,
        meeting: { startTime: { gte: from, lte: now } },
      },
      include: { meeting: { select: { startTime: true, calendarEventId: true, processed: true } } },
    });

    const dbEventIds = new Set(dbRows.map((r) => r.meeting.calendarEventId));
    const calEventIds = new Set(calEvents.map((e) => e.id));

    // Meetings in Calendar but NOT in DB
    const missingFromDb = calEvents.filter((e) => !dbEventIds.has(e.id));
    // Meetings in DB but NOT in Calendar (could be from another attendee's calendar)
    const extraInDb = dbRows.filter((r) => !calEventIds.has(r.meeting.calendarEventId));

    const processedCount = dbRows.filter((r) => r.meeting.processed).length;
    const match = missingFromDb.length === 0;

    console.log(`=== ${email} ===`);
    console.log(`  Calendar API:  ${calEvents.length} meetings`);
    console.log(`  DB (invited):  ${dbRows.length} meetings (${processedCount} processed)`);
    console.log(`  Missing in DB: ${missingFromDb.length}`);
    console.log(`  Extra in DB:   ${extraInDb.length} (from shared meetings via other calendars)`);
    console.log(`  STATUS: ${match ? "✅ PASS" : "❌ FAIL — missing meetings!"}`);

    if (missingFromDb.length > 0 && missingFromDb.length <= 10) {
      console.log(`  Missing meetings:`);
      missingFromDb.forEach((e) => {
        console.log(`    ${e.startTime.toISOString().slice(0, 16)} | ${e.title.slice(0, 50)}`);
      });
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
