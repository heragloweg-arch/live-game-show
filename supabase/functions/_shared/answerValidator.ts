/**
 * Server-side answer validation — closed list + open Speed rules.
 * Must stay aligned with any client optimistic helpers.
 */
import { normalizeArabic } from './arabic.ts';

export type ValidationMode = 'exact' | 'open_speed' | 'choice' | 'hybrid';

export interface ChallengeValidationMeta {
  type?: string;
  subtype?: string | null;
  prompt?: string;
  validation_mode?: ValidationMode | string | null;
  validation_rules?: Record<string, unknown> | null;
  letter_pool?: string[] | null;
}

export interface ValidateResult {
  correct: boolean;
  method: 'exact' | 'choice' | 'open_rule' | 'none';
  reason?: string;
}

/** Extract simple rules from Arabic speed prompts when rules column empty */
export function inferOpenSpeedRules(prompt: string): {
  startsWith?: string;
  endsWith?: string;
  exactLength?: number;
  minLength?: number;
  maxLength?: number;
  containsLetter?: string;
} {
  const p = prompt || '';
  const rules: ReturnType<typeof inferOpenSpeedRules> = {};

  const startM = p.match(/يبدأ\s*(?:ب(?:حرف)?|بحرف)\s*([أ-يا-z])/i)
    || p.match(/تبدأ\s*(?:ب(?:حرف)?|بحرف)\s*([أ-يا-z])/i)
    || p.match(/بحرف\s*([أ-ي])/);
  if (startM) rules.startsWith = normalizeArabic(startM[1]).charAt(0);

  const endM = p.match(/تنتهي\s*(?:ب(?:حرف)?|بحرف)?\s*([أ-ي])/i)
    || p.match(/ينتهي\s*(?:ب(?:حرف)?|بحرف)?\s*([أ-ي])/i);
  if (endM) rules.endsWith = normalizeArabic(endM[1]).charAt(0);

  const lenM = p.match(/من\s*(\d+)\s*حروف?/) || p.match(/(\d+)\s*حروف?/);
  if (lenM) rules.exactLength = parseInt(lenM[1], 10);

  // "كلمة من 3 حروف"
  if (!rules.exactLength) {
    const m2 = p.match(/من\s*(\d+)/);
    if (m2 && /حرف/.test(p)) rules.exactLength = parseInt(m2[1], 10);
  }

  return rules;
}

function onlyArabicLetters(s: string): string {
  return normalizeArabic(s).replace(/[^ء-ي]/g, '');
}

export function validateOpenSpeed(
  rawAnswer: string,
  meta: ChallengeValidationMeta
): ValidateResult {
  const normalized = normalizeArabic(String(rawAnswer || ''));
  const letters = onlyArabicLetters(normalized);
  if (letters.length < 2) {
    return { correct: false, method: 'open_rule', reason: 'too_short' };
  }

  const rules = {
    ...inferOpenSpeedRules(meta.prompt || ''),
    ...(meta.validation_rules || {}),
  } as {
    startsWith?: string;
    endsWith?: string;
    exactLength?: number;
    minLength?: number;
    maxLength?: number;
  };

  if (rules.startsWith) {
    const sw = normalizeArabic(String(rules.startsWith)).charAt(0);
    if (letters.charAt(0) !== sw) {
      return { correct: false, method: 'open_rule', reason: 'starts_with' };
    }
  }
  if (rules.endsWith) {
    const ew = normalizeArabic(String(rules.endsWith)).charAt(0);
    if (letters.charAt(letters.length - 1) !== ew) {
      return { correct: false, method: 'open_rule', reason: 'ends_with' };
    }
  }
  if (rules.exactLength != null) {
    if (letters.length !== Number(rules.exactLength)) {
      return { correct: false, method: 'open_rule', reason: 'length' };
    }
  }
  if (rules.minLength != null && letters.length < Number(rules.minLength)) {
    return { correct: false, method: 'open_rule', reason: 'min_length' };
  }
  if (rules.maxLength != null && letters.length > Number(rules.maxLength)) {
    return { correct: false, method: 'open_rule', reason: 'max_length' };
  }

  // Passed structural rules → accept (open speed is rule-based, not closed list)
  return { correct: true, method: 'open_rule' };
}

export function validateAnswer(opts: {
  rawAnswer: string;
  acceptedNormalized: string[];
  choices?: { choice_id: string; label: string; is_correct: boolean }[];
  meta: ChallengeValidationMeta;
}): ValidateResult {
  const normalized = normalizeArabic(opts.rawAnswer);

  // 1) Exact accepted answers
  if (opts.acceptedNormalized?.length) {
    if (opts.acceptedNormalized.some((a) => a === normalized)) {
      return { correct: true, method: 'exact' };
    }
  }

  // 2) Multiple choice
  if (opts.choices?.length) {
    const hit = opts.choices.find(
      (c) =>
        c.is_correct &&
        (c.choice_id === opts.rawAnswer || normalizeArabic(c.label) === normalized)
    );
    if (hit) return { correct: true, method: 'choice' };
  }

  const mode = (opts.meta.validation_mode || '').toString();
  const isSpeed =
    opts.meta.type === 'speed' ||
    mode === 'open_speed' ||
    mode === 'hybrid' ||
    (opts.meta.subtype && /letter/i.test(String(opts.meta.subtype)));

  // 3) Open speed rules — if exact list missed OR hybrid/open
  if (isSpeed && (mode === 'open_speed' || mode === 'hybrid' || !opts.acceptedNormalized?.length || mode === '')) {
    // For hybrid: if we had accepted list and missed, still try open rules for speed prompts
    if (mode === 'open_speed' || mode === 'hybrid' || opts.meta.type === 'speed') {
      const open = validateOpenSpeed(opts.rawAnswer, opts.meta);
      if (open.correct) return open;
      // If only closed list was intended and we have many accepted, don't false-accept knowledge
      if (mode === 'exact') return { correct: false, method: 'none' };
      if (opts.meta.type === 'speed') return open;
    }
  }

  // 4) Had accepted list and none matched
  if (opts.acceptedNormalized?.length || opts.choices?.length) {
    return { correct: false, method: 'exact' };
  }

  return { correct: false, method: 'none', reason: 'no_validator' };
}
