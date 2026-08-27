-- CreateTable
CREATE TABLE "meeting_exclusion_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "pattern" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_exclusion_rules_pkey" PRIMARY KEY ("id")
);
