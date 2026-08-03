/**
 * SRS §7: PATCH /api/holdings/:id -- update / deactivate a holding (FR-2).
 *
 * There is no DELETE. FR-2 is explicit that retiring a holding "stops it
 * appearing in new data-entry forms, but historical data is preserved", so the
 * operation is `isActive: false`, not a row removal. Deleting would either
 * orphan every QuarterEntry pointing at it or cascade them away, and both
 * silently change past totals.
 */

import { badRequest, conflict, notFound, ok, readJson, serverError } from "@/lib/api";
import { updateHoldingInput } from "@/lib/validation";
import {
  countHoldingEntries,
  findHoldingByTicker,
  getHolding,
  updateHolding,
} from "@/server/holdings";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const holding = await getHolding(id);
    if (!holding) return notFound("That holding doesn't exist.");
    return ok({ holding, entryCount: await countHoldingEntries(id) });
  } catch (cause) {
    return serverError("load the holding", cause);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const parsed = await readJson(request, updateHoldingInput);
  if (!parsed.ok) return parsed.response;

  try {
    const existing = await getHolding(id);
    if (!existing) return notFound("That holding doesn't exist.");

    // An aggregate holding exists only to carry imported pre-migration history
    // (SRS §8). Renaming or re-bucketing one would silently relabel figures the
    // user cannot otherwise reach, so it stays read-only.
    if (existing.isAggregate) {
      return badRequest(
        "That row holds imported pre-migration totals and can't be edited.",
      );
    }

    if (parsed.data.ticker && parsed.data.ticker !== existing.ticker) {
      const clash = await findHoldingByTicker(parsed.data.ticker);
      if (clash && clash.id !== id) {
        return conflict(
          `A holding with the ticker "${parsed.data.ticker}" already exists.`,
        );
      }
    }

    if (parsed.data.bucketId && parsed.data.bucketId !== existing.bucketId) {
      const bucket = await db.bucket.findUnique({
        where: { id: parsed.data.bucketId },
        select: { id: true, archivedAt: true },
      });
      if (!bucket) return badRequest("That bucket doesn't exist.");
      if (bucket.archivedAt) {
        return badRequest(
          "That bucket has been archived — pick an active one instead.",
        );
      }
    }

    return ok({ holding: await updateHolding(id, parsed.data) });
  } catch (cause) {
    return serverError("update the holding", cause);
  }
}
