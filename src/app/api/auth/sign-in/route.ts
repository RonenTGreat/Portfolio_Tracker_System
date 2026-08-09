/**
 * Sign In endpoint — FR-8.
 * POST /api/auth/sign-in
 */

import { after } from "next/server";
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
  const t0 = performance.now();
  const parsed = await readJson(request, signInInput);
  if (!parsed.ok) return parsed.response;

  const { email, password } = parsed.data;

  try {
    const tDbStart = performance.now();
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        lockedUntil: true,
      },
    });
    const tDbDuration = performance.now() - tDbStart;

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
    const tPassStart = performance.now();
    const isValid = await verifyPassword(password, user?.passwordHash);
    const tPassDuration = performance.now() - tPassStart;

    if (!user || !isValid) {
      if (user) {
        after(() => {
          recordFailedSignIn(user.id).catch((err) =>
            console.error("[auth/sign-in] failed to record failed attempt", err),
          );
        });
      }
      return badRequest("Invalid email or password.");
    }

    if (user.status === "DEACTIVATED") {
      return badRequest(
        "Your account has been deactivated. Contact an administrator for assistance.",
      );
    }

    // Successful authentication: schedule audit update post-response
    after(() => {
      recordSuccessfulSignIn(user.id).catch((err) =>
        console.error("[auth/sign-in] failed to record login audit", err),
      );
    });

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");

    const tSessStart = performance.now();
    await startSession(user.id, { ipAddress, userAgent });
    const tSessDuration = performance.now() - tSessStart;

    if (process.env.NODE_ENV === "development") {
      const totalDuration = performance.now() - t0;
      console.info(
        `[auth/sign-in] timing: total=${totalDuration.toFixed(1)}ms (dbLookup=${tDbDuration.toFixed(
          1,
        )}ms, scrypt=${tPassDuration.toFixed(1)}ms, startSession=${tSessDuration.toFixed(1)}ms)`,
      );
    }

    return ok({ success: true });
  } catch (cause) {
    return serverError("sign in", cause);
  }
}
