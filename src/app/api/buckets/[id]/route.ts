/**
 * GET   /api/buckets/[id] -- fetch bucket
 * PATCH /api/buckets/[id] -- update or archive bucket
 */

import { notFound, ok, readJson, serverError } from "@/lib/api";
import { updateBucketInput } from "@/lib/validation";
import { getBucket, updateBucket } from "@/server/holdings";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const bucket = await getBucket(id);
    if (!bucket) return notFound("Bucket not found.");
    return ok({ bucket });
  } catch (cause) {
    return serverError("load bucket", cause);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = await readJson(request, updateBucketInput);
  if (!parsed.ok) return parsed.response;

  try {
    const existing = await getBucket(id);
    if (!existing) return notFound("Bucket not found.");

    const bucket = await updateBucket(id, parsed.data);
    return ok({ bucket });
  } catch (cause) {
    return serverError("update bucket", cause);
  }
}
