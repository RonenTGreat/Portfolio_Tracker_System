"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Sign in failed. Check your details and try again.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md border border-rule bg-paper-raised p-8 shadow-none">
        <div className="mb-6 text-center">
          <h1 className="type-display-lg m-0 text-ink">Ledger</h1>
          <p className="type-body-sm mt-2 text-ink-soft">
            Quarterly portfolio ledger — sign in to open.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="type-body-sm mb-6 border-l-[3px] border-ledger-red bg-paper p-4 text-ledger-red"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="type-body-sm block mb-2 font-medium text-ink">
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="password" className="type-body-sm block mb-2 font-medium text-ink">
              Password
            </label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}

              placeholder="••••••••••••"
              className="w-full"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full justify-center">
            {loading ? "Signing in..." : "Sign in →"}
          </Button>
        </form>
      </div>
    </div>
  );
}
