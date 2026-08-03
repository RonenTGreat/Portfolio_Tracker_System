/**
 * Sign Out endpoint — FR-8.
 * POST /api/auth/sign-out
 */

import { endSession } from "@/server/auth";
import { ok, serverError } from "@/lib/api";

export async function POST() {
  try {
    await endSession();
    return ok({ success: true });
  } catch (cause) {
    return serverError("sign out", cause);
  }
}
