import prisma from "../db/client";

const SEED_EMAILS = (process.env.MONITORED_EMAILS || process.env.GOOGLE_SUBJECT_EMAIL || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

/**
 * Build the full list of emails to sync calendars for:
 * env-var seeds + every non-hidden @scalearmy.com attendee already in DB.
 * This lets coverage grow organically — anyone who shows up on a synced
 * meeting gets their own calendar synced going forward, so tracking isn't
 * limited to whichever accounts are seeded up front.
 */
export async function getMonitoredEmails(): Promise<string[]> {
  const dbAttendees = await prisma.attendee.findMany({
    where: { email: { endsWith: "@scalearmy.com" }, hidden: false },
    select: { email: true },
  });
  const all = new Set([...SEED_EMAILS, ...dbAttendees.map((a) => a.email)]);
  return Array.from(all);
}
