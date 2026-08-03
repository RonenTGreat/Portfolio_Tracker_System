"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/states";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<{ email: string; role: string } | null>(null);
  const [invalidError, setInvalidError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`/api/invite/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setInvalidError(data.error || "Invalid invite link.");
        } else {
          setInvite(data.invite);
        }
      } catch {
        setInvalidError("Couldn't verify invite link. Check your network connection.");
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Setup failed. Try again.");
        setSubmitting(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setSubmitError("Couldn't submit form. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center">
        <p className="type-body text-ink-soft">Verifying invitation link...</p>
      </div>
    );
  }

  if (invalidError || !invite) {
    return (
      <div className="mx-auto max-w-lg py-12 px-4">
        <ErrorState message={invalidError || "This invite link is invalid or expired."} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md border border-rule bg-paper-raised p-8">
        <div className="mb-6 text-center">
          <h1 className="type-display-lg m-0 text-ink">Account Setup</h1>
          <p className="type-body-sm mt-2 text-ink-soft">
            Set up your account for <strong className="text-ink">{invite.email}</strong>.
          </p>
        </div>

        {submitError && (
          <div
            role="alert"
            className="type-body-sm mb-6 border-l-[3px] border-ledger-red bg-paper p-4 text-ledger-red"
          >
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="type-body-sm block mb-2 font-medium text-ink">
              Your Full Name
            </label>
            <Input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="password" className="type-body-sm block mb-2 font-medium text-ink">
              Password (at least 12 characters)
            </label>
            <Input
              id="password"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}

              placeholder="••••••••••••"
              className="w-full"
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full justify-center">
            {submitting ? "Completing setup..." : "Complete Setup & Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
