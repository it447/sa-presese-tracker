/**
 * Cron job endpoints — called by Vercel Cron on a schedule.
 * Locally these are driven by node-cron in scheduler/index.ts instead.
 *
 * Both routes are protected by CRON_SECRET so they can't be triggered externally.
 */
import { Router, Request, Response } from "express";
import { getCalendarEventsForRange, getUpcomingMeetings } from "../calendar/client";
import { getMeetAttendance, extractMeetCode } from "../reports/client";
import prisma from "../db/client";
import { LATE_THRESHOLD_MINUTES, computeCameraStats } from "../config";
import { postWeeklyReport } from "../slack/client";

const router = Router();

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (dev mode)
  if (req.headers["authorization"] === `Bearer ${secret}`) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

// ── POST /api/cron/sync-calendar ─────────────────────────────────────────────
// Syncs upcoming calendar events into the DB (runs every 5 min via Vercel Cron)
router.post("/sync-calendar", async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;

  try {
    const events = await getUpcomingMeetings(24 * 60);

    for (const event of events) {
      const meetCode = extractMeetCode(event.meetUrl);

      let safeMeetCode = meetCode;
      if (meetCode) {
        const conflict = await prisma.meeting.findUnique({
          where: { meetId: meetCode },
          select: { calendarEventId: true },
        });
        if (conflict && conflict.calendarEventId !== event.id) safeMeetCode = null;
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

    res.json({ ok: true, synced: events.length });
  } catch (err: any) {
    console.error("[cron/sync-calendar]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/cron/process-meetings ──────────────────────────────────────────
// Processes ended meetings via Reports API (runs every 10 min via Vercel Cron)
router.post("/process-meetings", async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;

  const now = new Date();
  const unprocessed = await prisma.meeting.findMany({
    where: {
      processed: false,
      endTime: { lt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
  });

  let processed = 0;

  for (const meeting of unprocessed) {
    try {
      const report = await getMeetAttendance(meeting.calendarEventId, meeting.startTime, meeting.endTime);

      if (!report) {
        const ageDays = (now.getTime() - meeting.endTime.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 3) {
          await prisma.meeting.update({ where: { id: meeting.id }, data: { processed: true } });
        }
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
          update: { joinTime: participant.joinTime, leaveTime: participant.leaveTime, durationMin: participant.durationMin, minutesLate, wasLate, ...camera },
          create: { meetingId: meeting.id, attendeeId: attendee.id, joinTime: participant.joinTime, leaveTime: participant.leaveTime, durationMin: participant.durationMin, minutesLate, wasLate, wasInvited: false, ...camera },
        });
      }

      await prisma.meeting.update({ where: { id: meeting.id }, data: { processed: true } });
      processed++;
    } catch (err: any) {
      console.error(`[cron/process-meetings] "${meeting.title}":`, err.message);
    }
  }

  res.json({ ok: true, processed, total: unprocessed.length });
});

// ── POST /api/cron/weekly-report ─────────────────────────────────────────────
// Posts the week's leaderboard (lateness + camera-off) to Slack.
// Scheduled via vercel.json for end-of-week; see backend/src/slack/client.ts.
router.post("/weekly-report", async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;

  try {
    const result = await postWeeklyReport();
    res.json(result);
  } catch (err: any) {
    console.error("[cron/weekly-report]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
