/**
 * Seed — structure and demo data scoped per user.
 *
 * Creates standard buckets, SRS §3 holdings, strategy targets, and historical
 * quarters for the bootstrap Admin (FR-9.1).
 *
 * Provides seedUserPortfolioStructure to initialize new users upon invite registration.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { scrypt as scryptCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { PrismaClient, AssetClass } from "../src/generated/prisma/client.js";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/* -------------------------------------------------------------------------- */
/* Buckets — design §1.1, colours must match src/lib/buckets.ts SEED_BUCKETS.  */
/* -------------------------------------------------------------------------- */

export const SEED_BUCKETS = [
  { name: "ETFs", colorToken: "--color-ink", sortOrder: 1 },
  { name: "Mutual Funds", colorToken: "--color-brass", sortOrder: 2 },
  { name: "Crypto", colorToken: "--color-ledger-red", sortOrder: 3 },
  { name: "Emergency Fund", colorToken: "--color-ledger-green", sortOrder: 4 },
  { name: "T-Bills", colorToken: "--color-slate", sortOrder: 5 },
] as const;

/* -------------------------------------------------------------------------- */
/* Holdings — verbatim from SRS §3.1–3.4.                                      */
/* -------------------------------------------------------------------------- */

export const SEED_HOLDINGS: ReadonlyArray<{
  ticker: string;
  displayName: string;
  assetClass: AssetClass;
  bucket: (typeof SEED_BUCKETS)[number]["name"];
  notes: string;
}> = [
  // §3.1 ETFs
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

  // §3.2 Mutual funds
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

  // §3.3 Crypto
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

  // §3.4 Cash / safety
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
];

/* -------------------------------------------------------------------------- */
/* Password hashing                                                            */
/* -------------------------------------------------------------------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT.keylen);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/* -------------------------------------------------------------------------- */
/* Seed structure for any user                                                 */
/* -------------------------------------------------------------------------- */

