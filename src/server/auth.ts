/**
 * Sessions and access control — SRS §4.1, FR-8.
 *
 * Sessions are database rows, not self-contained signed cookies. §4.1 requires
 * that `status = DEACTIVATED` be checked "on every authenticated request, not
 * just at sign-in", and that deactivating a user "end their access immediately".
 * A JWT cannot do that: it stays valid until it expires because nothing can
 * reach back and revoke it. Rows make revocation a DELETE, and make the status
 * check a join the request already needs.
 *
 * The cookie carries a random token; the database stores only its SHA-256.
 * A leaked database snapshot should not hand over usable live sessions.
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "ledger_session";

/** 30 days. Long enough that a quarterly-use app doesn't ask on every visit. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Brute-force protection — FR-8, NFR                                          */
/* -------------------------------------------------------------------------- */

/** FR-8: "a short lockout after 5 failed attempts". */
export const MAX_FAILED_SIGN_INS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Token helpers                                                               */
/* -------------------------------------------------------------------------- */

/** 32 bytes of CSPRNG, base64url — the value that goes in the cookie or link. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256, hex. Not a password KDF, deliberately: these tokens are 256 bits of
 * randomness with no structure to guess, so stretching buys nothing and would
 * add a scrypt derivation to every authenticated request. Passwords are
 * different and go through src/lib/password.ts.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* The signed-in user                                                          */
/* -------------------------------------------------------------------------- */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
}

/**
 * Resolve the current session, or null.
 *
 * The status filter is inside the query rather than checked after it: an
 * ACTIVE-only lookup means a deactivated user's next request finds nothing and
 * is treated exactly like a signed-out one — §4.1's "immediately, not just at
 * next sign-in" — with no code path that could read the row and forget to look.
 *
 * Expiry is filtered here too rather than relying on a cleanup job, so a session
 * past its date is dead the moment it is next used even if nothing has swept it.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: {
      tokenHash: hashToken(token),
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE" },
    },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
        },
      },
    },
  });

  return session?.user ?? null;
}

/** True when a signed-in Admin is present. */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.role === "ADMIN" ? user : null;
}

/** Throw/redirect if no active session is present. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}

/* -------------------------------------------------------------------------- */
/* Creating and ending sessions                                                */
/* -------------------------------------------------------------------------- */

/**
 * Start a session and set the cookie.
 *
 * httpOnly so no script can read it (this is the whole defence against an XSS
 * turning into a stolen session), sameSite=lax so it survives a normal
 * navigation into the app but is not sent on cross-site form posts, secure in
 * production only — localhost is plain HTTP, and a `secure` cookie there is
 * silently dropped, which presents as "sign-in succeeds but nothing happens".
 */
export async function startSession(
  userId: string,
  context?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** End the current session — deletes the row, then clears the cookie. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    // deleteMany, not delete: signing out twice, or with a stale cookie, is not
    // an error worth throwing over.
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  jar.delete(SESSION_COOKIE);
}

/**
 * Revoke every session belonging to a user.
 *
 * Called on deactivation (FR-10). getSessionUser's ACTIVE filter already denies
 * a deactivated user, so this is defence in depth rather than the primary
 * mechanism — but it also means reactivating someone doesn't silently restore
 * sessions they had open months ago, which the status filter alone would.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Delete expired sessions. Called opportunistically from sign-in rather than
 * scheduled: the table only grows on sign-in, so that is exactly when it is
 * worth trimming, and it avoids adding a cron dependency to the deployment.
 */
export async function pruneExpiredSessions(): Promise<void> {
  await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

/* -------------------------------------------------------------------------- */
/* Sign-in attempt accounting                                                  */
/* -------------------------------------------------------------------------- */

export interface LockoutState {
  locked: boolean;
  /** Whole minutes remaining, for the message shown to the user. */
  minutesRemaining: number;
}

export function lockoutState(lockedUntil: Date | null): LockoutState {
  if (!lockedUntil || lockedUntil <= new Date()) {
    return { locked: false, minutesRemaining: 0 };
  }
  const ms = lockedUntil.getTime() - Date.now();
  return { locked: true, minutesRemaining: Math.max(1, Math.ceil(ms / 60000)) };
}

/**
 * Record a failed attempt, locking the account once the threshold is crossed.
 *
 * The lockout is time-based and self-clearing rather than requiring an Admin to
 * lift it: with an invite-only app whose Admin may be its only account, a
 * lockout only an Admin can undo is a way to lock the Admin out permanently.
 */
export async function recordFailedSignIn(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { failedSignIns: true },
  });
  if (!user) return;

  const failed = user.failedSignIns + 1;
  await db.user.update({
    where: { id: userId },
    data: {
      failedSignIns: failed,
      lockedUntil:
        failed >= MAX_FAILED_SIGN_INS
          ? new Date(Date.now() + LOCKOUT_MS)
          : null,
    },
  });
}

/** A successful sign-in clears the counter and stamps FR-10's last-login. */
export async function recordSuccessfulSignIn(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { failedSignIns: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}

/* -------------------------------------------------------------------------- */
/* Invite tokens (FR-9)                                                        */
/* -------------------------------------------------------------------------- */

/** 7 days, as FR-9 specifies. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ValidInvite {
  id: string;
  email: string;
  role: UserRole;
  /** The User who created this invite — used as invitedById on the new User. */
  createdById: string;
}

/**
 * Resolve an invite token to the invite it opens, or null.
 *
 * Every reason to refuse — no such token, expired, already accepted — returns
 * the same null. The setup page turns that into one message (FR-9: "an expired
 * or already-used invite link shows a clear error"), and distinguishing the
 * cases would tell someone probing tokens which of their guesses had once been
 * real.
 */
export async function resolveInvite(
  token: string,
): Promise<ValidInvite | null> {
  if (!token) return null;

  const invite = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      createdById: true,
    },
  });

  if (!invite) return null;
  if (invite.acceptedAt) return null;
  if (invite.expiresAt <= new Date()) return null;

  return { id: invite.id, email: invite.email, role: invite.role, createdById: invite.createdById };
}

/**
 * Compare two tokens without leaking length or position through timing.
 * Used where an equality check on a secret would otherwise be a plain `===`.
 */
export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
