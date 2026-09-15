/**
 * Client-side mirror of server open-speed rules — optimistic UX only.
 * Final authority is always the Edge Function.
 */
import { normalizeArabic } from '../../utils/arabicNormalizer';

export function clientOpenSpeedLooksValid(prompt: string, answer: string): boolean {
  const letters = normalizeArabic(answer).replace(/[^ء-ي]/g, '');
  if (letters.length < 2) return false;
  const startM = prompt.match(/يبدأ\s*(?:ب(?:حرف)?|بحرف)\s*([أ-ي])/i)
    || prompt.match(/تبدأ\s*(?:ب(?:حرف)?|بحرف)\s*([أ-ي])/i);
  if (startM) {
    const sw = normalizeArabic(startM[1]).charAt(0);
    if (letters.charAt(0) !== sw) return false;
  }
  const endM = prompt.match(/تنتهي\s*(?:ب(?:حرف)?|بحرف)?\s*([أ-ي])/i);
  if (endM) {
    const ew = normalizeArabic(endM[1]).charAt(0);
    if (letters.charAt(letters.length - 1) !== ew) return false;
  }
  const lenM = prompt.match(/من\s*(\d+)\s*حروف?/);
  if (lenM && letters.length !== parseInt(lenM[1], 10)) return false;
  return true;
}
