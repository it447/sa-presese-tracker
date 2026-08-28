-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "meetId" TEXT,
    "title" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "meetUrl" TEXT NOT NULL,
    "organizerEmail" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendees" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "isLeadership" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_exclusion_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "pattern" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_exclusion_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "joinTime" TIMESTAMP(3),
    "leaveTime" TIMESTAMP(3),
    "durationMin" INTEGER,
    "minutesLate" INTEGER,
    "wasLate" BOOLEAN NOT NULL DEFAULT false,
    "wasInvited" BOOLEAN NOT NULL DEFAULT true,
    "videoSendSeconds" INTEGER,
    "cameraOnRatio" DOUBLE PRECISION,
    "cameraOff" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "meeting_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meetings_calendarEventId_key" ON "meetings"("calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_meetId_key" ON "meetings"("meetId");

-- CreateIndex
CREATE UNIQUE INDEX "attendees_email_key" ON "attendees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendance_meetingId_attendeeId_key" ON "meeting_attendance"("meetingId", "attendeeId");

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
