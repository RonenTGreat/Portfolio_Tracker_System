/**
 * GHS money + percentage handling.
 *
 * NFR: "All monetary values stored as decimal (not float) to avoid rounding
 * errors." The database side is enforced by Prisma's Decimal columns, but the
 * easy way to lose that guarantee is at the JSON boundary — `JSON.stringify`
 * turns a Decimal into a float and 0.1 + 0.2 arithmetic creeps back in.
 *
 * So the rule this module enforces: money crosses the API as a STRING, and is
 * only ever converted to `number` for chart geometry, where a sub-pesewa error
 * is invisible and the value is never written back.
 */

/** Money as it travels over the wire and through props: an exact decimal string. */
export type MoneyString = string;

const GHS = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const GHS_COMPACT = new Intl.NumberFormat("en-GH", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * `12345.5` -> `12,345.50`. No currency symbol: the design puts a separate
 * `GHS` prefix in --ink-soft beside the figure (§6.2) rather than inline.
 */
export function formatGHS(value: MoneyString | number): string {
  return GHS.format(typeof value === "string" ? Number(value) : value);
}

/** With the unit, for prose and KPI figures: `GHS 12,345.50`. */
export function formatGHSWithUnit(value: MoneyString | number): string {
  return `GHS ${formatGHS(value)}`;
}

/** Axis ticks only, where full precision would collide: `GHS 12.3K`. */
export function formatGHSCompact(value: MoneyString | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `GHS ${GHS_COMPACT.format(n)}`;
}

/** Signed, for deltas: `+1,240.00` / `−512.30`. Uses a real minus sign (U+2212). */
export function formatDelta(value: MoneyString | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === 0) return formatGHS(0);
  return n > 0 ? `+${formatGHS(n)}` : `−${formatGHS(Math.abs(n))}`;
}

/** `21.9` -> `21.9%`. */
export function formatPct(value: MoneyString | number, dp = 1): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `${n.toFixed(dp)}%`;
}

/** Signed percent, for QoQ change: `+22.4%`. */
export function formatPctDelta(value: MoneyString | number, dp = 1): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === 0) return formatPct(0, dp);
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(dp)}%`;
}

/**
 * Variance in percentage POINTS, not percent (§5 Variance Badge: `+21.9pp`).
 * The distinction is load-bearing: "crypto is 42% vs a 20% target" is a 22pp
 * gap, not a 22% one, and calling it % would understate it to anyone reading
 * carefully.
 */
export function formatPP(value: MoneyString | number, dp = 1): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === 0) return `0.0pp`;
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(dp)}pp`;
}

/**
 * Exact decimal-string addition, done digit-wise so a long column of GHS
 * figures totals without float drift. Used for the running total in the entry
 * form (§6.2) and every bucket subtotal.
 */
export function sumMoney(values: readonly MoneyString[]): MoneyString {
  let pesewas = 0n;
  for (const v of values) pesewas += toPesewas(v);
  return fromPesewas(pesewas);
}

export function addMoney(a: MoneyString, b: MoneyString): MoneyString {
  return fromPesewas(toPesewas(a) + toPesewas(b));
}

export function subMoney(a: MoneyString, b: MoneyString): MoneyString {
  return fromPesewas(toPesewas(a) - toPesewas(b));
}

/** Integer pesewas (1/100 GHS) as BigInt — exact, no float in the path. */
export function toPesewas(value: MoneyString): bigint {
  const trimmed = (value ?? "").toString().trim();
  if (trimmed === "" || trimmed === "-") return 0n;
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = unsigned.split(".");
  // Pad/truncate to exactly 2dp. Truncation (not rounding) is deliberate:
  // input is validated to 2dp upstream, so a 3rd digit is bad data, and
  // silently rounding it would hide that.
  const cents = (frac + "00").slice(0, 2);
  const magnitude = BigInt(whole || "0") * 100n + BigInt(cents || "0");
  return negative ? -magnitude : magnitude;
}

export function fromPesewas(pesewas: bigint): MoneyString {
  const negative = pesewas < 0n;
  const abs = negative ? -pesewas : pesewas;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
}

/** `holdingValue / total * 100`, to 3dp. Returns 0 when the total is 0. */
export function pctOfTotal(part: MoneyString, total: MoneyString): number {
  const t = toPesewas(total);
  if (t === 0n) return 0;
  return Math.round((Number(toPesewas(part)) / Number(t)) * 100 * 1000) / 1000;
}

/**
 * Percent change between two quarters. Returns null when the base is zero —
 * a holding that went 0 -> 5,000 has no meaningful percentage, and rendering
 * "Infinity%" or "+100%" would both be lies. Callers show "new" instead.
 */
export function pctChange(
  from: MoneyString,
  to: MoneyString,
): number | null {
  const f = toPesewas(from);
  if (f === 0n) return null;
  const delta = Number(toPesewas(to) - f);
  return Math.round((delta / Math.abs(Number(f))) * 100 * 10) / 10;
}

/** Charts need a `number`; isolate the lossy conversion to one named place. */
export function toChartNumber(value: MoneyString): number {
  return Number(value);
}

/** Accepts `1234.5`, `1,234.50`, `GHS 1234`. Rejects anything else. */
export function parseMoneyInput(raw: string): MoneyString | null {
  const cleaned = raw
    .replace(/[\s,]/g, "")
    .replace(/^GHS/i, "")
    .trim();
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return fromPesewas(toPesewas(cleaned));
}
