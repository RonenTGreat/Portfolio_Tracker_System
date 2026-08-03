"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/states";
import { QuarterStamp } from "@/components/ui/quarter-stamp";
import { readApiError } from "@/lib/api";
import { groupByAssetClass } from "@/lib/asset-classes";
import { formatGHS, parseMoneyInput, sumMoney } from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";
import type { HoldingDTO } from "@/server/holdings";

/**
 * The quarterly entry form — design §6.2, FR-1.
 *
 * One component for both adding and editing: the two differ only in which HTTP
 * verb they use and whether the date is chosen or fixed. Splitting them would
 * duplicate the grouping, the running total, and the validation — three things
 * that must behave identically in both, since the edit form is what fixes a
 * mistake made in the add form.
 *
 * Values are held as the raw strings the user typed, not as numbers. Parsing on
 * every keystroke would fight the user mid-entry ("12." is not yet a number),
 * and rounding their input as they go is exactly the silent mangling
 * src/lib/money.ts exists to prevent.
 */

interface QuarterFormProps {
  holdings: readonly HoldingDTO[];
  /** Fixed when editing; chosen from `dateOptions` when adding. */
  quarterDate?: string;
  dateOptions?: readonly string[];
  /** Existing figures, keyed by holding id — the edit form's initial state. */
  initialValues?: Readonly<Record<string, string>>;
  mode: "create" | "edit";
}

