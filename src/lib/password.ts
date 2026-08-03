/**
 * Password hashing and verification.
 *
 * NFR "Password security": passwords are hashed, never stored in plaintext and
 * never logged. scrypt from node:crypto stands in for the NFR's named
 * bcrypt/argon2 — it is a memory-hard KDF in the same family, and unlike either
 * of those it adds no native module to a Vercel deployment.
 *
 * prisma/seed.ts writes the bootstrap Admin's hash (FR-9.1) using this same
 * module, deliberately: if the two ever disagreed on format, the one account
 * able to invite every other account could never sign in, and the failure would
 * look like a wrong password rather than a bug.
 *
 * Format: `scrypt$N$r$p$salt$hash`, salt and hash base64. Self-describing on
 * purpose — verify reads the cost parameters out of the stored string instead of
 * assuming today's constants, so PARAMS can be raised later without
 * invalidating every hash written before the change.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** Current cost — Node's own scrypt defaults. */
const PARAMS: ScryptParams = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;
const SALT_BYTES = 16;

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptParams & { maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt's working set is 128 * N * r bytes and Node rejects anything over
 * `maxmem` (32 MiB by default). Derived rather than hard-coded so that raising
 * N later fails at code review instead of at runtime with an opaque
 * "memory limit exceeded".
 */
function maxmemFor({ N, r }: ScryptParams): number {
  return Math.max(32 * 1024 * 1024, 256 * N * r);
}

function derive(
  password: string,
  salt: Buffer,
  params: ScryptParams,
  keylen: number,
): Promise<Buffer> {
  return scrypt(password, salt, keylen, {
    ...params,
    maxmem: maxmemFor(params),
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derive(password, salt, PARAMS, KEYLEN);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * A syntactically valid hash of a value nothing will ever submit.
 *
 * Used when verifying against an account that doesn't exist: without it,
 * "unknown email" returns in microseconds while "known email, wrong password"
 * takes a full scrypt derivation, and the difference is a reliable oracle for
 * which addresses have accounts. Verifying against this instead keeps the two
 * paths the same shape and the same cost.
 */
const ABSENT_ACCOUNT_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function parse(
  stored: string,
): { params: ScryptParams; salt: Buffer; hash: Buffer } | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const [, n, r, p, salt, hash] = parts;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Object.values(params).every((v) => Number.isInteger(v) && v > 0)) {
    return null;
  }

  return {
    params,
    salt: Buffer.from(salt, "base64"),
    hash: Buffer.from(hash, "base64"),
  };
}

/**
 * Verify a submitted password.
 *
 * `stored` accepts null so the caller can hand over `user?.passwordHash`
 * directly for an account that wasn't found — see ABSENT_ACCOUNT_HASH. The
 * comparison is timing-safe; the length check in front of it is not a leak,
 * since the hash length is a property of the format, not of the secret.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const parsed = parse(stored || ABSENT_ACCOUNT_HASH);
  // An unparseable hash is a corrupt row, not a valid credential. Still burn a
  // derivation first so this path costs what every other path costs.
  if (!parsed) {
    await derive(password, randomBytes(SALT_BYTES), PARAMS, KEYLEN);
    return false;
  }

  const candidate = await derive(
    password,
    parsed.salt,
    parsed.params,
    parsed.hash.length || KEYLEN,
  );

  if (candidate.length !== parsed.hash.length) return false;
  const matches = timingSafeEqual(candidate, parsed.hash);

  // Never report a match against the placeholder, whatever was submitted.
  return matches && Boolean(stored);
}
