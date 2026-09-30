export const id = () => crypto.randomUUID();
export const opaque = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function hash(s: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function verifySignature(
  raw: string | ArrayBuffer,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature) || !secret)
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(signature.slice(7).match(/../g)!, (v) => parseInt(v, 16)),
    typeof raw === "string" ? new TextEncoder().encode(raw) : raw,
  );
}
export async function encrypt(value: string, hexKey: string) {
  if (!/^[a-f0-9]{64}$/i.test(hexKey))
    throw Error("Encryption key must be 32 bytes in hex");
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(hexKey.match(/../g)!, (v) => parseInt(v, 16)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(data)),
  });
}
export async function decrypt(value: string, hexKey: string) {
  const v = JSON.parse(value);
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(hexKey.match(/../g)!, (s) => parseInt(s, 16)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(v.iv) },
      key,
      new Uint8Array(v.data),
    ),
  );
}
export function redact(detail: string) {
  return detail
    .replace(/Bearer\s+[^\s,}"&]+/gi, "Bearer [redacted]")
    .replace(
      /(access_token|refresh_token|client_secret|authorization)["\s:=]+[^\s,}"&]+/gi,
      "$1=[redacted]",
    )
    .slice(0, 300);
}