export function QuarterForm({
  holdings,
  quarterDate,
  dateOptions = [],
  initialValues = {},
  mode,
}: QuarterFormProps) {
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(
    quarterDate ?? dateOptions[0] ?? "",
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    // Seed every holding so the inputs are controlled from first render, and
    // pre-fill the ones with a recorded figure.
    const seeded: Record<string, string> = {};
    for (const holding of holdings) {
      seeded[holding.id] = initialValues[holding.id] ?? "";
    }
    return seeded;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => groupByAssetClass(holdings), [holdings]);

  /**
   * The live running total (§6.2). Unparseable and blank fields contribute
   * nothing rather than breaking the sum — the field itself reports its own
   * problem on submit, and a total that reads "NaN" mid-typing is noise.
   */
  const runningTotal = useMemo(() => {
    const parsed: string[] = [];
    for (const raw of Object.values(values)) {
      const money = parseMoneyInput(raw);
      if (money !== null) parsed.push(money);
    }
    return sumMoney(parsed);
  }, [values]);

  const filledCount = useMemo(
    () => Object.values(values).filter((v) => v.trim() !== "").length,
    [values],
  );

  function setValue(holdingId: string, raw: string) {
    setValues((prev) => ({ ...prev, [holdingId]: raw }));
    // Clear the field's error as soon as it's touched: leaving it visible while
    // the user fixes it makes the form feel like it isn't listening.
    setFieldErrors((prev) => {
      if (!(holdingId in prev)) return prev;
      const next = { ...prev };
      delete next[holdingId];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!selectedDate) {
      setFormError("Pick which quarter this is.");
      return;
    }

    // --- Client-side validation, same rules as lib/validation ---------------
    const entries: { holdingId: string; valueGHS: string }[] = [];
    const errors: Record<string, string> = {};

    for (const holding of holdings) {
      const raw = (values[holding.id] ?? "").trim();
      // Blank means "not held this quarter" and is omitted entirely, rather
      // than sent as 0 — a holding not owned and one worth nothing are
      // different facts, and only one of them belongs in a trend line.
      if (raw === "") continue;

      const money = parseMoneyInput(raw);
      if (money === null) {
        errors[holding.id] =
          "Enter a GHS amount using digits, up to two decimal places.";
        continue;
      }
      entries.push({ holdingId: holding.id, valueGHS: money });
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Some figures need attention — check the fields marked below.");
      return;
    }

    if (mode === "create" && entries.length === 0) {
      setFormError("Enter a value for at least one holding.");
      return;
    }

    // --- Submit --------------------------------------------------------------
    setSaving(true);
    try {
      const response =
        mode === "create"
          ? await fetch("/api/quarters", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ quarterDate: selectedDate, entries }),
            })
          : await fetch(`/api/quarters/${selectedDate}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entries }),
            });

      if (!response.ok) {
        setFormError(await readApiError(response));
        setSaving(false);
        return;
      }

      // refresh() drops the server component cache so the history list shows
      // the new quarter, rather than the copy it rendered before the write.
      router.push("/data-entry");
      router.refresh();
    } catch {
      // §7's voice: plain, specific, no apology.
      setFormError(
        `Couldn't save ${quarterLabel(parseISODate(selectedDate))} — check your connection and try again.`,
      );
      setSaving(false);
    }
  }

  const stampDate = selectedDate ? parseISODate(selectedDate) : null;

  return (
    <form onSubmit={handleSubmit} noValidate>
      {formError && (
        <div className="mb-6">
          <ErrorState message={formError} />
        </div>
      )}

      {/* --- Which quarter ---------------------------------------------------- */}
      <div className="mb-8 flex flex-wrap items-center gap-6 border-b border-rule pb-8">
        {stampDate && (
          <QuarterStamp
            date={stampDate}
            state={mode === "create" ? "upcoming" : "current"}
            size="lg"
          />
        )}

        {mode === "create" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="quarter-date" className="type-body-sm text-ink">
              Quarter
            </label>
            {/* Understated text with a caret rather than a heavy select box
                (§5's Quarter Selector treatment). */}
            <select
              id="quarter-date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="type-data min-h-[44px] rounded-soft border border-rule bg-paper-raised px-3 py-[10px] text-ink md:min-h-0"
            >
              {dateOptions.map((iso) => (
                <option key={iso} value={iso}>
                  {quarterLabel(parseISODate(iso))}
                </option>
              ))}
            </select>
            <span className="type-body-sm text-ink-soft">
              Closed quarters only — a quarter is recorded once it has ended.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="type-label">Editing</span>
            <span className="type-data-lg text-ink">
              {stampDate ? quarterLabel(stampDate) : ""}
            </span>
            <span className="type-body-sm text-ink-soft">
              Clearing a figure removes it from this quarter.
            </span>
          </div>
        )}
      </div>

      {/* --- Holdings, grouped by asset class (§6.2) -------------------------- */}
      {groups.map((group) => (
        <section key={group.assetClass} className="mb-8">
          {/* §8.7 — sticky within the scrolling form on mobile, so the user
              always knows which section they're in through 13 fields. */}
          <h2 className="type-display-md sticky top-0 z-10 -mx-4 mb-4 border-b border-rule bg-paper px-4 py-2 text-ink md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0">
            {group.label}
          </h2>

          <div className="flex flex-col gap-4">
            {group.holdings.map((holding) => (
              <div
                key={holding.id}
                /* §8.7 — label-left/input-right on desktop, label-above on
                   mobile, where a right-aligned mono field squeezed beside a
                   label is cramped and error-prone to tap. */
                className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6"
              >
                <div className="flex flex-col md:flex-1">
                  <span className="type-body text-ink">{holding.ticker}</span>
                  <span className="type-body-sm text-ink-soft">
                    {holding.displayName}
                  </span>
                </div>
                <div className="md:w-[240px]">
                  <MoneyField
                    label={`${holding.ticker} — ${holding.displayName}`}
                    labelHidden
                    value={values[holding.id] ?? ""}
                    onChange={(e) => setValue(holding.id, e.target.value)}
                    error={fieldErrors[holding.id]}
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* --- Running total (§6.2, §8.7) --------------------------------------
          Fixed to the viewport bottom on mobile so the live total stays visible
          through a long scroll; an ordinary form footer on desktop. The bottom
          offset clears the mobile nav bar and the iOS home indicator. */}
      <div
        className={[
          "border-t-2 border-t-ink bg-paper",
          "fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 px-4 py-3",
          "md:static md:inset-auto md:bottom-auto md:px-0 md:py-4",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-[1200px] items-baseline justify-between gap-4 md:max-w-none">
          <span className="type-label">
            Total
            <span className="ml-2 normal-case tracking-normal">
              {filledCount} of {holdings.length} recorded
            </span>
          </span>
          <span className="type-data-lg text-ink" aria-live="polite">
            GHS {formatGHS(runningTotal)}
          </span>
        </div>
      </div>

      {/* Clears the fixed mobile footer so the buttons aren't underneath it. */}
      <div className="mt-6 mb-[96px] flex flex-wrap gap-4 md:mb-0">
        <Button type="submit" disabled={saving}>
          {saving
            ? "Saving…"
            : mode === "create"
              ? "Record quarter"
              : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => router.push("/data-entry")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
