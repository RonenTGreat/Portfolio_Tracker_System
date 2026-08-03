/**
 * Bucket identity and colour.
 *
 * Design §1.1 states the bucket→colour mapping "must never change between
 * chart types or pages" and calls this "a functional requirement, not just a
 * style note", because the FR-6/FR-7 paired pies are only comparable if Crypto
 * is the same red in both.
 *
 * Buckets are user-managed rows (not an enum), so each carries its own
 * `colorToken`. That makes the invariant structural: there is exactly one place
 * a bucket's colour can come from, and no component can invent a different one.
 */

/** The palette a bucket's colour may be drawn from — §1.1 tokens only. */
export const BUCKET_COLOR_TOKENS = [
  "--color-ink",
  "--color-brass",
  "--color-ledger-red",
  "--color-ledger-green",
  "--color-slate",
  "--color-ink-soft",
] as const;

export type BucketColorToken = (typeof BUCKET_COLOR_TOKENS)[number];

/** Human labels for the colour picker in bucket management (phase 3). */
export const BUCKET_COLOR_LABELS: Record<BucketColorToken, string> = {
  "--color-ink": "Ink",
  "--color-brass": "Brass",
  "--color-ledger-red": "Ledger red",
  "--color-ledger-green": "Ledger green",
  "--color-slate": "Slate",
  "--color-ink-soft": "Soft ink",
};

/**
 * The five seeded buckets and their §1.1 colours. This is seed data, not a
 * closed set — buckets can be added, renamed, recoloured or archived.
 */
export const SEED_BUCKETS: ReadonlyArray<{
  name: string;
  colorToken: BucketColorToken;
  sortOrder: number;
}> = [
  { name: "ETFs", colorToken: "--color-ink", sortOrder: 1 },
  { name: "Mutual Funds", colorToken: "--color-brass", sortOrder: 2 },
  { name: "Crypto", colorToken: "--color-ledger-red", sortOrder: 3 },
  { name: "Emergency Fund", colorToken: "--color-ledger-green", sortOrder: 4 },
  { name: "T-Bills", colorToken: "--color-slate", sortOrder: 5 },
];

/** The minimum a component needs in order to colour something by bucket. */
export interface BucketLike {
  id: string;
  name: string;
  colorToken: string;
}

/**
 * A bucket's colour as a CSS value.
 *
 * Recharts needs a concrete colour string for `fill`/`stroke`, and
 * `var(--color-crypto)` works there because it resolves against the SVG's own
 * computed style. Keeping it as a var (rather than resolving to hex) means the
 * token file stays the single source of truth, per §10.
 */
export function bucketColor(bucket: BucketLike): string {
  return `var(${bucket.colorToken})`;
}

/** Same colour at reduced alpha — the §4 tolerance band fill (10%) and the
 *  §5 variance-badge background tint (12%). */
export function bucketColorAlpha(bucket: BucketLike, alpha: number): string {
  return `color-mix(in oklab, var(${bucket.colorToken}) ${Math.round(alpha * 100)}%, transparent)`;
}

/**
 * A stable id→colour lookup for a chart that renders many buckets at once.
 * Built once per chart from the same rows the table is drawn from, so a pie
 * slice and its table row can never disagree.
 */
export function bucketColorMap(
  buckets: readonly BucketLike[],
): ReadonlyMap<string, string> {
  return new Map(buckets.map((b) => [b.id, bucketColor(b)]));
}

/**
 * Fallback for a value with no bucket — e.g. a chart series for a holding that
 * was moved out of an archived bucket. Deliberately the quietest token in the
 * palette so unassigned data reads as unassigned rather than as a new category.
 */
export const UNASSIGNED_COLOR = "var(--color-ink-soft)";
