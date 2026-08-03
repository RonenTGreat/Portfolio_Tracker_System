"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HoldingDTO, BucketDTO } from "@/server/holdings";
import { ASSET_CLASS_LABELS } from "@/lib/asset-classes";
import type { AssetClass } from "@/generated/prisma/enums";

export function HoldingsManager({
  initialHoldings,
  buckets,
}: {
  initialHoldings: HoldingDTO[];
  buckets: BucketDTO[];
}) {
  const [holdings, setHoldings] = useState<HoldingDTO[]>(initialHoldings);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [ticker, setTicker] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("ETF");
  const [bucketId, setBucketId] = useState(buckets[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddHolding(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          displayName,
          assetClass,
          bucketId,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create holding.");
      } else {
        setHoldings((prev) => [...prev, data.holding]);
        setTicker("");
        setDisplayName("");
        setNotes("");
        setShowAddForm(false);
      }
    } catch {
      setError("Network error creating holding.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(holdingId: string, currentActive: boolean) {
    try {
      const res = await fetch(`/api/holdings/${holdingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      const data = await res.json();
      if (res.ok) {
        setHoldings((prev) =>
          prev.map((h) => (h.id === holdingId ? { ...h, isActive: !currentActive } : h)),
        );
      }
    } catch {
      // silent
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <p className="type-body-sm text-ink-soft m-0">
          Track individual funds and tickers. Retiring a holding stops it from appearing in new entry forms while preserving history.
        </p>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? "Cancel" : "Add Holding"}
        </Button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddHolding} className="border border-rule bg-paper-raised p-6 space-y-4">
          <h3 className="type-display-md text-ink m-0 mb-2">New Holding</h3>
          {error && (
            <div role="alert" className="type-body-sm border-l-[3px] border-ledger-red bg-paper p-3 text-ledger-red">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ticker" className="type-body-sm block mb-1 font-medium text-ink">
                Ticker / Symbol
              </label>
              <Input
                id="ticker"
                required
                value={ticker}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTicker(e.target.value)}
                placeholder="e.g. VOO"
                className="w-full font-mono"
              />
            </div>
            <div>
              <label htmlFor="displayName" className="type-body-sm block mb-1 font-medium text-ink">
                Display Name
              </label>
              <Input
                id="displayName"
                required
                value={displayName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                placeholder="e.g. Vanguard S&P 500 ETF"
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="assetClass" className="type-body-sm block mb-1 font-medium text-ink">
                Asset Class
              </label>
              <select
                id="assetClass"
                value={assetClass}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAssetClass(e.target.value as AssetClass)}
                className="w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-slate"
              >
                <option value="ETF">ETF</option>
                <option value="MUTUAL_FUND">Mutual Fund</option>
                <option value="CRYPTO">Crypto</option>
                <option value="CASH_SAFETY">Cash & Safety</option>
              </select>
            </div>
            <div>
              <label htmlFor="bucketId" className="type-body-sm block mb-1 font-medium text-ink">
                Reporting Bucket
              </label>
              <select
                id="bucketId"
                value={bucketId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBucketId(e.target.value)}
                className="w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-slate"
              >
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="type-body-sm block mb-1 font-medium text-ink">
              Notes (optional)
            </label>
            <Input
              id="notes"
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}

              placeholder="e.g. Core broad market equity"
              className="w-full"
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Holding"}
          </Button>
        </form>
      )}

      {/* Holdings Table */}
      <div className="overflow-x-auto border border-rule bg-paper-raised">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-rule bg-paper text-ink-soft type-body-sm font-medium">
              <th className="px-4 py-3">Ticker</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Asset Class</th>
              <th className="px-4 py-3">Bucket</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule type-body-sm text-ink">
            {holdings
              .filter((h) => !h.isAggregate)
              .map((h) => (
                <tr key={h.id} className="hover:bg-paper">
                  <td className="px-4 py-3 font-mono font-medium">
                    <Link href={`/holdings/${h.ticker}`} className="text-ink underline hover:text-brass">
                      {h.ticker}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{h.displayName}</td>
                  <td className="px-4 py-3 text-ink-soft">{ASSET_CLASS_LABELS[h.assetClass]}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{h.bucketName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-mono ${
                        h.isActive
                          ? "text-ledger-green bg-paper"
                          : "text-ink-soft bg-paper line-through"
                      }`}
                    >
                      {h.isActive ? "Active" : "Retired"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/holdings/${h.ticker}`}
                        className="type-body-sm text-ink underline"
                      >
                        Trend
                      </Link>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => toggleActive(h.id, h.isActive)}
                      >
                        {h.isActive ? "Retire" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
