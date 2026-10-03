// Decrypts client-acquisition-pipeline's runs/desk.enc.json in the browser.
// Mirror of modules/desk.py encrypt(): PBKDF2-SHA256 -> AES-256-GCM. The
// pipeline repo is public, so names only ever travel encrypted; the passphrase
// (DESK_PASSPHRASE in Doppler) is typed once and kept in this browser.

export interface EncBlob {
  v: number;
  kdf: string;
  iters: number;
  salt: string;
  iv: string;
  ct: string;
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class WrongPassphrase extends Error {}

export async function decryptDesk<T>(blob: EncBlob, passphrase: string): Promise<T> {
  if (blob.v !== 1 || blob.kdf !== "PBKDF2-SHA256") throw new Error(`unknown desk format v${blob.v}`);
  // The pipeline uses 250k. A ceiling stops a tampered file from making the
  // browser grind through billions of rounds.
  if (!Number.isInteger(blob.iters) || blob.iters < 100_000 || blob.iters > 2_000_000)
    throw new Error(`implausible PBKDF2 iteration count ${blob.iters}`);
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(blob.salt), iterations: blob.iters },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(blob.iv) }, key, b64(blob.ct));
  } catch {
    // AES-GCM authenticates: a wrong key fails here rather than returning junk.
    throw new WrongPassphrase("wrong passphrase");
  }
  return JSON.parse(new TextDecoder().decode(plain)) as T; // a parse error is a real error, not a bad key
}
