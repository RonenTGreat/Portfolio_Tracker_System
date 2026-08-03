/**
 * AssetClass labels and grouping order.
 *
 * FR-1 requires the entry form to be "grouped by asset class (ETFs / Mutual
 * Funds / Crypto / Cash)", and design §6.2 names the four section headers
 * exactly: "ETFs", "Mutual Funds", "Crypto", "Cash & Safety". The enum values
 * are storage identifiers and are not display strings, so the mapping lives
 * here rather than being re-derived (and re-worded slightly differently) in
 * each component that needs a header.
 *
 * Distinct from src/lib/buckets.ts on purpose: an asset class is what a holding
 * *is* and never changes, while a bucket is a reporting choice the user may
 * rearrange. The entry form groups by class; every chart groups by bucket.
 */

import type { AssetClass } from "@/generated/prisma/enums";

/** §6.2 section headers, in the order the form must present them. */
export const ASSET_CLASS_ORDER = [
  "ETF",
  "MUTUAL_FUND",
  "CRYPTO",
  "CASH_SAFETY",
] as const satisfies readonly AssetClass[];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  ETF: "ETFs",
  MUTUAL_FUND: "Mutual Funds",
  CRYPTO: "Crypto",
  CASH_SAFETY: "Cash & Safety",
};

/** Singular form, for a holding-detail line rather than a group header. */
export const ASSET_CLASS_LABELS_SINGULAR: Record<AssetClass, string> = {
  ETF: "ETF",
  MUTUAL_FUND: "Mutual fund",
  CRYPTO: "Crypto",
  CASH_SAFETY: "Cash / safety",
};

export function assetClassLabel(assetClass: AssetClass): string {
  return ASSET_CLASS_LABELS[assetClass];
}

/**
 * Split a flat holdings list into the four §6.2 sections, in spec order,
 * dropping any section with no holdings (a user who owns no crypto should not
 * see an empty "Crypto" header with nothing under it).
 */
export function groupByAssetClass<T extends { assetClass: AssetClass }>(
  holdings: readonly T[],
): Array<{ assetClass: AssetClass; label: string; holdings: T[] }> {
  return ASSET_CLASS_ORDER.map((assetClass) => ({
    assetClass,
    label: ASSET_CLASS_LABELS[assetClass],
    holdings: holdings.filter((h) => h.assetClass === assetClass),
  })).filter((group) => group.holdings.length > 0);
}
