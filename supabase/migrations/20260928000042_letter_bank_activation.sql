-- Qaddaha letter-bank preparation.
-- Rows imported by 000041 (version=41) are prepared but remain in review.
-- Every answer remains server-side; clients receive only the shuffled letter_pool.
BEGIN;

-- Keep database answer keys compatible with the Edge Function Arabic normalizer.
CREATE OR REPLACE FUNCTION public.normalize_question_answer(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    lower(
      replace(replace(replace(replace(replace(replace(replace(trim(coalesce(input, '')), 'ـ', ''), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ٱ', 'ا'), 'ى', 'ي'), 'ة', 'ه')
    ),
    '[[:space:]]+', '', 'g'
  );
$$;

-- Turn every structurally eligible imported MCQ into the product's core letter interaction.
UPDATE public.challenges c
SET
  type = CASE WHEN c.type = 'speed' THEN 'speed'::public.challenge_type ELSE 'words'::public.challenge_type END,
  active = false,
  qa_status = 'needs_review',
  max_length = src.answer_length,
  letter_pool = src.letters,
  time_limit_ms = CASE WHEN c.type = 'speed' THEN 7000 ELSE 15000 END,
  updated_at = now()
FROM (
  SELECT c2.id,
         char_length(regexp_replace(cc.label, '[[:space:]]', '', 'g')) AS answer_length,
         ARRAY(
           SELECT letter
           FROM regexp_split_to_table(regexp_replace(cc.label, '[[:space:]]', '', 'g'), '') AS letter
           WHERE letter <> ''
         ) || ARRAY(
           SELECT letter
           FROM regexp_split_to_table(regexp_replace(regexp_replace(o.label, '[[:space:]]', '', 'g'), '[[:punct:]]', '', 'g'), '') AS letter
           WHERE letter <> ''
           LIMIT 2
         ) AS letters
  FROM public.challenges c2
  JOIN public.challenge_choices cc
    ON cc.challenge_id = c2.id AND cc.is_correct = true
  LEFT JOIN LATERAL (
    SELECT label FROM public.challenge_choices x
    WHERE x.challenge_id = c2.id AND x.is_correct = false
    ORDER BY x.choice_id
    LIMIT 1
  ) o ON true
  WHERE c2.version = 41
    AND c2.active = false
    AND c2.qa_status = 'needs_review'
    AND char_length(trim(cc.label)) > 0
) src
WHERE c.id = src.id;

-- Rebuild the closed answer list from the correct option. This is the only answer path
-- used by Solo/1v1/Couple/Room; choice correctness remains inaccessible to clients.
INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT c.id,
       cc.label,
       public.normalize_question_answer(cc.label)
FROM public.challenges c
JOIN public.challenge_choices cc
  ON cc.challenge_id = c.id AND cc.is_correct = true
WHERE c.version = 41
  AND c.active = false
  AND c.qa_status = 'needs_review'
  AND NOT EXISTS (
    SELECT 1 FROM public.challenge_answers a
    WHERE a.challenge_id = c.id
      AND a.normalized_answer = public.normalize_question_answer(cc.label)
  );

-- Bring older approved choice-based content into the same letter contract.
-- This keeps one answer interaction across the entire product, not only the new bank.
UPDATE public.challenges c
SET
  type = CASE WHEN c.type = 'speed' THEN 'speed'::public.challenge_type ELSE 'words'::public.challenge_type END,
  max_length = src.answer_length,
  letter_pool = src.letters,
  updated_at = now()
FROM (
  SELECT c2.id,
         char_length(regexp_replace(cc.label, '[[:space:]]', '', 'g')) AS answer_length,
         ARRAY(
           SELECT letter FROM regexp_split_to_table(regexp_replace(cc.label, '[[:space:]]', '', 'g'), '') AS letter
           WHERE letter <> ''
         ) AS letters
  FROM public.challenges c2
  JOIN public.challenge_choices cc ON cc.challenge_id = c2.id AND cc.is_correct = true
  WHERE c2.active = true AND c2.qa_status = 'approved'
    AND (c2.letter_pool IS NULL OR cardinality(c2.letter_pool) = 0)
) src
WHERE c.id = src.id;

INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT c.id,
       cc.label,
       lower(regexp_replace(trim(cc.label), '[[:space:]]', '', 'g'))
FROM public.challenges c
JOIN public.challenge_choices cc ON cc.challenge_id = c.id AND cc.is_correct = true
WHERE c.active = true AND c.qa_status = 'approved'
  AND c.letter_pool IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.challenge_answers a
    WHERE a.challenge_id = c.id
      AND a.normalized_answer = public.normalize_question_answer(cc.label)
  );

-- Imported choices are retained only as server-side audit data. Production clients must
-- never receive them from match/room functions after the code update in this release.
CREATE INDEX IF NOT EXISTS idx_challenges_letter_bank_selection
  ON public.challenges(active, qa_status, difficulty, subtype, type)
  WHERE active = true AND qa_status = 'approved' AND letter_pool IS NOT NULL;

COMMIT;
