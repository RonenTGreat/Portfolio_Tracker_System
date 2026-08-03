/**
 * SRS §7:
 *   GET    /api/holdings  -- list all holdings
 *   POST   /api/holdings  -- create a holding
 *
 * `?scope=entry` narrows the list to what FR-1's form may offer (active,
 * non-aggregate). The default is every holding, because historical views must
 * be able to resolve a retired holding or a pre-migration aggregate that a past
 * quarter still references.
 */

import { badRequest, conflict, created, ok, readJson, serverError } from "@/lib/api";
import { createHoldingInput } from "@/lib/validation";
import {
  createHolding,
  findHoldingByTicker,
  listAllHoldings,
  listEntryHoldings,
} from "@/server/holdings";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    const holdings =
      scope === "entry" ? await listEntryHoldings() : await listAllHoldings();
    return ok({ holdings });
  } catch (cause) {
    return serverError("load holdings", cause);
  }
}

export async function POST(request: Request) {
  const parsed = await readJson(request, createHoldingInput);
  if (!parsed.ok) return parsed.response;

  try {
    // Checked before the insert so a duplicate ticker is a sentence naming the
    // conflict rather than a unique-constraint 500. The race between this and
    // the insert is still possible; the catch below is what actually closes it.
    const existing = await findHoldingByTicker(parsed.data.ticker);
    if (existing) {
      return conflict(
        `A holding with the ticker "${parsed.data.ticker}" already exists.`,
      );
    }

    const bucket = await db.bucket.findUnique({
      where: { id: parsed.data.bucketId },
      select: { id: true, archivedAt: true },
    });
    if (!bucket) return badRequest("That bucket doesn't exist.");
    if (bucket.archivedAt) {
      return badRequest(
        "That bucket has been archived — pick an active one for a new holding.",
      );
    }

    return created({ holding: await createHolding(parsed.data) });
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      return conflict(
        `A holding with the ticker "${parsed.data.ticker}" already exists.`,
      );
    }
    return serverError("create the holding", cause);
  }
}

/** Prisma's unique-constraint code, checked without importing the error class. */
function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "P2002"
  );
}
