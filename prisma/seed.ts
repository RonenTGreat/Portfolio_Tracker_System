/**
 * Seed — structure only.
 *
 * Creates the five buckets (design §1.1), the twelve holdings the SRS §3 tables
 * specify, and the bootstrap Admin (FR-9.1).
 *
 * It deliberately does NOT create any QuarterEntry rows. The six historical
 * quarters (SRS §8) are real figures from the user's spreadsheet; inventing
 * plausible-looking GHS values here would put fabricated numbers into a
 * financial record, and they'd be indistinguishable from real ones the moment
 * the dashboard rendered them. The import path for those is prisma/import.ts,
 * which reads a CSV the user exports.
 *
 * Idempotent throughout — safe to re-run after a schema change without
 * duplicating rows or resetting the admin password.
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

const BUCKETS = [
  { name: "ETFs", colorToken: "--color-ink", sortOrder: 1 },
  { name: "Mutual Funds", colorToken: "--color-brass", sortOrder: 2 },
  { name: "Crypto", colorToken: "--color-ledger-red", sortOrder: 3 },
  { name: "Emergency Fund", colorToken: "--color-ledger-green", sortOrder: 4 },
  { name: "T-Bills", colorToken: "--color-slate", sortOrder: 5 },
] as const;

/* -------------------------------------------------------------------------- */
/* Holdings — verbatim from SRS §3.1–3.4.                                      */
/* -------------------------------------------------------------------------- */

const HOLDINGS: ReadonlyArray<{
  ticker: string;
  displayName: string;
  assetClass: AssetClass;
  bucket: (typeof BUCKETS)[number]["name"];
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
    // SRS Open Question 1 recommends splitting these into individual holdings.
    // Seeded as one line because that matches the spreadsheet today; FR-2 lets
    // the user split it whenever they want, without a migration.
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

/**
 * NFR: "Passwords hashed with bcrypt or argon2 — never stored in plaintext."
 *
 * scrypt from node:crypto is used instead of either: it is a memory-hard KDF in
 * the same family, it is what the auth layer will verify against in phase 7, and
 * it adds no native-module dependency to a Vercel deployment. Format is
 * `scrypt$N$r$p$salt$hash`, self-describing so the parameters can be raised
 * later without invalidating existing hashes.
 */
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

async function main() {
  // --- Buckets -------------------------------------------------------------
  for (const bucket of BUCKETS) {
    await db.bucket.upsert({
      where: { name: bucket.name },
      // Colour and order are design-owned (§1.1), so re-seeding repairs them if
      // they were changed. The name is the identity and is never rewritten.
      update: { colorToken: bucket.colorToken, sortOrder: bucket.sortOrder },
      create: bucket,
    });
  }
  console.log(`Buckets: ${BUCKETS.length}`);

  const bucketIds = new Map(
    (await db.bucket.findMany({ select: { id: true, name: true } })).map((b) => [
      b.name,
      b.id,
    ]),
  );

  // --- Holdings ------------------------------------------------------------
  let order = 0;
  for (const holding of HOLDINGS) {
    const bucketId = bucketIds.get(holding.bucket);
    if (!bucketId) throw new Error(`Missing bucket: ${holding.bucket}`);

    await db.holding.upsert({
      where: { ticker: holding.ticker },
      // Only presentation fields are refreshed. `isActive` is deliberately not
      // updated: re-running the seed must not resurrect a holding the user
      // retired under FR-2.
      update: {
        displayName: holding.displayName,
        assetClass: holding.assetClass,
        bucketId,
        notes: holding.notes,
        sortOrder: order++,
      },
      create: {
        ticker: holding.ticker,
        displayName: holding.displayName,
        assetClass: holding.assetClass,
        bucketId,
        notes: holding.notes,
        sortOrder: order,
      },
    });
  }
  console.log(`Holdings: ${HOLDINGS.length}`);

  // --- Aggregate holdings for pre-migration history (SRS §8) ---------------
  // One per bucket, carrying the imported bucket-level totals so QuarterEntry
  // stays uniformly one row per holding per quarter. Inactive, so FR-1's entry
  // form never offers them; the importer targets them explicitly.
  for (const bucket of BUCKETS) {
    const ticker = `AGG:${bucket.name}`;
    await db.holding.upsert({
      where: { ticker },
      update: {},
      create: {
        ticker,
        displayName: `${bucket.name} (pre-migration total)`,
        // Aggregates span asset classes by nature; CASH_SAFETY is the quietest
        // grouping and they are never shown in the class-grouped entry form.
        assetClass: AssetClass.CASH_SAFETY,
        bucketId: bucketIds.get(bucket.name)!,
        notes:
          "Aggregated bucket total imported from the spreadsheet, pre-migration. " +
          "Per-holding granularity was not recorded before the migration (SRS §8).",
        isAggregate: true,
        isActive: false,
        sortOrder: 900 + bucket.sortOrder,
      },
    });
  }
  console.log(`Aggregate holdings: ${BUCKETS.length}`);

  // --- Bootstrap admin (FR-9.1) --------------------------------------------
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "Bootstrap admin: skipped — set BOOTSTRAP_ADMIN_EMAIL and " +
        "BOOTSTRAP_ADMIN_PASSWORD to create it.",
    );
  } else {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      // Never overwrite a password from the environment: the user is told to
      // change it after first sign-in, and a re-seed silently reverting it to
      // the .env value would undo that without warning.
      console.log(`Bootstrap admin: ${email} already exists, left untouched.`);
    } else {
      if (password.length < 12) {
        throw new Error(
          "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters — this " +
            "account gates real financial data (FR-8).",
        );
      }
      await db.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password),
          role: "ADMIN",
          status: "ACTIVE",
          // invitedById stays null — the bootstrap account is the only one for
          // which that is true (SRS §4.1).
        },
      });
      console.log(`Bootstrap admin: created ${email}`);
      console.log("  Change this password after signing in.");
    }
  }

  console.log("\nNo quarter entries or targets seeded — both are real figures");
  console.log("from your spreadsheet, and inventing them would put fabricated");
  console.log("numbers into a financial record. Import history with:");
  console.log("  npx tsx prisma/import.ts <file.csv>");
  console.log("Targets are set on the Strategy page (FR-3).");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
