UPDATE "shifts" AS "shift"
SET
  "status" = 'CANCELLED',
  "deleted_at" = COALESCE("shift"."deleted_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP,
  "version" = "shift"."version" + 1
FROM "day_markers" AS "marker"
JOIN "organisations" AS "organisation"
  ON "organisation"."id" = "marker"."organisation_id"
WHERE "shift"."organisation_id" = "marker"."organisation_id"
  AND "shift"."employee_id" = "marker"."employee_id"
  AND "shift"."status" = 'SCHEDULED'
  AND "shift"."deleted_at" IS NULL
  AND "shift"."start_at" < ((("marker"."date" + INTERVAL '1 day')::timestamp) AT TIME ZONE "organisation"."timezone")
  AND "shift"."end_at" > (("marker"."date"::timestamp) AT TIME ZONE "organisation"."timezone");
