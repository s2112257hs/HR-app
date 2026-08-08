-- AlterTable organisations: Add code column
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "code" VARCHAR(4);

-- Update existing organisations with sequential 4-digit codes '0001', '0002', etc.
WITH numbered AS (
  SELECT id, LPAD(ROW_NUMBER() OVER (ORDER BY created_at, id)::text, 4, '0') AS num_code
  FROM "organisations"
)
UPDATE "organisations" o
SET "code" = n.num_code
FROM numbered n
WHERE o.id = n.id AND (o.code IS NULL OR o.code = '');

-- Set default for new rows if not set
UPDATE "organisations" SET "code" = '0001' WHERE "code" IS NULL;

-- Make code NOT NULL and UNIQUE
ALTER TABLE "organisations" ALTER COLUMN "code" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'organisations_code_key') THEN
        CREATE UNIQUE INDEX "organisations_code_key" ON "organisations"("code");
    END IF;
END $$;

-- AlterTable users: Add is_super_admin
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable user_memberships
CREATE TABLE IF NOT EXISTS "user_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'user_memberships_user_id_organisation_id_key') THEN
        CREATE UNIQUE INDEX "user_memberships_user_id_organisation_id_key" ON "user_memberships"("user_id", "organisation_id");
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_memberships_user_id_fkey') THEN
        ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_memberships_organisation_id_fkey') THEN
        ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Backfill existing users into user_memberships
INSERT INTO "user_memberships" ("id", "user_id", "organisation_id", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "organisation_id", "role", "is_active", "created_at", "updated_at"
FROM "users"
ON CONFLICT ("user_id", "organisation_id") DO NOTHING;
