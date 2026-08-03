-- Constraints Prisma's schema language cannot express.
--
-- Run after `prisma migrate dev` / `prisma db push`:
--   psql "$DATABASE_URL" -f prisma/constraints.sql
--
-- All statements are idempotent, so re-running after a later migration is safe.
-- Keeping them here rather than hand-editing a generated migration means they
-- survive `migrate reset` and stay visible instead of buried in a timestamped
-- folder nobody reads again.

-- TargetAllocation: a target belongs to exactly one subject — a bucket or a
-- holding, never both and never neither. Without this, a row with both set (or
-- neither) is accepted by the database and silently double-counts, or vanishes,
-- in the FR-3 sum validation.
ALTER TABLE "TargetAllocation"
  DROP CONSTRAINT IF EXISTS "TargetAllocation_subject_exclusive";

ALTER TABLE "TargetAllocation"
  ADD CONSTRAINT "TargetAllocation_subject_exclusive"
  CHECK (("bucketId" IS NULL) <> ("holdingId" IS NULL));

-- Percentages are percentages. 0–100 inclusive; a negative or >100 target is
-- always a bug, not an edge case worth representing.
ALTER TABLE "TargetAllocation"
  DROP CONSTRAINT IF EXISTS "TargetAllocation_pct_range";

ALTER TABLE "TargetAllocation"
  ADD CONSTRAINT "TargetAllocation_pct_range"
  CHECK ("targetPct" >= 0 AND "targetPct" <= 100);

-- FR-1 validates "value must be a non-negative number" in the app layer. This
-- is the same rule at the storage layer, so no future code path can bypass it:
-- a holding can be worth nothing, never less than nothing.
ALTER TABLE "QuarterEntry"
  DROP CONSTRAINT IF EXISTS "QuarterEntry_value_non_negative";

ALTER TABLE "QuarterEntry"
  ADD CONSTRAINT "QuarterEntry_value_non_negative"
  CHECK ("valueGHS" >= 0);

-- A quarter is identified by its end date (src/lib/quarters.ts), so only the
-- last day of March / June / September / December is a valid Quarter row.
-- Catches an off-by-one date arriving from a form or an import before it
-- becomes a duplicate-looking quarter that no lookup can match.
ALTER TABLE "Quarter"
  DROP CONSTRAINT IF EXISTS "Quarter_is_quarter_end";

ALTER TABLE "Quarter"
  ADD CONSTRAINT "Quarter_is_quarter_end"
  CHECK (
    "quarterDate" = (
      date_trunc('quarter', "quarterDate"::timestamp) + interval '3 months - 1 day'
    )::date
  );
