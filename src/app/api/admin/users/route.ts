/**
 * Admin list users endpoint — FR-10.
 * GET /api/admin/users
 */

import { db } from "@/lib/db";
import { forbidden, ok, serverError, unauthorized } from "@/lib/api";
import { getAdminUser } from "@/server/auth";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return unauthorized("Sign in as an administrator to access user management.");
  }

  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        invitedById: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return ok({ users });
  } catch (cause) {
    return serverError("list users", cause);
  }
}
