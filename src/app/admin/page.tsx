import { redirect } from "next/navigation";
import { getAdminUser } from "@/server/auth";
import { PageHeader } from "@/components/ui/page-header";
import { AdminUserList } from "@/components/admin/admin-user-list";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/sign-in");
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const formattedUsers = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));

  return (
    <>
      <PageHeader
        title="Admin Panel"
        subtitle="Manage accounts, invites, and access."
      />
      <AdminUserList currentAdminId={admin.id} initialUsers={formattedUsers} />
    </>
  );
}
