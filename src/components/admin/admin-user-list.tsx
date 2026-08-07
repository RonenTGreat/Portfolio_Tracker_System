"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "DEACTIVATED";
  createdAt: string;
  lastLoginAt: string | null;
}

export function AdminUserList({
  currentAdminId,
  initialUsers,
}: {
  currentAdminId: string;
  initialUsers: UserItem[];
}) {
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"USER" | "ADMIN">("USER");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteUrl(null);
    setInviting(true);

    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || "Failed to create invite.");
      } else {
        setInviteUrl(data.invite.inviteUrl);
        setInviteEmail("");
      }
    } catch {
      setInviteError("Network error. Try again.");
    } finally {
      setInviting(false);
    }
  }

  async function toggleStatus(userId: string, currentStatus: "ACTIVE" | "DEACTIVATED") {
    setActionError(null);
    const newStatus = currentStatus === "ACTIVE" ? "DEACTIVATED" : "ACTIVE";

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to update status.");
      } else {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)),
        );
      }
    } catch {
      setActionError("Network error updating status.");
    }
  }

  function handleCopy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-8">
      {/* Invite Form */}
      <section className="border border-rule bg-paper-raised py-6 px-3 lg:p-6">
        <h2 className="type-display-md mb-2 text-ink">Invite New Account</h2>
        <p className="type-body-sm mb-4 text-ink-soft">
          Generates a single-use setup link valid for 7 days. Send the link to the user manually.
        </p>

        {inviteError && (
          <div role="alert" className="type-body-sm mb-4 border-l-[3px] border-ledger-red bg-paper p-3 text-ledger-red">
            {inviteError}
          </div>
        )}

        {inviteUrl && (
          <div className="mb-4 border border-brass bg-paper p-4">
            <p className="type-body-sm mb-2 font-medium text-ink font-mono">Invite Link Created:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="type-data-sm w-full border border-rule bg-paper-raised px-3 py-2 text-ink select-all"
              />
              <Button type="button" onClick={handleCopy} variant="secondary">
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleInviteSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="invite-email" className="type-body-sm block mb-1 font-medium text-ink">
              Email Address
            </label>
            <Input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full"
            />

          </div>

          <div className="w-32">
            <label htmlFor="invite-role" className="type-body-sm block mb-1 font-medium text-ink">
              Role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "USER" | "ADMIN")}
              className="w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-slate"
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          <Button type="submit" disabled={inviting}>
            {inviting ? "Generating..." : "Generate Invite Link"}
          </Button>
        </form>
      </section>

      {/* Users Table */}
      <section>
        <h2 className="type-display-md mb-4 text-ink">Accounts ({users.length})</h2>

        {actionError && (
          <div role="alert" className="type-body-sm mb-4 border-l-[3px] border-ledger-red bg-paper p-3 text-ledger-red">
            {actionError}
          </div>
        )}

        <div className="overflow-x-auto border border-rule bg-paper-raised">
          <table className="w-full min-w-[700px] text-left border-collapse">
            <thead>
              <tr className="border-b border-rule bg-paper text-ink-soft type-body-sm font-medium">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule type-body-sm text-ink">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-paper">
                  <td className="px-4 py-3 font-mono font-medium">{user.email}</td>
                  <td className="px-4 py-3">{user.name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 text-xs font-mono border border-rule bg-paper">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-mono ${
                        user.status === "ACTIVE"
                          ? "text-ledger-green bg-paper"
                          : "text-ledger-red bg-paper"
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-soft">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString("en-GH", {
                          dateStyle: "medium",
                        })
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.id === currentAdminId ? (
                      <span className="type-body-sm text-ink-soft italic">You</span>
                    ) : (
                      <Button
                        type="button"
                        variant={user.status === "ACTIVE" ? "destructive" : "secondary"}
                        onClick={() => toggleStatus(user.id, user.status)}
                      >
                        {user.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
