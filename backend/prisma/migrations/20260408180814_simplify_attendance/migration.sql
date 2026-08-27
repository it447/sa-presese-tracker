/*
  Warnings:

  - You are about to drop the `attendance_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `isOrganizer` on the `attendees` table. All the data in the column will be lost.
  - You are about to drop the column `meetingId` on the `attendees` table. All the data in the column will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "attendance_events";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "meeting_attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "joinTime" DATETIME,
    "leaveTime" DATETIME,
    "durationMin" INTEGER,
    "minutesLate" INTEGER,
    "wasLate" BOOLEAN NOT NULL DEFAULT false,
    "wasInvited" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "meeting_attendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "meeting_attendance_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_attendees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL
);
INSERT INTO "new_attendees" ("displayName", "email", "id") SELECT "displayName", "email", "id" FROM "attendees";
DROP TABLE "attendees";
ALTER TABLE "new_attendees" RENAME TO "attendees";
CREATE UNIQUE INDEX "attendees_email_key" ON "attendees"("email");
CREATE TABLE "new_meetings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calendarEventId" TEXT NOT NULL,
    "meetId" TEXT,
    "title" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "meetUrl" TEXT NOT NULL,
    "organizerEmail" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_meetings" ("calendarEventId", "createdAt", "endTime", "id", "meetUrl", "organizerEmail", "startTime", "title", "updatedAt") SELECT "calendarEventId", "createdAt", "endTime", "id", "meetUrl", "organizerEmail", "startTime", "title", "updatedAt" FROM "meetings";
DROP TABLE "meetings";
ALTER TABLE "new_meetings" RENAME TO "meetings";
CREATE UNIQUE INDEX "meetings_calendarEventId_key" ON "meetings"("calendarEventId");
CREATE UNIQUE INDEX "meetings_meetId_key" ON "meetings"("meetId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendance_meetingId_attendeeId_key" ON "meeting_attendance"("meetingId", "attendeeId");
