/**
 * Force-process all unprocessed meetings right now to catch up the backfill.
 * Performs Reports API fetches with a concurrency of 5.
 */

import prisma from "../db/client";
import { getMeetAttendance } from "../reports/client";
import { LATE_THRESHOLD_MINUTES, computeCameraStats } from "../config";

async function main() {
  const now = new Date();

  // Find all unprocessed meetings that ended more than 10 minutes ago
  const unprocessed = await prisma.meeting.findMany({
    where: {
      processed: false,
      endTime: { lt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
    orderBy: { endTime: 'asc' }
  });

  console.log(`Found ${unprocessed.length} pending meetings to process...`);
  if (!unprocessed.length) return;

  const CONCURRENCY = 5;
  let processedCount = 0;
  let doneCount = 0;
  let noDataCount = 0;

  for (let i = 0; i < unprocessed.length; i += CONCURRENCY) {
    const batch = unprocessed.slice(i, i + CONCURRENCY);
    
    await Promise.all(batch.map(async (meeting) => {
      try {
        const report = await getMeetAttendance(meeting.calendarEventId, meeting.startTime, meeting.endTime);

        if (!report) {
          const ageDays = (now.getTime() - meeting.endTime.getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays > 3) {
            await prisma.meeting.update({ where: { id: meeting.id }, data: { processed: true } });
            noDataCount++;
          }
          return;
        }

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
              wasInvited: false, // If they weren't in the DB already (reports API found them joining)
              ...camera,
            },
          });
        }

        // Mark meeting as successfully processed
        await prisma.meeting.update({ where: { id: meeting.id }, data: { processed: true } });
        doneCount++;
      } catch (err: any) {
        // Ignore individual meeting errors to keep the batch going
      }
    }));

    processedCount += batch.length;
    process.stdout.write(`\rProcessed ${processedCount}/${unprocessed.length} (${Math.round((processedCount/unprocessed.length)*100)}%) | Success: ${doneCount} | Expired (No Data): ${noDataCount}`);
  }

  console.log(`\n\n✓ Processing complete!`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
