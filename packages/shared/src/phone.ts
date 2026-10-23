/**
 * WhatsApp ids are digits with the country code. Brazilian mobiles may arrive without the extra
 * "9" (older accounts: 55 + area code + 8 digits). Contacts are stored in one canonical form so a
 * driver registered as 5511987654321 is recognised when WhatsApp sends 551187654321.
 */
export function canonicalWaId(waId: string): string {
  const digits = waId.replace(/\D/g, '');
  // 55 + area code (11..99) + 8-digit mobile (starts with 6-9) → insert the 9.
  const legacyBrMobile = /^55([1-9][1-9])([6-9]\d{7})$/.exec(digits);
  if (legacyBrMobile) return `55${legacyBrMobile[1]}9${legacyBrMobile[2]}`;
  return digits;
}

/**
 * Phone typed in the panel → canonical WhatsApp id. Without a country code (10 or 11 digits),
 * Brazil is assumed. Returns null when it cannot be a WhatsApp number.
 */
export function phoneInputToWaId(input: string, defaultCountry = '55'): string | null {
  // Only digits and the usual separators: "11 9876-5432x" is a typo, not a number.
  if (!/^\s*\+?[\d\s().-]+$/.test(input)) return null;
  let digits = input.replace(/\D/g, '');
  if (!input.trim().startsWith('+') && (digits.length === 10 || digits.length === 11)) {
    digits = `${defaultCountry}${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return canonicalWaId(digits);
}

/** +55 11 98765-4321 for display (Brazilian numbers); other countries get a plain +digits. */
export function formatWaId(waId: string): string {
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(waId);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  return `+${waId}`;
}
