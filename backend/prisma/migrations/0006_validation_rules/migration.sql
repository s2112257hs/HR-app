CREATE TABLE "validation_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "minimum_staff" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "validation_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "validation_rules"
  ADD CONSTRAINT "validation_rules_organisation_id_fkey"
  FOREIGN KEY ("organisation_id")
  REFERENCES "organisations"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "validation_rules"
  ADD CONSTRAINT "validation_rules_department_id_fkey"
  FOREIGN KEY ("department_id")
  REFERENCES "departments"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "validation_rules_organisation_id_name_key"
  ON "validation_rules"("organisation_id", "name");

CREATE INDEX "validation_rules_organisation_id_is_active_idx"
  ON "validation_rules"("organisation_id", "is_active");

CREATE INDEX "validation_rules_department_id_is_active_idx"
  ON "validation_rules"("department_id", "is_active");
