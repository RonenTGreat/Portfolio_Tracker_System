/**
 * Session status endpoint — FR-8.
 * GET /api/auth/session
 */

import { getSessionUser } from "@/server/auth";
import { ok, serverError } from "@/lib/api";

export async function GET() {
  try {
    const user = await getSessionUser();
    return ok({ user });
  } catch (cause) {
    return serverError("check session", cause);
  }
}
