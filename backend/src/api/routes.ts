import { Router, Request, Response } from "express";
import prisma from "../db/client";
import { getValidAttendeeIds, getExcludedMeetingIds, matchesPattern } from "../lib/attendeeFilters";

const router = Router();

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "scale-army";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "scale-army-admin";

router.post("/auth/login", (req: Request, res: Response) => {
  if (req.body.password === DASHBOARD_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

// Protect all routes below this point
router.use((req: Request, res: Response, next: import("express").NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${DASHBOARD_PASSWORD}`) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/settings/people  – list all with hidden status (admin only)
// POST /api/settings/people/:email/hidden  – set hidden: true/false
// POST /api/settings/auth  – verify admin password
// ---------------------------------------------------------------------------
router.post("/settings/auth", (req: Request, res: Response) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid admin password" });
  }
});

router.get("/settings/people", async (_req: Request, res: Response) => {
  const attendees = await prisma.attendee.findMany({
    where: { email: { endsWith: "@scalearmy.com" } },
    select: { email: true, displayName: true, hidden: true, isLeadership: true },
    orderBy: { displayName: "asc" },
  });
  res.json(attendees);
});

router.post("/settings/people/:email/leadership", async (req: Request, res: Response) => {
  if (req.body.adminPassword !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }
  const email = decodeURIComponent(req.params.email);
  if (!email.endsWith("@scalearmy.com")) {
    res.status(403).json({ error: "Only ScaleArmy emails are allowed" });
    return;
  }
  const { isLeadership } = req.body as { isLeadership: boolean; adminPassword: string };
  await prisma.attendee.update({ where: { email }, data: { isLeadership } });
  res.json({ success: true });
});

router.post("/settings/people/:email/hidden", async (req: Request, res: Response) => {
  if (req.body.adminPassword !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }
  const email = decodeURIComponent(req.params.email);
  if (!email.endsWith("@scalearmy.com")) {
    res.status(403).json({ error: "Only ScaleArmy emails are allowed" });
    return;
  }
  const { hidden } = req.body as { hidden: boolean; adminPassword: string };
  await prisma.attendee.update({ where: { email }, data: { hidden } });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Meeting exclusion rules
// GET  /api/settings/exclusion-rules         – list all rules with match counts
// POST /api/settings/exclusion-rules         – create a rule (adminPassword required)
// DELETE /api/settings/exclusion-rules/:id   – delete a rule (adminPassword required)
// GET  /api/settings/exclusion-rules/preview – count meetings matching ?pattern=
// ---------------------------------------------------------------------------
router.get("/settings/exclusion-rules/preview", async (req: Request, res: Response) => {
  const pattern = ((req.query.pattern as string) || "").trim();
  if (!pattern) {
    res.json({ matchCount: 0, breakdown: [] });
    return;
  }
  const allMeetings = await prisma.meeting.findMany({ select: { id: true, title: true } });
  const matchCount = allMeetings.filter((m) => matchesPattern(m.title, pattern)).length;

  // Build per-term breakdown so the UI can show which terms are restricting results
  const breakdown: { term: string; isNot: boolean; matchCount: number }[] = [];
  const orGroups = pattern.toLowerCase().split(/\bor\b/);
  const seenTerms = new Set<string>();
  for (const group of orGroups) {
    for (const raw of group.trim().split(/\s+/).filter(Boolean)) {
      if (seenTerms.has(raw)) continue;
      seenTerms.add(raw);
      const isNot = raw.startsWith("-") && raw.length > 1;
      const word = isNot ? raw.slice(1) : raw;
      const count = allMeetings.filter((m) => m.title.toLowerCase().includes(word)).length;
      breakdown.push({ term: raw, isNot, matchCount: count });
    }
  }

  res.json({ matchCount, breakdown });
});

router.get("/settings/exclusion-rules", async (_req: Request, res: Response) => {
  const rules = await prisma.meetingExclusionRule.findMany({ orderBy: { createdAt: "asc" } });
  const allMeetings = await prisma.meeting.findMany({ select: { id: true, title: true } });
  const rulesWithCounts = rules.map((rule) => ({
    ...rule,
    matchCount: allMeetings.filter((m) => matchesPattern(m.title, rule.pattern)).length,
  }));
  res.json(rulesWithCounts);
});

router.post("/settings/exclusion-rules", async (req: Request, res: Response) => {
  if (req.body.adminPassword !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }
  const { name = "", pattern } = req.body as { name?: string; pattern: string; adminPassword: string };
  if (!pattern?.trim()) {
    res.status(400).json({ error: "Pattern is required" });
    return;
  }
  const rule = await prisma.meetingExclusionRule.create({ data: { name, pattern: pattern.trim() } });
  res.json(rule);
});

router.delete("/settings/exclusion-rules/:id", async (req: Request, res: Response) => {
  if (req.body.adminPassword !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }
  await prisma.meetingExclusionRule.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/people
// All people who appear in any meeting, with aggregate stats
// ---------------------------------------------------------------------------
router.get("/people", async (_req: Request, res: Response) => {
  const excludedIds = await getExcludedMeetingIds();
  const excludedFilter = excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {};

  const attendees = await prisma.attendee.findMany({
    where: { email: { endsWith: "@scalearmy.com" }, hidden: false },
    include: {
      attendance: {
        where: {
          wasInvited: true,
          meeting: { ...excludedFilter },  // all invited, NOT filtered by processed
        },
        include: { meeting: { select: { processed: true } } },
      },
    },
  });

  const result = attendees
    .map((a) => {
      const allInvited = a.attendance;
      // Only processed meetings count toward the rate (we have actual attend data)
      const monitored = allInvited.filter((r) => r.meeting.processed && (r.joinTime !== null || r.minutesLate !== null));
      const lateCount = allInvited.filter((r) => r.meeting.processed && r.wasLate).length;
      const lateMins = allInvited
        .filter((r) => r.meeting.processed && r.wasLate && r.minutesLate !== null)
        .map((r) => r.minutesLate!);

      // Camera stats only make sense for meetings they actually joined and that reported video data
      const withCameraData = allInvited.filter(
        (r) => r.meeting.processed && r.joinTime !== null && r.cameraOnRatio !== null
      );
      const cameraOffCount = withCameraData.filter((r) => r.cameraOff).length;

      return {
        email: a.email,
        displayName: a.displayName,
        totalMeetings: allInvited.length,          // all on calendar
        monitoredMeetings: monitored.length,        // processed subset
        lateCount,
        lateRate: monitored.length > 0 ? Math.round((lateCount / monitored.length) * 100) : 0,
        avgMinutesLate:
          lateMins.length > 0
            ? Math.round(lateMins.reduce((s, n) => s + n, 0) / lateMins.length)
            : 0,
        maxMinutesLate: lateMins.length > 0 ? Math.max(...lateMins) : 0,
        totalMinutesLate: lateMins.reduce((s, n) => s + n, 0),
        cameraTrackedMeetings: withCameraData.length,
        cameraOffCount,
        cameraOffRate: withCameraData.length > 0 ? Math.round((cameraOffCount / withCameraData.length) * 100) : 0,
        avgCameraOnRatio:
          withCameraData.length > 0
            ? Math.round(
                (withCameraData.reduce((s, r) => s + (r.cameraOnRatio ?? 0), 0) / withCameraData.length) * 100
              )
            : null,
      };
    })
    .sort((a, b) => b.lateRate - a.lateRate);

  res.json(result);
});


// ---------------------------------------------------------------------------
// GET /api/people/:email/stats
// One person's full meeting history
// ---------------------------------------------------------------------------
router.get("/people/:email/stats", async (req: Request, res: Response) => {
  const email = decodeURIComponent(req.params.email);

  if (!email.endsWith("@scalearmy.com")) {
    res.status(403).json({ error: "Only ScaleArmy emails are allowed" });
    return;
  }

  const attendee = await prisma.attendee.findUnique({
    where: { email },
    include: {
      attendance: {
        where: { wasInvited: true },  // all invited — processed filter removed
        include: { meeting: true },
        orderBy: { meeting: { startTime: "desc" } },
      },
    },
  });

  if (!attendee) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  const excludedIds = await getExcludedMeetingIds();
  const filteredAttendance =
    excludedIds.length > 0
      ? attendee.attendance.filter((a) => !excludedIds.includes(a.meeting.id))
      : attendee.attendance;

  const meetings = filteredAttendance.map((a) => ({
    meetingId: a.meeting.id,
    startTime: a.meeting.startTime,
    endTime: a.meeting.endTime,
    joinTime: a.joinTime,
    minutesLate: a.minutesLate,
    wasLate: a.wasLate,
    noShow: a.joinTime === null,
    durationMin: a.durationMin,
    processed: a.meeting.processed,
    cameraOnRatio: a.cameraOnRatio,
    cameraOff: a.cameraOff,
  }));

  // Only count processed meetings for rate calculations
  const processedMeetings = meetings.filter((m) => m.processed);
  const monitored = processedMeetings.filter((m) => m.joinTime !== null || m.minutesLate !== null);
  const lateCount = processedMeetings.filter((m) => m.wasLate).length;
  const lateMins = processedMeetings.filter((m) => m.wasLate && m.minutesLate !== null).map((m) => m.minutesLate!);

  const withCameraData = processedMeetings.filter((m) => m.joinTime !== null && m.cameraOnRatio !== null);
  const cameraOffCount = withCameraData.filter((m) => m.cameraOff).length;

  let maxStreak = 0;
  let tempStreak = 0;
  for (let i = processedMeetings.length - 1; i >= 0; i--) { // chronological
    const m = processedMeetings[i];
    if (m.joinTime && !m.wasLate) {
      tempStreak++;
    } else if (m.wasLate) {
      if (tempStreak > maxStreak) maxStreak = tempStreak;
      tempStreak = 0;
    }
  }
  if (tempStreak > maxStreak) maxStreak = tempStreak;

  let currentStreak = 0;
  for (let i = 0; i < processedMeetings.length; i++) { // most recent first
    const m = processedMeetings[i];
    if (m.joinTime && !m.wasLate) {
      currentStreak++;
    } else if (m.wasLate) {
      break;
    }
  }

  res.json({
    email: attendee.email,
    displayName: attendee.displayName,
    totalMeetings: meetings.length,          // all on calendar
    monitoredMeetings: monitored.length,     // processed subset
    lateCount,
    lateRate: monitored.length > 0 ? Math.round((lateCount / monitored.length) * 100) : 0,
    avgMinutesLate:
      lateMins.length > 0 ? Math.round(lateMins.reduce((s, n) => s + n, 0) / lateMins.length) : 0,
    maxMinutesLate: lateMins.length > 0 ? Math.max(...lateMins) : 0,
    totalMinutesLate: lateMins.reduce((s, n) => s + n, 0),
    currentStreak,
    maxStreak,
    cameraTrackedMeetings: withCameraData.length,
    cameraOffCount,
    cameraOffRate: withCameraData.length > 0 ? Math.round((cameraOffCount / withCameraData.length) * 100) : 0,
    avgCameraOnRatio:
      withCameraData.length > 0
        ? Math.round((withCameraData.reduce((s, m) => s + (m.cameraOnRatio ?? 0), 0) / withCameraData.length) * 100)
        : null,
    meetings,  // includes processed flag, cameraOnRatio, cameraOff per meeting
  });
});


// ---------------------------------------------------------------------------
// GET /api/dashboard/summary[?since=ISO_DATE&until=ISO_DATE]
// Aggregate view for the dashboard home. Defaults to the past 7 days.
// ---------------------------------------------------------------------------
router.get("/dashboard/summary", async (req: Request, res: Response) => {
  const sinceParam = req.query.since as string | undefined;
  const untilParam = req.query.until as string | undefined;

  const since = sinceParam ? new Date(sinceParam) : (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    return d;
  })();

  const until = untilParam ? new Date(untilParam) : new Date();

  const [excludedIds, validAttendeeIds] = await Promise.all([
    getExcludedMeetingIds(),
    getValidAttendeeIds(),
  ]);
  const excludedFilter = excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {};

  // All invited attendance in range (processed OR not) — for "total on calendar"
  const allAttendance = await prisma.meetingAttendance.findMany({
    where: {
      wasInvited: true,
      attendeeId: { in: validAttendeeIds },
      meeting: { startTime: { gte: since, lte: until }, ...excludedFilter },
    },
    include: { attendee: true, meeting: true },
  });

  // Only processed meetings — for late rate / no-show calculations
  const processedAttendance = allAttendance.filter((a) => a.meeting.processed);

  const byPerson = new Map<
    string,
    {
      email: string;
      displayName: string;
      isLeadership: boolean;
      totalMeetings: number;     // all on calendar (inc. unprocessed)
      assessedMeetings: number;  // processed only — denominates the rate
      lateCount: number;
      noShowCount: number;
      totalMinutesLate: number;
      cameraTrackedMeetings: number; // processed, joined, and Meet reported video data
      cameraOffCount: number;
      cameraOnRatioSum: number;
    }
  >();

  // Count total (calendar) meetings for each person
  for (const a of allAttendance) {
    const key = a.attendee.email;
    const existing = byPerson.get(key) ?? {
      email: a.attendee.email,
      displayName: a.attendee.displayName,
      isLeadership: a.attendee.isLeadership,
      totalMeetings: 0,
      assessedMeetings: 0,
      lateCount: 0,
      noShowCount: 0,
      totalMinutesLate: 0,
      cameraTrackedMeetings: 0,
      cameraOffCount: 0,
      cameraOnRatioSum: 0,
    };
    byPerson.set(key, { ...existing, totalMeetings: existing.totalMeetings + 1 });
  }

  // Layer in processed-only stats
  for (const a of processedAttendance) {
    const key = a.attendee.email;
    const existing = byPerson.get(key)!;
    const hasCameraData = a.joinTime !== null && a.cameraOnRatio !== null;
    byPerson.set(key, {
      ...existing,
      assessedMeetings: existing.assessedMeetings + 1,
      lateCount: existing.lateCount + (a.wasLate ? 1 : 0),
      noShowCount: existing.noShowCount + (a.joinTime === null ? 1 : 0),
      totalMinutesLate: existing.totalMinutesLate + (a.minutesLate ?? 0),
      cameraTrackedMeetings: existing.cameraTrackedMeetings + (hasCameraData ? 1 : 0),
      cameraOffCount: existing.cameraOffCount + (hasCameraData && a.cameraOff ? 1 : 0),
      cameraOnRatioSum: existing.cameraOnRatioSum + (hasCameraData ? a.cameraOnRatio ?? 0 : 0),
    });
  }

  const people = Array.from(byPerson.values()).map((p) => ({
    ...p,
    // Use assessedMeetings as denominator so unprocessed ones don't deflate the rate
    lateRate: p.assessedMeetings > 0 ? Math.round((p.lateCount / p.assessedMeetings) * 100) : 0,
    noShowRate: p.assessedMeetings > 0 ? Math.round((p.noShowCount / p.assessedMeetings) * 100) : 0,
    avgMinutesLate: p.lateCount > 0 ? Math.round(p.totalMinutesLate / p.lateCount) : 0,
    cameraOffRate: p.cameraTrackedMeetings > 0 ? Math.round((p.cameraOffCount / p.cameraTrackedMeetings) * 100) : 0,
    avgCameraOnRatio:
      p.cameraTrackedMeetings > 0 ? Math.round((p.cameraOnRatioSum / p.cameraTrackedMeetings) * 100) : null,
    // expose as `meetings` for UI back-compat, but also send totalMeetings separately
    meetings: p.totalMeetings,
  })).sort((a, b) => b.lateRate - a.lateRate);

  const totalMeetings = await prisma.meeting.count({
    where: { processed: true, startTime: { gte: since, lte: until }, ...excludedFilter },
  });
  const pendingMeetings = await prisma.meeting.count({
    where: { processed: false, startTime: { gte: since, lte: until }, ...excludedFilter },
  });


  res.json({ people, totalMeetings, pendingMeetings, since: since.toISOString(), until: until.toISOString() });
});

// ---------------------------------------------------------------------------
// GET /api/heatmap
// Matrix data for Phase 3 Heatmap
// ---------------------------------------------------------------------------
router.get("/heatmap", async (req: Request, res: Response) => {
  const excludedIds = await getExcludedMeetingIds();
  const excludedFilter = excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {};

  const meetings = await prisma.meeting.findMany({
    where: { processed: true, ...excludedFilter },
    orderBy: { startTime: "desc" },
    take: 50,
  });

  const validAttendeeIds = await getValidAttendeeIds();

  const allAttendance = await prisma.meetingAttendance.findMany({
    where: {
      meetingId: { in: meetings.map((m) => m.id) },
      attendeeId: { in: validAttendeeIds },
    },
    include: { attendee: true },
  });

  const peopleMap = new Map<string, any>();
  for (const a of allAttendance) {
    if (!peopleMap.has(a.attendee.email)) {
      peopleMap.set(a.attendee.email, {
        email: a.attendee.email,
        displayName: a.attendee.displayName,
        attendance: {},
      });
    }
    const p = peopleMap.get(a.attendee.email);
    if (!a.joinTime) continue;
    p.attendance[a.meetingId] = a.wasLate ? "late" : "on-time";
  }

  res.json({
    meetings: meetings.reverse(),
    people: Array.from(peopleMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)),
  });
});

// ---------------------------------------------------------------------------
// POST /api/backfill
// Backfill historical meetings for a given email over the past N days
// ---------------------------------------------------------------------------
router.post("/backfill", async (req: Request, res: Response) => {
  const { days = 14 } = req.body as { days?: number };

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const updated = await prisma.meeting.updateMany({
    where: {
      processed: false,
      startTime: { gte: cutoff },
    },
    data: { processed: false },
  });

  res.json({
    message: `Backfill queued. The Reports poller will process ${updated.count} meeting(s) on its next run.`,
    count: updated.count,
  });
});

// ---------------------------------------------------------------------------
// GET /api/search
// Global search (Phase 4)
// ---------------------------------------------------------------------------
router.get("/search", async (req: Request, res: Response) => {
  const query = (req.query.q as string || "").toLowerCase();
  if (!query) return res.json({ people: [], meetings: [] });

  const people = await prisma.attendee.findMany({
    where: {
      email: { endsWith: "@scalearmy.com" },
      OR: [
        { email: { contains: query } },
        { displayName: { contains: query } },
      ],
    },
    take: 5,
  });

  res.json({ people, meetings: [] });
});

export default router;