export async function seedUserPortfolioStructure(
  client: PrismaClient,
  userId: string,
) {
  // Buckets
  for (const bucket of SEED_BUCKETS) {
    await client.bucket.upsert({
      where: { userId_name: { userId, name: bucket.name } },
      update: { colorToken: bucket.colorToken, sortOrder: bucket.sortOrder },
      create: { ...bucket, userId },
    });
  }

  const userBuckets = await client.bucket.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const bucketIds = new Map(userBuckets.map((b) => [b.name, b.id]));

  // Holdings
  let order = 0;
  for (const holding of SEED_HOLDINGS) {
    const bucketId = bucketIds.get(holding.bucket);
    if (!bucketId) throw new Error(`Missing bucket: ${holding.bucket}`);

    await client.holding.upsert({
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

  // Aggregate holdings
  for (const bucket of SEED_BUCKETS) {
    const ticker = `AGG:${bucket.name}`;
    const bucketId = bucketIds.get(bucket.name)!;
    await client.holding.upsert({
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

/* -------------------------------------------------------------------------- */

async function main() {
  // --- Bootstrap admin (FR-9.1) --------------------------------------------
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "Bootstrap admin: skipped — set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create it.",
    );
    return;
  }

  let adminUser = await db.user.findUnique({ where: { email } });
  if (!adminUser) {
    if (password.length < 12) {
      throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
    }
    adminUser = await db.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`Bootstrap admin created: ${email}`);
  } else {
    console.log(`Bootstrap admin: ${email} already exists.`);
  }

  const userId = adminUser.id;

  // --- Buckets & Holdings for Admin -----------------------------------------
  await seedUserPortfolioStructure(db, userId);
  console.log(`Buckets & Holdings seeded for user ${email}`);

  const userBuckets = await db.bucket.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const bucketIds = new Map(userBuckets.map((b) => [b.name, b.id]));

  const userHoldings = await db.holding.findMany({
    where: { userId },
    select: { id: true, ticker: true },
  });
  const holdingsMap = new Map(userHoldings.map((h) => [h.ticker, h.id]));

  // --- Target allocations for Admin ----------------------------------------
  const effectiveFrom = new Date(Date.UTC(2025, 0, 1));

  const BUCKET_TARGETS: Record<string, number> = {
    ETFs: 35.0,
    "Mutual Funds": 25.0,
    Crypto: 15.0,
    "Emergency Fund": 15.0,
    "T-Bills": 10.0,
  };

  for (const [name, targetPct] of Object.entries(BUCKET_TARGETS)) {
    const bucketId = bucketIds.get(name);
    if (bucketId) {
      await db.targetAllocation.upsert({
        where: {
          userId_bucketId_effectiveFrom: { userId, bucketId, effectiveFrom },
        },
        update: { targetPct },
        create: { userId, bucketId, effectiveFrom, targetPct, note: "Initial strategy target" },
      });
    }
  }

  const HOLDING_TARGETS: Record<string, number> = {
    VOO: 20.0,
    QQQM: 10.0,
    SCHD: 5.0,
    Epack: 10.0,
    ArkFund: 10.0,
    MFund: 5.0,
    BTC: 8.0,
    ETH: 4.0,
    SOL: 2.0,
    "Hot Narratives": 1.0,
    Achieve: 15.0,
    "T-Bill": 10.0,
  };

  for (const [ticker, targetPct] of Object.entries(HOLDING_TARGETS)) {
    const holdingId = holdingsMap.get(ticker);
    if (holdingId) {
      await db.targetAllocation.upsert({
        where: {
          userId_holdingId_effectiveFrom: { userId, holdingId, effectiveFrom },
        },
        update: { targetPct },
        create: { userId, holdingId, effectiveFrom, targetPct, note: "Initial holding target" },
      });
    }
  }
  console.log(`Target allocations seeded for user ${email}`);

  // --- Historical Quarters & Entries for Admin ------------------------------
  const DEMO_QUARTERS: Array<{
    date: Date;
    isPreMigration: boolean;
    entries: Record<string, number>;
  }> = [
    {
      date: new Date(Date.UTC(2024, 8, 30)),
      isPreMigration: true,
      entries: {
        "AGG:ETFs": 30000.0,
        "AGG:Mutual Funds": 22000.0,
        "AGG:Crypto": 14000.0,
        "AGG:Emergency Fund": 17000.0,
        "AGG:T-Bills": 12000.0,
      },
    },
    {
      date: new Date(Date.UTC(2024, 11, 31)),
      isPreMigration: true,
      entries: {
        "AGG:ETFs": 34000.0,
        "AGG:Mutual Funds": 24000.0,
        "AGG:Crypto": 16000.0,
        "AGG:Emergency Fund": 18000.0,
        "AGG:T-Bills": 13000.0,
      },
    },
    {
      date: new Date(Date.UTC(2025, 2, 31)),
      isPreMigration: false,
      entries: {
        VOO: 24000.0,
        QQQM: 11500.0,
        SCHD: 6000.0,
        Epack: 12000.0,
        ArkFund: 12500.0,
        MFund: 6000.0,
        BTC: 11000.0,
        ETH: 5500.0,
        SOL: 2500.0,
        "Hot Narratives": 1500.0,
        Achieve: 18500.0,
        "T-Bill": 14000.0,
      },
    },
    {
      date: new Date(Date.UTC(2025, 5, 30)),
      isPreMigration: false,
      entries: {
        VOO: 26500.0,
        QQQM: 13000.0,
        SCHD: 6300.0,
        Epack: 12800.0,
        ArkFund: 13000.0,
        MFund: 6200.0,
        BTC: 13500.0,
        ETH: 6200.0,
        SOL: 3200.0,
        "Hot Narratives": 1800.0,
        Achieve: 19000.0,
        "T-Bill": 14500.0,
      },
    },
    {
      date: new Date(Date.UTC(2025, 8, 30)),
      isPreMigration: false,
      entries: {
        VOO: 29000.0,
        QQQM: 14800.0,
        SCHD: 6700.0,
        Epack: 13500.0,
        ArkFund: 13800.0,
        MFund: 6500.0,
        BTC: 15000.0,
        ETH: 7000.0,
        SOL: 3800.0,
        "Hot Narratives": 2400.0,
        Achieve: 20000.0,
        "T-Bill": 15500.0,
      },
    },
    {
      date: new Date(Date.UTC(2025, 11, 31)),
      isPreMigration: false,
      entries: {
        VOO: 31500.0,
        QQQM: 16200.0,
        SCHD: 7100.0,
        Epack: 14200.0,
        ArkFund: 14500.0,
        MFund: 6800.0,
        BTC: 17800.0,
        ETH: 8100.0,
        SOL: 4500.0,
        "Hot Narratives": 2800.0,
        Achieve: 21000.0,
        "T-Bill": 15500.0,
      },
    },
    {
      date: new Date(Date.UTC(2026, 2, 31)),
      isPreMigration: false,
      entries: {
        VOO: 35000.0,
        QQQM: 18000.0,
        SCHD: 7500.0,
        Epack: 15000.0,
        ArkFund: 15200.0,
        MFund: 7000.0,
        BTC: 21000.0,
        ETH: 9500.0,
        SOL: 5400.0,
        "Hot Narratives": 3400.0,
        Achieve: 21500.0,
        "T-Bill": 15500.0,
      },
    },
    {
      date: new Date(Date.UTC(2026, 5, 30)),
      isPreMigration: false,
      entries: {
        VOO: 38500.0,
        QQQM: 20200.0,
        SCHD: 8000.0,
        Epack: 16000.0,
        ArkFund: 15800.0,
        MFund: 7500.0,
        BTC: 24000.0,
        ETH: 11000.0,
        SOL: 6500.0,
        "Hot Narratives": 4000.0,
        Achieve: 22000.0,
        "T-Bill": 14500.0,
      },
    },
  ];

  let totalEntriesWritten = 0;
  for (const q of DEMO_QUARTERS) {
    const quarter = await db.quarter.upsert({
      where: { userId_quarterDate: { userId, quarterDate: q.date } },
      update: { isPreMigration: q.isPreMigration },
      create: { userId, quarterDate: q.date, isPreMigration: q.isPreMigration },
    });

    for (const [ticker, val] of Object.entries(q.entries)) {
      const holdingId = holdingsMap.get(ticker);
      if (holdingId) {
        await db.quarterEntry.upsert({
          where: {
            quarterId_holdingId: { quarterId: quarter.id, holdingId },
          },
          update: { valueGHS: val, quarterDate: q.date },
          create: { quarterId: quarter.id, holdingId, quarterDate: q.date, valueGHS: val },
        });
        totalEntriesWritten++;
      }
    }
  }
  console.log(`Quarter entries seeded for ${email}: ${totalEntriesWritten} entries across ${DEMO_QUARTERS.length} quarters.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
