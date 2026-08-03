/**
 * Admin invite creation endpoint — FR-9, FR-10.
 * POST /api/admin/invite
 */

import { db } from "@/lib/db";
import { badRequest, conflict, created, ok, readJson, serverError, unauthorized } from "@/lib/api";
import { createInviteInput } from "@/lib/validation";
import { generateToken, getAdminUser, hashToken, INVITE_TTL_MS } from "@/server/auth";

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return unauthorized("Sign in as an administrator to send invitations.");
  }

  const parsed = await readJson(request, createInviteInput);
  if (!parsed.ok) return parsed.response;

  const { email, role } = parsed.data;

  try {
    // Check if account already exists
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return conflict("An account with that email address already exists.");
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await db.invite.create({
      data: {
        email,
        role,
        tokenHash,
        createdById: admin.id,
        expiresAt,
      },
    });

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const inviteUrl = `${protocol}://${host}/invite/${token}`;

    return created({
      invite: {
        email,
        role,
        expiresAt,
        inviteUrl,
      },
    });
  } catch (cause) {
    return serverError("create invitation", cause);
  }
}
