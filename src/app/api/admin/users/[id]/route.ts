/**
 * Admin update user status endpoint — FR-10.
 * PATCH /api/admin/users/[id]
 */

import { db } from "@/lib/db";
import { badRequest, notFound, ok, readJson, serverError, unauthorized } from "@/lib/api";
import { updateUserInput } from "@/lib/validation";
import { getAdminUser, revokeAllSessions } from "@/server/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = await getAdminUser();
  if (!admin) {
    return unauthorized("Sign in as an administrator to modify user status.");
  }

  const parsed = await readJson(request, updateUserInput);
  if (!parsed.ok) return parsed.response;

  const { status } = parsed.data;

  // FR-10: "Admin cannot deactivate their own account"
  if (admin.id === id && status === "DEACTIVATED") {
    return badRequest("You cannot deactivate your own admin account.");
  }

  try {
    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return notFound("User account not found.");
    }

    const updated = await db.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    // If deactivated, revoke all open sessions immediately (FR-8, FR-10)
    if (status === "DEACTIVATED") {
      await revokeAllSessions(id);
    }

    return ok({ user: updated });
  } catch (cause) {
    return serverError("update user status", cause);
  }
}
