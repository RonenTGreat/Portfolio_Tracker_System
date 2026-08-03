/**
 * Request validation — one schema per write, shared by the API route that
 * enforces it and the form that submits to it.
 *
 * Shared deliberately: FR-1's rules ("value must be a non-negative number;
 * date must not duplicate an existing quarter") have to hold at the API
 * boundary regardless of client, but re-stating them in the form as a separate
 * hand-written check is how the two drift apart and the UI starts accepting
 * something the server then rejects with a generic 400.
 *
 * Money is validated as a STRING here, never coerced to number — see
 * src/lib/money.ts. `z.number()` on a GHS figure would reintroduce the float
 * the NFR "all monetary values stored as decimal" exists to prevent.
 */

import { z } from "zod";
import { AssetClass, UserRole, UserStatus } from "@/generated/prisma/enums";
import { BUCKET_COLOR_TOKENS } from "@/lib/buckets";

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A GHS amount: digits, optional 1–2dp, non-negative (FR-1). Kept as a string
 * all the way to Prisma's Decimal column.
 *
 * Rejects `1e5`, `Infinity`, `-0.01`, and 3+ decimal places — the last of those
 * matters because Decimal(14,2) would silently round a third digit, turning a
 * typo into a plausible-looking figure.
 */
export const moneyString = z
  .string()
  .trim()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "Enter a GHS amount using digits, up to two decimal places.",
  );

/**
 * A quarter, identified by its END date (src/lib/quarters.ts), as `YYYY-MM-DD`.
 *
 * The refinement is the same rule as the Quarter_is_quarter_end CHECK
 * constraint in prisma/constraints.sql: only the last day of March, June,
 * September or December. Enforced here too so the user gets a sentence instead
 * of a Postgres constraint-violation error, and so an off-by-one date never
 * reaches the database as a quarter no lookup can match.
 */
export const quarterDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
  .refine((iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    if (![3, 6, 9, 12].includes(m)) return false;
    // Day 0 of the following month is the last day of this one — handles the
    // 30/31 split and leap years without a lookup table.
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d === lastDay;
  }, "A quarter is identified by its end date — the last day of March, June, September or December (e.g. 2026-06-30).");

/** Percent, 0–100 with up to 3dp, matching TargetAllocation's Decimal(6,3). */
export const percentString = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,3})?$/, "Enter a percentage between 0 and 100.")
  .refine((v) => Number(v) <= 100, "A target cannot exceed 100%.");

const cuid = z.string().min(1, "Required.");

/* -------------------------------------------------------------------------- */
/* Quarters (FR-1)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One holding's figure within a quarter submission.
 *
 * A blank field is represented by OMITTING the entry, not by sending "0" — a
 * holding not yet owned and a holding worth exactly nothing are different
 * facts, and conflating them would make the first quarter of every new holding
 * show a fabricated 0 in its FR-5 trend line.
 */
export const quarterEntryInput = z.object({
  holdingId: cuid,
  valueGHS: moneyString,
});

export const createQuarterInput = z.object({
  quarterDate: quarterDateString,
  entries: z
    .array(quarterEntryInput)
    .min(1, "Enter a value for at least one holding.")
    // A duplicated holdingId would hit the @@unique([quarterDate, holdingId])
    // constraint as a 500; caught here it is a sentence about the request.
    .refine(
      (entries) =>
        new Set(entries.map((e) => e.holdingId)).size === entries.length,
      "The same holding appears twice in this quarter.",
    ),
});

/**
 * Editing a quarter (PATCH). The entries array is authoritative: a holding
 * omitted from it has its entry for that quarter DELETED, which is what makes
 * "I entered this by mistake" fixable from the form. The quarter date itself is
 * the URL, not the body — moving a quarter to a different date is a delete plus
 * a create, not an edit, since every entry's identity depends on it.
 */
export const updateQuarterInput = z.object({
  entries: z
    .array(quarterEntryInput)
    .refine(
      (entries) =>
        new Set(entries.map((e) => e.holdingId)).size === entries.length,
      "The same holding appears twice in this quarter.",
    ),
});

/* -------------------------------------------------------------------------- */
/* Holdings (FR-2)                                                             */
/* -------------------------------------------------------------------------- */

