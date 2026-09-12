const DIACRITICS = /[\u064B-\u065F\u0670]/g;
const TATWEEL = /\u0640/g;

export function normalizeArabic(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let text = input.trim();
  text = text.replace(TATWEEL, '').replace(DIACRITICS, '');
  text = text.replace(/[أإآٱ]/g, 'ا');
  text = text.replace(/[ىي]/g, 'ي');
  text = text.replace(/ة/g, 'ه');
  text = text.replace(/[ؤ]/g, 'و');
  text = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return text;
}
