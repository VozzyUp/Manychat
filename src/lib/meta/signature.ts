import { createHmac, timingSafeEqual } from "node:crypto";

/** Confere o cabeçalho X-Hub-Signature-256 contra qualquer um dos app secrets. */
export function verifySignature(rawBody: string, header: string | null, secrets: string[]): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const got = Buffer.from(header.slice(7), "hex");
  return secrets.some((secret) => {
    const want = createHmac("sha256", secret).update(rawBody, "utf8").digest();
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

export function appSecrets(): string[] {
  return (process.env.META_APP_SECRETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
