/**
 * Sign In endpoint — FR-8.
 * POST /api/auth/sign-in
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, ok, readJson, serverError, tooManyRequests } from "@/lib/api";
import { signInInput } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";
import {
  lockoutState,
  recordFailedSignIn,
  recordSuccessfulSignIn,
  startSession,
} from "@/server/auth";

export async function POST(request: Request) {
  const parsed = await readJson(request, signInInput);
  if (!parsed.ok) return parsed.response;

  const { email, password } = parsed.data;

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        lockedUntil: true,
      },
    });

    // Check time-based lockout
    if (user?.lockedUntil) {
      const lockout = lockoutState(user.lockedUntil);
      if (lockout.locked) {
        return tooManyRequests(
          `Too many failed attempts. Account locked for ${lockout.minutesRemaining} more ${
            lockout.minutesRemaining === 1 ? "minute" : "minutes"
          }.`,
        );
      }
    }

    // Verify password (uses timing-safe comparison internally even if user is null)
    const isValid = await verifyPassword(password, user?.passwordHash);

    if (!user || !isValid) {
      if (user) {
        await recordFailedSignIn(user.id);
      }
      return badRequest("Invalid email or password.");
    }

    if (user.status === "DEACTIVATED") {
      return badRequest(
        "Your account has been deactivated. Contact an administrator for assistance.",
      );
    }

    // Successful authentication: clear failure count and start session
    await recordSuccessfulSignIn(user.id);
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");

    await startSession(user.id, { ipAddress, userAgent });

    return ok({ success: true });
  } catch (cause) {
    return serverError("sign in", cause);
  }
}
