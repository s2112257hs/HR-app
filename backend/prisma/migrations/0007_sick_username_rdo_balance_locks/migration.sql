ALTER TYPE "DayMarkerType" ADD VALUE IF NOT EXISTS 'SICK';

ALTER TABLE "users"
  ADD COLUMN "username" VARCHAR(80);

ALTER TABLE "employees"
  ADD COLUMN "rdo_balance_brought_forward" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "users_organisation_id_username_key"
  ON "users" ("organisation_id", "username");

CREATE TABLE "roster_locks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL UNIQUE REFERENCES "organisations"("id") ON DELETE CASCADE,
  "locked_by_user_id" UUID NOT NULL REFERENCES "users"("id"),
  "token" VARCHAR(100) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "roster_locks_expires_at_idx" ON "roster_locks" ("expires_at");
