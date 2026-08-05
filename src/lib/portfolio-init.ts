import { db } from "@/lib/db";
import { AssetClass } from "@/generated/prisma/enums";

export const SEED_BUCKETS = [
  { name: "ETFs", colorToken: "--color-ink", sortOrder: 1 },
  { name: "Mutual Funds", colorToken: "--color-brass", sortOrder: 2 },
  { name: "Crypto", colorToken: "--color-ledger-red", sortOrder: 3 },
  { name: "Emergency Fund", colorToken: "--color-ledger-green", sortOrder: 4 },
  { name: "T-Bills", colorToken: "--color-slate", sortOrder: 5 },
] as const;

export const SEED_HOLDINGS = [
  {
    ticker: "VOO",
    displayName: "Vanguard S&P 500 ETF",
    assetClass: AssetClass.ETF,
    bucket: "ETFs",
    notes: "Core / Broad Market — diversified US large-cap",
  },
  {
    ticker: "QQQM",
    displayName: "Invesco NASDAQ 100 ETF",
    assetClass: AssetClass.ETF,
    bucket: "ETFs",
    notes: "Growth — tech-heavy, concentrated",
  },
  {
    ticker: "SCHD",
    displayName: "Schwab US Dividend Equity ETF",
    assetClass: AssetClass.ETF,
    bucket: "ETFs",
    notes: "Dividend / Value — income-oriented",
  },
  {
    ticker: "Epack",
    displayName: "Databank Epack",
    assetClass: AssetClass.MUTUAL_FUND,
    bucket: "Mutual Funds",
    notes: "Ghana/African Equity — growth-oriented, equity-only",
  },
  {
    ticker: "ArkFund",
    displayName: "Databank ArkFund",
    assetClass: AssetClass.MUTUAL_FUND,
    bucket: "Mutual Funds",
    notes:
      "Balanced — ~65-70% fixed income / 30-35% equity, ethically screened",
  },
  {
    ticker: "MFund",
    displayName: "Databank MFund",
    assetClass: AssetClass.MUTUAL_FUND,
    bucket: "Mutual Funds",
    notes: "Money Market — cash-like, low risk",
  },
  {
    ticker: "BTC",
    displayName: "Bitcoin",
    assetClass: AssetClass.CRYPTO,
    bucket: "Crypto",
    notes: "Long-term core — buy-and-hold thesis",
  },
  {
    ticker: "ETH",
    displayName: "Ethereum",
    assetClass: AssetClass.CRYPTO,
    bucket: "Crypto",
    notes: "Long-term core — buy-and-hold thesis",
  },
  {
    ticker: "SOL",
    displayName: "Solana",
    assetClass: AssetClass.CRYPTO,
    bucket: "Crypto",
    notes: "Long-term core — buy-and-hold thesis",
  },
  {
    ticker: "Hot Narratives",
    displayName: "Hot Narratives",
    assetClass: AssetClass.CRYPTO,
    bucket: "Crypto",
    notes: "Speculative — meme coins, AI/RWA/DePIN tokens",
  },
  {
    ticker: "T-Bill",
    displayName: "Ghana Treasury Bills",
    assetClass: AssetClass.CASH_SAFETY,
    bucket: "T-Bills",
    notes: "Government Fixed Income",
  },
  {
    ticker: "Achieve",
    displayName: "Achieve (DigiSave)",
    assetClass: AssetClass.CASH_SAFETY,
    bucket: "Emergency Fund",
    notes: "Plus Income Fund via Black Star Advisors, held at Stanbic",
  },
] as const;

export async function initUserPortfolio(userId: string) {
  for (const bucket of SEED_BUCKETS) {
    await db.bucket.upsert({
      where: { userId_name: { userId, name: bucket.name } },
      update: { colorToken: bucket.colorToken, sortOrder: bucket.sortOrder },
      create: { ...bucket, userId },
    });
  }

  const userBuckets = await db.bucket.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const bucketIds = new Map(userBuckets.map((b) => [b.name, b.id]));

  let order = 0;
  for (const holding of SEED_HOLDINGS) {
    const bucketId = bucketIds.get(holding.bucket);
    if (!bucketId) continue;

    await db.holding.upsert({
      where: { userId_ticker: { userId, ticker: holding.ticker } },
      update: {
        displayName: holding.displayName,
        assetClass: holding.assetClass,
        bucketId,
        notes: holding.notes,
        sortOrder: order++,
      },
      create: {
        userId,
        ticker: holding.ticker,
        displayName: holding.displayName,
        assetClass: holding.assetClass,
        bucketId,
        notes: holding.notes,
        sortOrder: order,
      },
    });
  }

  for (const bucket of SEED_BUCKETS) {
    const ticker = `AGG:${bucket.name}`;
    const bucketId = bucketIds.get(bucket.name)!;
    await db.holding.upsert({
      where: { userId_ticker: { userId, ticker } },
      update: {},
      create: {
        userId,
        ticker,
        displayName: `${bucket.name} (pre-migration total)`,
        assetClass: AssetClass.CASH_SAFETY,
        bucketId,
        notes: "Aggregated bucket total imported from spreadsheet.",
        isAggregate: true,
        isActive: false,
        sortOrder: 900 + bucket.sortOrder,
      },
    });
  }
}
