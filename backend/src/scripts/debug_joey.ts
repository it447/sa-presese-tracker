/**
 * Debug Joey's missing All-Hands meetings
 */
import { getCalendarEventsForRange } from "../calendar/client";
import prisma from "../db/client";

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const email = "joey@scalearmy.com";

  const calEvents = await getCalendarEventsForRange(from, now, email);
  
  // Get the missing All-Hands events
  const allHands = calEvents.filter(e => 
    e.title.includes("All-Hands") && !e.title.includes("Quarterly")
  );

  console.log(`Joey's All-Hands events from Calendar API (${allHands.length}):\n`);
  for (const e of allHands) {
    const dbMeeting = await prisma.meeting.findUnique({ where: { calendarEventId: e.id } });
    // Search for same time/title in DB
    const sameTimeMeetings = await prisma.meeting.findMany({
      where: { 
        title: { contains: "All-Hands" },
        startTime: e.startTime,
      },
    });
    
    console.log(`  ${e.startTime.toISOString().slice(0, 16)}`);
    console.log(`    Joey's event ID: ${e.id}`);
    console.log(`    In DB by exact ID: ${dbMeeting ? 'YES' : 'NO'}`);
    console.log(`    Same-time All-Hands in DB: ${sameTimeMeetings.length}`);
    if (sameTimeMeetings.length > 0) {
      sameTimeMeetings.forEach(m => console.log(`      DB event ID: ${m.calendarEventId}`));
    }
    console.log('');
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
