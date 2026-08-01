ALTER TABLE "organisations"
ADD COLUMN "week_start_day" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "shifts"
ADD COLUMN "overtime_minutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "organisations"
ADD CONSTRAINT "organisations_week_start_day_range"
CHECK ("week_start_day" BETWEEN 1 AND 7);

ALTER TABLE "shifts"
ADD CONSTRAINT "shifts_overtime_minutes_nonnegative"
CHECK ("overtime_minutes" >= 0);
