CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ROSTER_MANAGER', 'VIEWER');
CREATE TYPE "ShiftStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

CREATE TABLE "organisations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(150) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "name" VARCHAR(150) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "role" "UserRole" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "users_organisation_id_email_key" UNIQUE ("organisation_id", "email")
);

CREATE TABLE "employees" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "employee_number" VARCHAR(50),
  "first_name" VARCHAR(100) NOT NULL,
  "last_name" VARCHAR(100),
  "preferred_name" VARCHAR(100),
  "phone" VARCHAR(50),
  "email" VARCHAR(255),
  "employment_type" VARCHAR(50),
  "start_date" DATE,
  "end_date" DATE,
  "display_order" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "employees_organisation_id_employee_number_key" UNIQUE ("organisation_id", "employee_number")
);

CREATE TABLE "departments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "short_code" VARCHAR(10) NOT NULL,
  "colour_hex" CHAR(7) NOT NULL,
  "display_order" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "departments_organisation_id_name_key" UNIQUE ("organisation_id", "name"),
  CONSTRAINT "departments_organisation_id_short_code_key" UNIQUE ("organisation_id", "short_code")
);

CREATE TABLE "shifts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "employee_id" UUID NOT NULL REFERENCES "employees"("id"),
  "department_id" UUID NOT NULL REFERENCES "departments"("id"),
  "start_at" TIMESTAMPTZ NOT NULL,
  "end_at" TIMESTAMPTZ NOT NULL,
  "unpaid_break_minutes" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "status" "ShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
  "created_by_user_id" UUID NOT NULL REFERENCES "users"("id"),
  "updated_by_user_id" UUID NOT NULL REFERENCES "users"("id"),
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "shifts_end_after_start_check" CHECK ("end_at" > "start_at"),
  CONSTRAINT "shifts_unpaid_break_non_negative_check" CHECK ("unpaid_break_minutes" >= 0)
);

CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id"),
  "action" VARCHAR(50) NOT NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "entity_id" UUID NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "shifts_organisation_id_start_at_idx" ON "shifts" ("organisation_id", "start_at");
CREATE INDEX "shifts_employee_id_start_at_end_at_idx" ON "shifts" ("employee_id", "start_at", "end_at");
CREATE INDEX "shifts_department_id_start_at_end_at_idx" ON "shifts" ("department_id", "start_at", "end_at");
CREATE INDEX "employees_organisation_id_is_active_display_order_idx" ON "employees" ("organisation_id", "is_active", "display_order");
CREATE INDEX "departments_organisation_id_is_active_display_order_idx" ON "departments" ("organisation_id", "is_active", "display_order");
CREATE INDEX "audit_logs_organisation_id_entity_type_entity_id_idx" ON "audit_logs" ("organisation_id", "entity_type", "entity_id");
CREATE INDEX "audit_logs_organisation_id_created_at_idx" ON "audit_logs" ("organisation_id", "created_at");

