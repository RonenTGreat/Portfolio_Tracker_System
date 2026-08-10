"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HoldingDTO, BucketDTO } from "@/server/holdings";
import { ASSET_CLASS_LABELS } from "@/lib/asset-classes";
import type { AssetClass } from "@/generated/prisma/enums";
import {
  BUCKET_COLOR_TOKENS,
  BUCKET_COLOR_LABELS,
  type BucketColorToken,
  bucketColor,
} from "@/lib/buckets";

export function HoldingsManager({
  initialHoldings,
  buckets: initialBuckets,
}: {
  initialHoldings: HoldingDTO[];
  buckets: BucketDTO[];
}) {
  const [holdings, setHoldings] = useState<HoldingDTO[]>(initialHoldings);
  const [buckets, setBuckets] = useState<BucketDTO[]>(initialBuckets);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddBucketForm, setShowAddBucketForm] = useState(false);

  // Holding Form state
  const [ticker, setTicker] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("ETF");
  const [bucketId, setBucketId] = useState(buckets[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bucket Form state
  const [bucketName, setBucketName] = useState("");
  const [colorToken, setColorToken] = useState<BucketColorToken>("--color-ink");
  const [bucketError, setBucketError] = useState<string | null>(null);
  const [bucketSubmitting, setBucketSubmitting] = useState(false);

  // Edit Bucket Form state
  const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
  const [editBucketName, setEditBucketName] = useState("");
  const [editColorToken, setEditColorToken] = useState<BucketColorToken>("--color-ink");
  const [editBucketError, setEditBucketError] = useState<string | null>(null);
  const [editBucketSubmitting, setEditBucketSubmitting] = useState(false);

  // Edit Holding Form state
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const [editTicker, setEditTicker] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editAssetClass, setEditAssetClass] = useState<AssetClass>("ETF");
  const [editHoldingBucketId, setEditHoldingBucketId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editHoldingError, setEditHoldingError] = useState<string | null>(null);
  const [editHoldingSubmitting, setEditHoldingSubmitting] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showAddForm || showAddBucketForm || editingBucketId || editingHoldingId) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showAddForm, showAddBucketForm, editingBucketId, editingHoldingId]);

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
          bucketId: bucketId || buckets[0]?.id,
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

  async function handleAddBucket(e: React.FormEvent) {
    e.preventDefault();
    setBucketError(null);
    setBucketSubmitting(true);

    try {
      const res = await fetch("/api/buckets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: bucketName,
          colorToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBucketError(data.error || "Failed to create bucket.");
      } else {
        setBuckets((prev) => [...prev, data.bucket]);
        if (!bucketId) {
          setBucketId(data.bucket.id);
        }
        setBucketName("");
        setShowAddBucketForm(false);
      }
    } catch {
      setBucketError("Network error creating bucket.");
    } finally {
      setBucketSubmitting(false);
    }
  }

  function startEditingBucket(b: BucketDTO) {
    setShowAddForm(false);
    setShowAddBucketForm(false);
    setEditingHoldingId(null);
    setEditingBucketId(b.id);
    setEditBucketName(b.name);
    setEditColorToken(b.colorToken as BucketColorToken);
    setEditBucketError(null);
  }

  async function handleEditBucket(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBucketId) return;
    setEditBucketError(null);
    setEditBucketSubmitting(true);

    try {
      const res = await fetch(`/api/buckets/${editingBucketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editBucketName,
          colorToken: editColorToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditBucketError(data.error || "Failed to update bucket.");
      } else {
        const updatedBucket: BucketDTO = data.bucket;
        setBuckets((prev) =>
          prev.map((b) => (b.id === updatedBucket.id ? updatedBucket : b)),
        );
        setHoldings((prev) =>
          prev.map((h) =>
            h.bucketId === updatedBucket.id
              ? {
                  ...h,
                  bucketName: updatedBucket.name,
                  bucketColorToken: updatedBucket.colorToken,
                }
              : h,
          ),
        );
        setEditingBucketId(null);
      }
    } catch {
      setEditBucketError("Network error updating bucket.");
    } finally {
      setEditBucketSubmitting(false);
    }
  }

  function startEditingHolding(h: HoldingDTO) {
    setShowAddForm(false);
    setShowAddBucketForm(false);
    setEditingBucketId(null);
    setEditingHoldingId(h.id);
    setEditTicker(h.ticker);
    setEditDisplayName(h.displayName);
    setEditAssetClass(h.assetClass);
    setEditHoldingBucketId(h.bucketId);
    setEditNotes(h.notes || "");
    setEditHoldingError(null);
  }

  async function handleEditHolding(e: React.FormEvent) {
    e.preventDefault();
    if (!editingHoldingId) return;
    setEditHoldingError(null);
    setEditHoldingSubmitting(true);

    try {
      const res = await fetch(`/api/holdings/${editingHoldingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: editTicker,
          displayName: editDisplayName,
          assetClass: editAssetClass,
          bucketId: editHoldingBucketId,
          notes: editNotes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditHoldingError(data.error || "Failed to update holding.");
      } else {
        const updatedHolding: HoldingDTO = data.holding;
        setHoldings((prev) =>
          prev.map((h) => (h.id === updatedHolding.id ? updatedHolding : h)),
        );
        setEditingHoldingId(null);
      }
    } catch {
      setEditHoldingError("Network error updating holding.");
    } finally {
      setEditHoldingSubmitting(false);
    }
  }

  async function toggleArchiveBucket(bucketId: string, currentArchived: boolean) {
    try {
      const res = await fetch(`/api/buckets/${bucketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !currentArchived }),
      });

      if (res.ok) {
        setBuckets((prev) =>
          prev.map((b) =>
            b.id === bucketId ? { ...b, archived: !currentArchived } : b,
          ),
        );
      }
    } catch {
      // silent
    }
  }

  async function toggleActive(holdingId: string, currentActive: boolean) {
    try {
      const res = await fetch(`/api/holdings/${holdingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      if (res.ok) {
        setHoldings((prev) =>
          prev.map((h) => (h.id === holdingId ? { ...h, isActive: !currentActive } : h)),
        );
      }
    } catch {
      // silent
    }
  }

  const activeBuckets = buckets.filter((b) => !b.archived);

  return (
    <div className="space-y-8">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="type-body-sm text-ink-soft m-0 max-w-[60ch]">
          Track individual funds and tickers. Retiring a holding or archiving a bucket stops it from appearing in new entry forms while preserving history.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="secondary"
            onClick={() => {
              setShowAddForm(false);
              setEditingBucketId(null);
              setEditingHoldingId(null);
              setShowAddBucketForm(!showAddBucketForm);
            }}
          >
            {showAddBucketForm ? "Cancel" : "Add Bucket"}
          </Button>
          <Button
            onClick={() => {
              setShowAddBucketForm(false);
              setEditingBucketId(null);
              setEditingHoldingId(null);
              setShowAddForm(!showAddForm);
            }}
          >
            {showAddForm ? "Cancel" : "Add Holding"}
          </Button>
        </div>
      </div>

      {/* Reporting Buckets Overview */}
      <div className="border border-rule bg-paper-raised p-4">
        <div className="flex items-center justify-between mb-3 gap-2.5">
          <div className="type-body-sm font-medium text-ink">Reporting Buckets</div>
          <span className="type-body-sm text-ink-soft">
            Archiving a bucket removes it from new holding creation while preserving historical data.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {buckets.map((b) => (
            <div
              key={b.id}
              className={`inline-flex items-center gap-2 border border-rule px-3 py-1.5 type-body-sm rounded-soft transition-opacity ${
                b.archived ? "bg-paper-raised text-ink-soft opacity-50" : "bg-paper text-ink"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: bucketColor(b) }}
              />
              <span>{b.name}</span>
              <button
                type="button"
                onClick={() => startEditingBucket(b)}
                className="ml-1 inline-flex items-center justify-center text-ink-soft hover:text-ink transition-colors cursor-pointer p-0.5"
                title="Edit bucket name"
                aria-label={`Edit ${b.name} bucket`}
              >
                <EditIcon />
              </button>
              <button
                type="button"
                onClick={() => toggleArchiveBucket(b.id, b.archived)}
                className="inline-flex items-center justify-center text-ink-soft hover:text-ink transition-colors cursor-pointer p-0.5"
                title={b.archived ? "Restore bucket" : "Archive bucket"}
                aria-label={b.archived ? `Restore ${b.name} bucket` : `Archive ${b.name} bucket`}
              >
                {b.archived ? <UnarchiveIcon /> : <ArchiveIcon />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Form Container with Scroll Target */}
      <div ref={formRef} className="scroll-mt-6">
        {/* Edit Bucket Form */}
        {editingBucketId && (
          <form onSubmit={handleEditBucket} className="border border-rule bg-paper-raised p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="type-display-md text-ink m-0">Edit Reporting Bucket</h3>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingBucketId(null)}
              >
                Cancel
              </Button>
            </div>
            {editBucketError && (
              <div role="alert" className="type-body-sm border-l-[3px] border-ledger-red bg-paper p-3 text-ledger-red">
                {editBucketError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="editBucketName" className="type-body-sm block mb-1 font-medium text-ink">
                  Bucket Name
                </label>
                <Input
                  id="editBucketName"
                  required
                  value={editBucketName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditBucketName(e.target.value)}
                  placeholder="e.g. Real Estate"
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="editColorToken" className="type-body-sm block mb-1 font-medium text-ink">
                  Color Theme
                </label>
                <select
                  id="editColorToken"
                  value={editColorToken}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setEditColorToken(e.target.value as BucketColorToken)
                  }
                  className="w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-slate"
                >
                  {BUCKET_COLOR_TOKENS.map((token) => (
                    <option key={token} value={token}>
                      {BUCKET_COLOR_LABELS[token]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={editBucketSubmitting}>
                {editBucketSubmitting ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingBucketId(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Edit Holding Form */}
        {editingHoldingId && (
          <form onSubmit={handleEditHolding} className="border border-rule bg-paper-raised p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="type-display-md text-ink m-0">Edit Holding</h3>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingHoldingId(null)}
              >
                Cancel
              </Button>
            </div>
            {editHoldingError && (
              <div role="alert" className="type-body-sm border-l-[3px] border-ledger-red bg-paper p-3 text-ledger-red">
                {editHoldingError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="editTicker" className="type-body-sm block mb-1 font-medium text-ink">
                  Ticker / Symbol
                </label>
                <Input
                  id="editTicker"
                  required
                  value={editTicker}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTicker(e.target.value)}
                  placeholder="e.g. VOO"
                  className="w-full font-mono"
                />
              </div>
              <div>
                <label htmlFor="editDisplayName" className="type-body-sm block mb-1 font-medium text-ink">
                  Display Name
                </label>
                <Input
                  id="editDisplayName"
                  required
                  value={editDisplayName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditDisplayName(e.target.value)}
                  placeholder="e.g. Vanguard S&P 500 ETF"
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="editAssetClass" className="type-body-sm block mb-1 font-medium text-ink">
                  Asset Class
                </label>
                <select
                  id="editAssetClass"
                  value={editAssetClass}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditAssetClass(e.target.value as AssetClass)}
                  className="w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-slate"
                >
                  <option value="ETF">ETF</option>
                  <option value="MUTUAL_FUND">Mutual Fund</option>
                  <option value="CRYPTO">Crypto</option>
                  <option value="CASH_SAFETY">Cash & Safety</option>
                </select>
              </div>
              <div>
                <label htmlFor="editHoldingBucketId" className="type-body-sm block mb-1 font-medium text-ink">
                  Reporting Bucket
                </label>
                <select
                  id="editHoldingBucketId"
                  value={editHoldingBucketId || activeBuckets[0]?.id}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditHoldingBucketId(e.target.value)}
                  className="w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-slate"
                >
                  {activeBuckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="editNotes" className="type-body-sm block mb-1 font-medium text-ink">
                Notes (optional)
              </label>
              <Input
                id="editNotes"
                value={editNotes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditNotes(e.target.value)}
                placeholder="e.g. Core broad market equity"
                className="w-full"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={editHoldingSubmitting}>
                {editHoldingSubmitting ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingHoldingId(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Add Bucket Form */}
        {showAddBucketForm && (
          <form onSubmit={handleAddBucket} className="border border-rule bg-paper-raised p-6 space-y-4">
            <h3 className="type-display-md text-ink m-0 mb-2">New Reporting Bucket</h3>
            {bucketError && (
              <div role="alert" className="type-body-sm border-l-[3px] border-ledger-red bg-paper p-3 text-ledger-red">
                {bucketError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bucketName" className="type-body-sm block mb-1 font-medium text-ink">
                  Bucket Name
                </label>
                <Input
                  id="bucketName"
                  required
                  value={bucketName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBucketName(e.target.value)}
                  placeholder="e.g. Real Estate"
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="colorToken" className="type-body-sm block mb-1 font-medium text-ink">
                  Color Theme
                </label>
                <select
                  id="colorToken"
                  value={colorToken}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setColorToken(e.target.value as BucketColorToken)
                  }
                  className="w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-slate"
                >
                  {BUCKET_COLOR_TOKENS.map((token) => (
                    <option key={token} value={token}>
                      {BUCKET_COLOR_LABELS[token]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button type="submit" disabled={bucketSubmitting}>
              {bucketSubmitting ? "Saving..." : "Save Bucket"}
            </Button>
          </form>
        )}

        {/* Add Holding Form */}
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
                  value={bucketId || activeBuckets[0]?.id}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBucketId(e.target.value)}
                  className="w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-slate"
                >
                  {activeBuckets.map((b) => (
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
      </div>

      {/* Holdings Table */}
      <div className="overflow-x-auto border border-rule bg-paper-raised">
        <table className="w-full min-w-[700px] text-left border-collapse">
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
                        onClick={() => startEditingHolding(h)}
                      >
                        Edit
                      </Button>
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

/* §1.5 — stroke-width 1.5, single weight, currentColor so the button's own
   hover colour drives them. */

function EditIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="4" rx="1" />
      <path d="M4 7v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7" />
      <path d="M10 12h4" />
    </svg>
  );
}

function UnarchiveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="4" rx="1" />
      <path d="M4 7v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7" />
      <path d="M12 12v6m-3-3 3-3 3 3" />
    </svg>
  );
}
