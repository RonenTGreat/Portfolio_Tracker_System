/**
 * Invite verification and acceptance endpoint — FR-9.
 * GET  /api/invite/[token] -- validate token
 * POST /api/invite/[token] -- complete account creation (name + password)
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, conflict, created, notFound, ok, readJson, serverError } from "@/lib/api";
import { acceptInviteInput } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { resolveInvite, startSession } from "@/server/auth";
import { initUserPortfolio } from "@/lib/portfolio-init";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const invite = await resolveInvite(token);
    if (!invite) {
      return notFound("This invite link is invalid, expired, or has already been used.");
    }
    return ok({ invite: { email: invite.email, role: invite.role } });
  } catch (cause) {
    return serverError("verify invite", cause);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const parsed = await readJson(request, acceptInviteInput);
  if (!parsed.ok) return parsed.response;

  try {
    const invite = await resolveInvite(token);
    if (!invite) {
      return notFound("This invite link is invalid, expired, or has already been used.");
    }

    // Ensure email doesn't already exist
    const existing = await db.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      return conflict("An account with this email address already exists.");
    }

    const passwordHash = await hashPassword(parsed.data.password);

    // Create user and mark invite accepted in a transaction
    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: invite.email,
          name: parsed.data.name,
          passwordHash,
          role: invite.role,
          status: "ACTIVE",
          invitedById: invite.createdById,
        },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return newUser;
    });

    await initUserPortfolio(user.id);

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");
    await startSession(user.id, { ipAddress, userAgent });

    return created({ success: true });
  } catch (cause) {
    return serverError("complete account setup", cause);
  }
}
