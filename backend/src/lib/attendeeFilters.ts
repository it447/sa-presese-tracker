import prisma from "../db/client";

// ---------------------------------------------------------------------------
// Boolean pattern matching for meeting exclusion rules
// ---------------------------------------------------------------------------
// Pattern syntax (case-insensitive):
//   - Space-separated words = AND (all must appear in the title)
//   - OR keyword between groups = OR
//   - -word prefix = NOT (title must NOT contain this word)
// Examples:
//   "interview block"       → title contains "interview" AND "block"
//   "interview OR onboarding" → title contains either word
//   "interview -internal"   → title has "interview" but NOT "internal"
export function matchesPattern(title: string, pattern: string): boolean {
  if (!pattern.trim()) return false;
  const lower = title.toLowerCase();
  const orGroups = pattern.toLowerCase().split(/\bor\b/);
  return orGroups.some((group) => {
    const terms = group.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return false;
    return terms.every((term) => {
      if (term.startsWith("-") && term.length > 1) {
        return !lower.includes(term.slice(1));
      }
      return lower.includes(term);
    });
  });
}

export async function getValidAttendeeIds(): Promise<string[]> {
  const attendees = await prisma.attendee.findMany({
    where: { email: { endsWith: "@scalearmy.com" }, hidden: false },
    select: { id: true },
  });
  return attendees.map((a) => a.id);
}

export async function getExcludedMeetingIds(): Promise<string[]> {
  const rules = await prisma.meetingExclusionRule.findMany();
  if (rules.length === 0) return [];
  const allMeetings = await prisma.meeting.findMany({ select: { id: true, title: true } });
  return allMeetings
    .filter((m) => rules.some((r) => matchesPattern(m.title, r.pattern)))
    .map((m) => m.id);
}
