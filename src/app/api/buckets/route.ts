/**
 * GET  /api/buckets — list reporting buckets
 * POST /api/buckets — create a new reporting bucket
 */

import { conflict, created, ok, readJson, serverError } from "@/lib/api";
import { createBucketInput } from "@/lib/validation";
import { createBucket, findBucketByName, listBuckets } from "@/server/holdings";

export async function GET(request: Request) {
  try {
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";
    return ok({ buckets: await listBuckets({ includeArchived }) });
  } catch (cause) {
    return serverError("load buckets", cause);
  }
}

export async function POST(request: Request) {
  const parsed = await readJson(request, createBucketInput);
  if (!parsed.ok) return parsed.response;

  try {
    const existing = await findBucketByName(parsed.data.name);
    if (existing) {
      return conflict(`A bucket named "${parsed.data.name}" already exists.`);
    }

    const bucket = await createBucket(parsed.data);
    return created({ bucket });
  } catch (cause) {
    return serverError("create the bucket", cause);
  }
}
