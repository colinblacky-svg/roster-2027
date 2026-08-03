-- CreateTable
CREATE TABLE "consultants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surname" TEXT NOT NULL,
    "firstName" TEXT,
    "specialty" TEXT NOT NULL,
    "callProportion" REAL NOT NULL,
    "employmentFraction" REAL NOT NULL,
    "weekAMon" BOOLEAN NOT NULL,
    "weekATue" BOOLEAN NOT NULL,
    "weekAWed" BOOLEAN NOT NULL,
    "weekAThu" BOOLEAN NOT NULL,
    "weekAFri" BOOLEAN NOT NULL,
    "weekBMon" BOOLEAN NOT NULL,
    "weekBTue" BOOLEAN NOT NULL,
    "weekBWed" BOOLEAN NOT NULL,
    "weekBThu" BOOLEAN NOT NULL,
    "weekBFri" BOOLEAN NOT NULL,
    "preferredDay" TEXT,
    "secondaryDays" TEXT NOT NULL DEFAULT '[]',
    "standingNotes" TEXT,
    "returnToWorkDate" DATETIME,
    "firstEligibleDate" DATETIME,
    "secondOnCallsCompletedSinceReturn" INTEGER NOT NULL DEFAULT 0,
    "rampComplete" BOOLEAN NOT NULL DEFAULT true,
    "excludeFromBankHoliday" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "bank_holiday_blocks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "friday" DATETIME NOT NULL,
    "saturday" DATETIME NOT NULL,
    "sunday" DATETIME NOT NULL,
    "monday" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "calendar_days" (
    "date" DATETIME NOT NULL PRIMARY KEY,
    "weekLabel" TEXT NOT NULL,
    "isPublicHoliday" BOOLEAN NOT NULL DEFAULT false,
    "holidayName" TEXT,
    "inGeneratorScope" BOOLEAN NOT NULL DEFAULT true,
    "bankHolidayBlockId" TEXT,
    CONSTRAINT "calendar_days_bankHolidayBlockId_fkey" FOREIGN KEY ("bankHolidayBlockId") REFERENCES "bank_holiday_blocks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "position" TEXT NOT NULL,
    "consultantId" TEXT,
    "weekendDutyId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "assignments_date_fkey" FOREIGN KEY ("date") REFERENCES "calendar_days" ("date") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assignments_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assignments_weekendDutyId_fkey" FOREIGN KEY ("weekendDutyId") REFERENCES "weekend_duties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "weekend_duties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "fraction" REAL NOT NULL,
    "cohortWeekLabel" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    CONSTRAINT "weekend_duties_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consultantId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "leaveType" TEXT NOT NULL,
    "bookingOrCancelling" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "daysCharged" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "decidedBy" TEXT,
    CONSTRAINT "leave_requests_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "leave_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consultantId" TEXT NOT NULL,
    "leaveRequestId" TEXT,
    "bucket" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_transactions_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "leave_transactions_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "command_log_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "sequenceInGroup" INTEGER NOT NULL,
    "commandType" TEXT NOT NULL,
    "forwardPayload" TEXT NOT NULL,
    "inversePayload" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actorId" TEXT,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" DATETIME,
    "rosterVersionAfter" INTEGER
);

-- CreateIndex
CREATE UNIQUE INDEX "consultants_surname_key" ON "consultants"("surname");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_date_position_key" ON "assignments"("date", "position");

-- CreateIndex
CREATE INDEX "command_log_entries_groupId_idx" ON "command_log_entries"("groupId");
