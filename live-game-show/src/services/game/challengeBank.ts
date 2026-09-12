/**
 * Local Challenge Bank for Solo / Demo mode.
 * In production the real bank lives on the server.
 * Expanded high-quality Arabic content covering all categories.
 */

import type { Challenge, ChallengeType, ChallengeSubtype, Difficulty } from '../../types';

interface BankItem {
  type: ChallengeType;
  subtype: ChallengeSubtype;
  prompt: string;
  difficulty: Difficulty;
  acceptedAnswers?: string[];
  choices?: { id: string; label: string; correct?: boolean }[];
  letterPool?: string[];
  timeLimitMs: number;
}

const BANK: BankItem[] = [
  // ═══════════════════════════════════════
  // SPEED
  // ═══════════════════════════════════════
  {
    type: 'speed',
    subtype: 'countries',
    prompt: 'اكتب اسم دولة عربية تبدأ بحرف «م»',
    difficulty: 'easy',
    acceptedAnswers: ['مصر', 'المغرب', 'موريتانيا', 'اليمن'],
    timeLimitMs: 15000,
  },
  {
    type: 'speed',
    subtype: 'countries',
    prompt: 'اكتب اسم دولة عربية تنتهي بحرف «ن»',
    difficulty: 'easy',
    acceptedAnswers: ['الأردن', 'البحرين', 'لبنان', 'السودان', 'عمان'],
    timeLimitMs: 15000,
  },
  {
    type: 'speed',
    subtype: 'people',
    prompt: 'اكتب اسم لاعب كرة قدم عربي مشهور من 5 حروف أو أقل',
    difficulty: 'normal',
    acceptedAnswers: ['صلاح', 'محرز', 'بنزيما', 'تريزيغيه', 'هاني'],
    timeLimitMs: 15000,
  },
  {
    type: 'speed',
    subtype: 'people',
    prompt: 'اكتب اسم عالم مسلم مشهور',
    difficulty: 'normal',
    acceptedAnswers: ['ابن سينا', 'الخوارزمي', 'ابن الهيثم', 'جابر', 'البيروني', 'الفارابي'],
    timeLimitMs: 18000,
  },
  {
    type: 'speed',
    subtype: 'letters',
    prompt: 'كوّن كلمة من الحروف: ر ا م ي',
    difficulty: 'easy',
    letterPool: ['ر', 'ا', 'م', 'ي'],
    acceptedAnswers: ['رامي', 'يمار', 'رايم'],
    timeLimitMs: 18000,
  },
  {
    type: 'speed',
    subtype: 'letters',
    prompt: 'كوّن كلمة عربية من الحروف: ق م ر',
    difficulty: 'easy',
    letterPool: ['ق', 'م', 'ر'],
    acceptedAnswers: ['قمر', 'رقم', 'مقر'],
    timeLimitMs: 15000,
  },
  {
    type: 'speed',
    subtype: 'emoji',
    prompt: 'ماذا يمثل هذا الإيموجي؟ 🕌',
    difficulty: 'easy',
    acceptedAnswers: ['مسجد', 'جامع'],
    timeLimitMs: 10000,
  },
  {
    type: 'speed',
    subtype: 'emoji',
    prompt: 'ماذا يمثل؟ 🏺',
    difficulty: 'normal',
    acceptedAnswers: ['جرة', 'فخار', 'آنية', 'إناء'],
    timeLimitMs: 12000,
  },
  {
    type: 'speed',
    subtype: 'movies',
    prompt: 'اكتب اسم فيلم عربي مشهور',
    difficulty: 'normal',
    acceptedAnswers: ['الإرهاب والكباب', 'الكرنك', 'عمارة يعقوبيان', 'الفيل الأزرق', 'اشتباك', 'كيرة والجن'],
    timeLimitMs: 18000,
  },

  // ═══════════════════════════════════════
  // WORDS
  // ═══════════════════════════════════════
  {
    type: 'words',
    subtype: 'proverb',
    prompt: 'أكمل المثل: «اللي فات مات و...»',
    difficulty: 'easy',
    acceptedAnswers: ['اللي يجي أحسن منه', 'اللي يجي خير منه'],
    timeLimitMs: 20000,
  },
  {
    type: 'words',
    subtype: 'proverb',
    prompt: 'أكمل: «القرد في عين أمه...»',
    difficulty: 'easy',
    acceptedAnswers: ['غزال'],
    timeLimitMs: 12000,
  },
  {
    type: 'words',
    subtype: 'proverb',
    prompt: 'أكمل المثل: «يد واحدة لا...»',
    difficulty: 'easy',
    acceptedAnswers: ['تصفق'],
    timeLimitMs: 12000,
  },
  {
    type: 'words',
    subtype: 'complete_sentence',
    prompt: 'أكمل: «العلم نور و...»',
    difficulty: 'easy',
    acceptedAnswers: ['الجهل ظلام'],
    timeLimitMs: 15000,
  },
  {
    type: 'words',
    subtype: 'wisdom',
    prompt: 'أكمل الحكمة: «من جدّ...»',
    difficulty: 'normal',
    acceptedAnswers: ['وجد'],
    timeLimitMs: 12000,
  },
  {
    type: 'words',
    subtype: 'wisdom',
    prompt: 'أكمل: «الصبر مفتاح...»',
    difficulty: 'easy',
    acceptedAnswers: ['الفرج'],
    timeLimitMs: 10000,
  },
  {
    type: 'words',
    subtype: 'related_words',
    prompt: 'اكتب كلمة مرتبطة بـ «البحر»',
    difficulty: 'easy',
    acceptedAnswers: ['موجة', 'سفينة', 'سمك', 'شاطئ', 'محيط', 'مرسى', 'مركب', 'غوص'],
    timeLimitMs: 12000,
  },

  // ═══════════════════════════════════════
  // KNOWLEDGE — Geography
  // ═══════════════════════════════════════
  {
    type: 'knowledge',
    subtype: 'geography',
    prompt: 'ما هي عاصمة المملكة العربية السعودية؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: 'جدة', correct: false },
      { id: 'b', label: 'الرياض', correct: true },
      { id: 'c', label: 'الدمام', correct: false },
      { id: 'd', label: 'مكة', correct: false },
    ],
    timeLimitMs: 12000,
  },
  {
    type: 'knowledge',
    subtype: 'geography',
    prompt: 'أي دولة عربية تطل على المحيط الأطلسي والبحر المتوسط؟',
    difficulty: 'normal',
    choices: [
      { id: 'a', label: 'تونس', correct: false },
      { id: 'b', label: 'المغرب', correct: true },
      { id: 'c', label: 'الجزائر', correct: false },
      { id: 'd', label: 'ليبيا', correct: false },
    ],
    timeLimitMs: 14000,
  },
  {
    type: 'knowledge',
    subtype: 'geography',
    prompt: 'ما أطول نهر في العالم؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: 'الأمازون', correct: false },
      { id: 'b', label: 'النيل', correct: true },
      { id: 'c', label: 'المسيسيبي', correct: false },
      { id: 'd', label: 'اليانغتسي', correct: false },
    ],
    timeLimitMs: 12000,
  },
  {
    type: 'knowledge',
    subtype: 'geography',
    prompt: 'عاصمة الإمارات العربية المتحدة هي؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: 'دبي', correct: false },
      { id: 'b', label: 'أبوظبي', correct: true },
      { id: 'c', label: 'الشارقة', correct: false },
      { id: 'd', label: 'العين', correct: false },
    ],
    timeLimitMs: 10000,
  },

  // ═══════════════════════════════════════
  // KNOWLEDGE — History
  // ═══════════════════════════════════════
  {
    type: 'knowledge',
    subtype: 'history',
    prompt: 'في أي عام هجري فُتحت مكة؟',
    difficulty: 'normal',
    choices: [
      { id: 'a', label: '6 هـ', correct: false },
      { id: 'b', label: '8 هـ', correct: true },
      { id: 'c', label: '9 هـ', correct: false },
      { id: 'd', label: '10 هـ', correct: false },
    ],
    timeLimitMs: 15000,
  },
  {
    type: 'knowledge',
    subtype: 'history',
    prompt: 'من هو القائد الذي فتح الأندلس؟',
    difficulty: 'normal',
    choices: [
      { id: 'a', label: 'خالد بن الوليد', correct: false },
      { id: 'b', label: 'طارق بن زياد', correct: true },
      { id: 'c', label: 'عقبة بن نافع', correct: false },
      { id: 'd', label: 'صلاح الدين', correct: false },
    ],
    timeLimitMs: 14000,
  },
  {
    type: 'knowledge',
    subtype: 'history',
    prompt: 'في أي سنة ميلادية انتهت الحرب العالمية الثانية؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: '1943', correct: false },
      { id: 'b', label: '1945', correct: true },
      { id: 'c', label: '1947', correct: false },
      { id: 'd', label: '1950', correct: false },
    ],
    timeLimitMs: 12000,
  },

  // ═══════════════════════════════════════
  // KNOWLEDGE — Religion
  // ═══════════════════════════════════════
  {
    type: 'knowledge',
    subtype: 'religion',
    prompt: 'كم عدد أركان الإسلام؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: '4', correct: false },
      { id: 'b', label: '5', correct: true },
      { id: 'c', label: '6', correct: false },
      { id: 'd', label: '7', correct: false },
    ],
    timeLimitMs: 10000,
  },
  {
    type: 'knowledge',
    subtype: 'religion',
    prompt: 'ما هو أول مسجد بُني في الإسلام؟',
    difficulty: 'normal',
    choices: [
      { id: 'a', label: 'المسجد الحرام', correct: false },
      { id: 'b', label: 'مسجد قباء', correct: true },
      { id: 'c', label: 'المسجد النبوي', correct: false },
      { id: 'd', label: 'المسجد الأقصى', correct: false },
    ],
    timeLimitMs: 14000,
  },
  {
    type: 'knowledge',
    subtype: 'religion',
    prompt: 'كم عدد سور القرآن الكريم؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: '110', correct: false },
      { id: 'b', label: '114', correct: true },
      { id: 'c', label: '120', correct: false },
      { id: 'd', label: '99', correct: false },
    ],
    timeLimitMs: 12000,
  },

  // ═══════════════════════════════════════
  // KNOWLEDGE — Science
  // ═══════════════════════════════════════
  {
    type: 'knowledge',
    subtype: 'science',
    prompt: 'ما هو الغاز الأكثر وفرة في الغلاف الجوي للأرض؟',
    difficulty: 'normal',
    choices: [
      { id: 'a', label: 'الأكسجين', correct: false },
      { id: 'b', label: 'النيتروجين', correct: true },
      { id: 'c', label: 'ثاني أكسيد الكربون', correct: false },
      { id: 'd', label: 'الهيدروجين', correct: false },
    ],
    timeLimitMs: 14000,
  },
  {
    type: 'knowledge',
    subtype: 'science',
    prompt: 'ما هو أقرب كوكب إلى الشمس؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: 'الزهرة', correct: false },
      { id: 'b', label: 'عطارد', correct: true },
      { id: 'c', label: 'الأرض', correct: false },
      { id: 'd', label: 'المريخ', correct: false },
    ],
    timeLimitMs: 12000,
  },
  {
    type: 'knowledge',
    subtype: 'science',
    prompt: 'وحدة قياس القوة هي؟',
    difficulty: 'normal',
    choices: [
      { id: 'a', label: 'جول', correct: false },
      { id: 'b', label: 'نيوتن', correct: true },
      { id: 'c', label: 'واط', correct: false },
      { id: 'd', label: 'باسكال', correct: false },
    ],
    timeLimitMs: 13000,
  },

  // ═══════════════════════════════════════
  // KNOWLEDGE — Sports / Art / Cooking
  // ═══════════════════════════════════════
  {
    type: 'knowledge',
    subtype: 'sports',
    prompt: 'من فاز بكأس العالم 2022؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: 'فرنسا', correct: false },
      { id: 'b', label: 'الأرجنتين', correct: true },
      { id: 'c', label: 'البرازيل', correct: false },
      { id: 'd', label: 'المغرب', correct: false },
    ],
    timeLimitMs: 10000,
  },
  {
    type: 'knowledge',
    subtype: 'sports',
    prompt: 'كم عدد لاعبي كرة القدم في الفريق الواحد داخل الملعب؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: '10', correct: false },
      { id: 'b', label: '11', correct: true },
      { id: 'c', label: '12', correct: false },
      { id: 'd', label: '9', correct: false },
    ],
    timeLimitMs: 10000,
  },
  {
    type: 'knowledge',
    subtype: 'art',
    prompt: 'من رسم لوحة الموناليزا؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: 'فان جوخ', correct: false },
      { id: 'b', label: 'ليوناردو دا فينشي', correct: true },
      { id: 'c', label: 'بيكاسو', correct: false },
      { id: 'd', label: 'مايكل أنجلو', correct: false },
    ],
    timeLimitMs: 12000,
  },
  {
    type: 'knowledge',
    subtype: 'cooking',
    prompt: 'ما المكون الرئيسي في طبق الكشري المصري؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: 'الأرز والعدس', correct: true },
      { id: 'b', label: 'اللحم', correct: false },
      { id: 'c', label: 'الدجاج', correct: false },
      { id: 'd', label: 'السمك', correct: false },
    ],
    timeLimitMs: 12000,
  },
  {
    type: 'knowledge',
    subtype: 'cooking',
    prompt: 'من أي بلد يأتي طبق «الحمص» الشهير؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: 'المغرب', correct: false },
      { id: 'b', label: 'بلاد الشام', correct: true },
      { id: 'c', label: 'الخليج', correct: false },
      { id: 'd', label: 'السودان', correct: false },
    ],
    timeLimitMs: 12000,
  },
  {
    type: 'knowledge',
    subtype: 'general',
    prompt: 'كم عدد قارات العالم؟',
    difficulty: 'easy',
    choices: [
      { id: 'a', label: '5', correct: false },
      { id: 'b', label: '7', correct: true },
      { id: 'c', label: '6', correct: false },
      { id: 'd', label: '8', correct: false },
    ],
    timeLimitMs: 10000,
  },
];

