/**
 * SRS §7:
 *   GET /api/compare/quarters?from=:date&to=:date
 *     -- per-holding and per-bucket delta between two quarters (defaults to
 *        latest vs. previous if no params given); response includes each
 *        quarter's full bucket breakdown (not just deltas), so the frontend can
 *        render a pie chart per quarter alongside the delta table.
 *
 * The defaulting lives here rather than in the client because FR-6's "default
 * comparison is latest quarter vs. previous quarter (one click, no need to pick
 * dates)" has to hold for any caller — the page server-renders its first
 * comparison through the same query layer, and a client-side default would leave
 * a direct GET to this route answering a different question.
 *
 * `from` is the earlier side and `to` the later one. Deltas read as "to minus
 * from", so passing them the other way round flips every sign — which is a valid
 * thing to ask for, and why neither is reordered here.
 */

import { badRequest, notFound, ok, serverError } from "@/lib/api";
import { quarterDateString } from "@/lib/validation";
import { getComparison, listQuarterOptions } from "@/server/compare";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const fromParam = params.get("from");
  const toParam = params.get("to");

  try {
    const options = await listQuarterOptions();

    // Fewer than two quarters is not an error: the ledger is simply too young
    // to compare. The caller gets the options it asked about and an explicit
    // null, so it can say so rather than rendering a comparison against zero.
    if (options.length < 2) {
      return ok({ options, comparison: null });
    }

    let from = fromParam;
    let to = toParam;

    if (from === null && to === null) {
      // Options are newest-first: [1] is the previous quarter, [0] the latest.
      from = options[1].quarterDate;
      to = options[0].quarterDate;
    } else if (from === null || to === null) {
      return badRequest(
        "Pass both from and to, or neither to compare the latest two quarters.",
      );
    }

    for (const [name, value] of [
      ["from", from],
      ["to", to],
    ] as const) {
      const parsed = quarterDateString.safeParse(value);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0].message, {
          [name]: parsed.error.issues[0].message,
        });
      }
    }

    const comparison = await getComparison(from, to);
    if (!comparison) {
      // Which date is missing matters: "there's nothing recorded for Q3 2025" is
      // actionable, "not found" is not.
      const missing = [from, to].filter(
        (date) => !options.some((option) => option.quarterDate === date),
      );
      return notFound(
        missing.length === 2
          ? `Neither ${missing[0]} nor ${missing[1]} has any figures recorded.`
          : `Nothing is recorded for ${missing[0] ?? "that quarter"} yet.`,
      );
    }

    return ok({ options, comparison });
  } catch (cause) {
    return serverError("load the comparison", cause);
  }
}
