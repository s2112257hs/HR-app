CREATE TYPE "DayMarkerType" AS ENUM ('RDO', 'LEAVE');

CREATE TABLE "day_markers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "type" "DayMarkerType" NOT NULL,
  "notes" TEXT,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "day_markers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "day_markers"
  ADD CONSTRAINT "day_markers_organisation_id_fkey"
  FOREIGN KEY ("organisation_id")
  REFERENCES "organisations"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "day_markers"
  ADD CONSTRAINT "day_markers_employee_id_fkey"
  FOREIGN KEY ("employee_id")
  REFERENCES "employees"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "day_markers"
  ADD CONSTRAINT "day_markers_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "day_markers"
  ADD CONSTRAINT "day_markers_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "day_markers_organisation_id_employee_id_date_key"
  ON "day_markers"("organisation_id", "employee_id", "date");

CREATE INDEX "day_markers_organisation_id_date_idx"
  ON "day_markers"("organisation_id", "date");

CREATE INDEX "day_markers_employee_id_date_idx"
  ON "day_markers"("employee_id", "date");
