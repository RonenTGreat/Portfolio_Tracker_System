/**
 * SRS §7:
 *   GET    /api/quarters/:date  -- one quarter's figures
 *   PATCH  /api/quarters/:date  -- edit a quarter's entries
 *   DELETE /api/quarters/:date  -- delete a quarter
 *
 * `:date` is the quarter END date as `YYYY-MM-DD` (src/lib/quarters.ts), which
 * is also the Quarter primary key — so the URL is the identity, not a lookup
 * key that could point at two rows.
 *
 * The date is validated before it reaches the database. Without that, a
 * malformed segment reaches `parseISODate` and produces an Invalid Date, which
 * Prisma rejects with an opaque adapter error rather than a 400.
 */

import { badRequest, noContent, notFound, ok, readJson, serverError } from "@/lib/api";
import { quarterDateString, updateQuarterInput } from "@/lib/validation";
import {
  deleteQuarter,
  findIneligibleHoldingIds,
  getQuarter,
  quarterExists,
  replaceQuarterEntries,
} from "@/server/quarters";

/**
 * Returns the validated ISO date, or the 400 to send back.
 *
 * A URL that isn't a quarter end is a bad request rather than a 404: the
 * resource can't exist at that address, so "not found" would imply that a
 * correctly-formed request might one day find something there.
 */
function readDateParam(
  raw: string,
): { ok: true; date: string } | { ok: false; response: Response } {
  const parsed = quarterDateString.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: badRequest(parsed.error.issues[0].message),
    };
  }
  return { ok: true, date: parsed.data };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ date: string }> },
) {
  const { date: raw } = await context.params;
  const param = readDateParam(raw);
  if (!param.ok) return param.response;

  try {
    const quarter = await getQuarter(param.date);
    if (!quarter) return notFound("That quarter hasn't been recorded yet.");
    return ok({ quarter });
  } catch (cause) {
    return serverError("load the quarter", cause);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ date: string }> },
) {
  const { date: raw } = await context.params;
  const param = readDateParam(raw);
  if (!param.ok) return param.response;

  const parsed = await readJson(request, updateQuarterInput);
  if (!parsed.ok) return parsed.response;

  try {
    if (!(await quarterExists(param.date))) {
      return notFound("That quarter hasn't been recorded yet.");
    }

    const ineligible = await findIneligibleHoldingIds(
      parsed.data.entries.map((e) => e.holdingId),
    );
    if (ineligible.length > 0) {
      return badRequest(
        "Some of those holdings can't be recorded against a quarter — reload the form and try again.",
      );
    }

    return ok({ quarter: await replaceQuarterEntries(param.date, parsed.data) });
  } catch (cause) {
    return serverError("save the quarter", cause);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ date: string }> },
) {
  const { date: raw } = await context.params;
  const param = readDateParam(raw);
  if (!param.ok) return param.response;

  try {
    // Entries go with it, by the schema's onDelete: Cascade — FR-1 allows
    // deleting a past quarter, and leaving its figures behind would put rows in
    // the table that no quarter can reach.
    const deleted = await deleteQuarter(param.date);
    if (!deleted) return notFound("That quarter hasn't been recorded yet.");
    return noContent();
  } catch (cause) {
    return serverError("delete the quarter", cause);
  }
}