function toChallenge(item: BankItem, index: number): Challenge {
  return {
    id: `local-${item.type}-${index}`,
    type: item.type,
    subtype: item.subtype,
    prompt: item.prompt,
    difficulty: item.difficulty,
    choices: item.choices?.map(({ id, label }) => ({ id, label })),
    letterPool: item.letterPool,
    timeLimitMs: item.timeLimitMs,
    version: 1,
  };
}

/** Get a deterministic sequence of 5 challenges for a match */
export function buildMatchChallenges(seed: number): Challenge[] {
  const sequence: ChallengeType[] = ['speed', 'knowledge', 'words', 'speed', 'mystery'];
  const result: Challenge[] = [];

  for (let i = 0; i < 5; i++) {
    const desiredType = sequence[i];
    let pool = BANK.filter((b) => b.type === desiredType);

    if (desiredType === 'mystery') {
      pool = BANK;
    }

    if (pool.length === 0) pool = BANK;

    const idx = Math.abs(seed + i * 17) % pool.length;
    result.push(toChallenge(pool[idx], BANK.indexOf(pool[idx])));
  }

  return result;
}

/** Server-style validation used by the demo engine */
export function validateAnswer(
  challengeId: string,
  answer: string,
  normalize: (s: string) => string
): { correct: boolean; accepted?: string } {
  const idxMatch = challengeId.match(/-(\d+)$/);
  const index = idxMatch ? parseInt(idxMatch[1], 10) : -1;
  const found = index >= 0 && index < BANK.length ? BANK[index] : null;

  if (!found) {
    return { correct: false };
  }

  if (found.choices) {
    const correctChoice = found.choices.find((c) => c.correct);
    const byId = answer === correctChoice?.id;
    const byLabel = normalize(answer) === normalize(correctChoice?.label ?? '');
    return {
      correct: byId || byLabel,
      accepted: correctChoice?.label,
    };
  }

  if (found.acceptedAnswers) {
    const norm = normalize(answer);
    const match = found.acceptedAnswers.find((a) => normalize(a) === norm);
    return { correct: !!match, accepted: match };
  }

  return { correct: false };
}

export function getBankSize(): number {
  return BANK.length;
}