export const createHoldingInput = z.object({
  ticker: z
    .string()
    .trim()
    .min(1, "Enter a ticker or short name.")
    .max(32, "Keep the ticker under 32 characters."),
  displayName: z
    .string()
    .trim()
    .min(1, "Enter the holding's full name.")
    .max(120, "Keep the name under 120 characters."),
  assetClass: z.enum(AssetClass),
  bucketId: cuid,
  notes: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

/**
 * FR-2: "Editing a holding's name/category does not alter historical values."
 * Every field is optional so a PATCH can carry just `isActive` (retiring a
 * holding) without restating the rest. `ticker` is intentionally editable —
 * fixing a typo must not require creating a new holding and orphaning history.
 */
export const updateHoldingInput = createHoldingInput
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine(
    (data) => Object.keys(data).length > 0,
    "Nothing to update.",
  );

/* -------------------------------------------------------------------------- */
/* Buckets                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `colorToken` is constrained to the §1.1 palette rather than accepting any CSS
 * colour: the bucket→colour mapping is "a functional requirement, not just a
 * style note" (design §1.1), and an arbitrary hex arriving here would break the
 * paired-pie comparability the FR-6/FR-7 views depend on.
 */
export const createBucketInput = z.object({
  name: z.string().trim().min(1, "Name the bucket.").max(48),
  colorToken: z.enum(BUCKET_COLOR_TOKENS),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const updateBucketInput = createBucketInput
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, "Nothing to update.");

/* -------------------------------------------------------------------------- */
/* Targets (FR-3)                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One target row. Exactly one of bucketId / holdingId is set — the same rule as
 * the TargetAllocation_subject_exclusive CHECK constraint, stated here so a
 * malformed request is a 400 with an explanation rather than a 500.
 */
export const targetInput = z
  .object({
    bucketId: cuid.optional().nullable(),
    holdingId: cuid.optional().nullable(),
    targetPct: percentString,
  })
  .refine(
    (t) => Boolean(t.bucketId) !== Boolean(t.holdingId),
    "A target belongs to either a bucket or a holding, never both.",
  );

export const createTargetsInput = z.object({
  effectiveFrom: quarterDateString,
  targets: z.array(targetInput).min(1, "Nothing to save."),
  note: z.string().trim().max(500).optional().nullable(),
});

/* -------------------------------------------------------------------------- */
/* Access — FR-8, FR-9, FR-10                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Stored and compared lowercase, always. An address that differs only in case
 * is the same mailbox, and letting `You@example.com` create a second account
 * alongside `you@example.com` would quietly defeat the unique constraint the
 * whole invite model rests on.
 */
export const emailString = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter an email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."));

/**
 * 12 characters minimum, matching the floor prisma/seed.ts enforces on the
 * bootstrap Admin — a password set through an invite should not be allowed to be
 * weaker than the one the seed refuses to create. Length is the only rule:
 * composition requirements ("one symbol, one digit") reliably produce shorter,
 * more predictable passwords, which is the opposite of the goal.
 */
export const passwordString = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(200, "Keep the password under 200 characters.");

/**
 * Sign-in (FR-8). The password is deliberately NOT validated for length here:
 * the form must not tell someone probing an account that their guess was too
 * short to be the real password, and a rejected-before-verification attempt
 * would also skip the failed-attempt accounting that the lockout depends on.
 */
export const signInInput = z.object({
  email: emailString,
  password: z.string().min(1, "Enter your password."),
});

/** FR-10: an Admin invites an email address at a chosen role. */
export const createInviteInput = z.object({
  email: emailString,
  role: z.enum(UserRole),
});

/** FR-9: completing an invite — name and password, at a token-gated page. */
export const acceptInviteInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(120, "Keep the name under 120 characters."),
  password: passwordString,
});

/**
 * FR-10: deactivate / reactivate. Only `status` is editable — role changes and
 * email changes are not in the SRS, and an endpoint that accepted them would be
 * a privilege-escalation path built ahead of any need for it.
 */
export const updateUserInput = z.object({
  status: z.enum(UserStatus),
});

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type SignInInput = z.infer<typeof signInInput>;
export type CreateInviteInput = z.infer<typeof createInviteInput>;
export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;
export type UpdateUserInput = z.infer<typeof updateUserInput>;
export type QuarterEntryInput = z.infer<typeof quarterEntryInput>;
export type CreateQuarterInput = z.infer<typeof createQuarterInput>;
export type UpdateQuarterInput = z.infer<typeof updateQuarterInput>;
export type CreateHoldingInput = z.infer<typeof createHoldingInput>;
export type UpdateHoldingInput = z.infer<typeof updateHoldingInput>;
export type CreateBucketInput = z.infer<typeof createBucketInput>;
export type UpdateBucketInput = z.infer<typeof updateBucketInput>;
export type CreateTargetsInput = z.infer<typeof createTargetsInput>;
