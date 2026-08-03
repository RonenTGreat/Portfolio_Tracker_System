/**
 * SRS §7:
 *   GET   /api/quarters  -- list all quarters with entries
 *   POST  /api/quarters  -- create a new quarter's entries
 *
 * FR-1's two validation rules are both enforced here: "value must be a
 * non-negative number" (by the moneyString schema) and "date must not duplicate
 * an existing quarter" (by the existence check, backed by the primary key).
 */

import {
  badRequest,
  conflict,
  created,
  ok,
  readJson,
  serverError,
} from "@/lib/api";
import { createQuarterInput } from "@/lib/validation";
import {
  createQuarter,
  findIneligibleHoldingIds,
  listQuarters,
  quarterExists,
} from "@/server/quarters";
import { quarterLabel } from "@/lib/quarters";
import { parseISODate } from "@/lib/quarters";

export async function GET() {
  try {
    return ok({ quarters: await listQuarters() });
  } catch (cause) {
    return serverError("load quarters", cause);
  }
}

export async function POST(request: Request) {
  const parsed = await readJson(request, createQuarterInput);
  if (!parsed.ok) return parsed.response;

  const { quarterDate, entries } = parsed.data;

  try {
    // FR-1: "date must not duplicate an existing quarter". Named in the message
    // as the label the user recognises ("Q2 · 2026"), not the raw ISO date.
    if (await quarterExists(quarterDate)) {
      return conflict(
        `${quarterLabel(parseISODate(quarterDate))} is already recorded. Edit it instead of adding it again.`,
      );
    }

    const ineligible = await findIneligibleHoldingIds(
      entries.map((e) => e.holdingId),
    );
    if (ineligible.length > 0) {
      return badRequest(
        "Some of those holdings can't be recorded against a quarter — reload the form and try again.",
      );
    }

    return created({ quarter: await createQuarter(parsed.data) });
  } catch (cause) {
    // Primary-key collision, if a second request landed between the check above
    // and the insert. The check is the fast path; this is the correct one.
    if (isUniqueViolation(cause)) {
      return conflict(
        `${quarterLabel(parseISODate(quarterDate))} is already recorded.`,
      );
    }
    return serverError("save the quarter", cause);
  }
}

function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "P2002"
  );
}
