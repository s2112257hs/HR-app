ALTER TABLE "employees" ADD COLUMN "primary_department_id" UUID;

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_primary_department_id_fkey"
  FOREIGN KEY ("primary_department_id")
  REFERENCES "departments"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "employees_organisation_id_primary_department_id_display_order_idx"
  ON "employees"("organisation_id", "primary_department_id", "display_order");
