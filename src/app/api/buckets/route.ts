/**
 * GET /api/buckets — the bucket list behind every bucket picker and the
 * bucket→colour mapping the charts read (design §1.1).
 *
 * Not in the SRS §7 list, which models `bucket` as an enum. It is a table here
 * (see prisma/schema.prisma), so the set has to be fetchable rather than
 * hardcoded in each client.
 *
 * `?includeArchived=true` is for historical views, which must still be able to
 * name and colour a bucket that has since been retired.
 */

import { ok, serverError } from "@/lib/api";
import { listBuckets } from "@/server/holdings";

export async function GET(request: Request) {
  try {
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";
    return ok({ buckets: await listBuckets({ includeArchived }) });
  } catch (cause) {
    return serverError("load buckets", cause);
  }
}
