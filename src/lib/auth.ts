export const SESSION_COOKIE = "mc_session";

/** Valor do cookie de sessão derivado da senha do painel (Web Crypto: roda no middleware e no servidor). */
export async function sessionToken(): Promise<string> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("Defina ADMIN_PASSWORD");
  const data = new TextEncoder().encode(`manychat-session:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
