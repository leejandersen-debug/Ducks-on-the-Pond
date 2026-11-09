import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing and session tokens. Server-only: imported by server actions and lib/session.ts.
// Hash format: scrypt$N$r$p$salt$hash (base64url), so the cost can be raised later without
// breaking old hashes.

const N = 16384, R = 8, P = 1, KEYLEN = 64;
export const SESSION_COOKIE = "ducks_session";
export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 10;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(key, expected);
}

// A hash of a random password, checked when the login doesn't exist, so a wrong email takes
// as long as a wrong password and response time doesn't reveal which accounts exist.
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString("hex")));

export const newSessionToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
