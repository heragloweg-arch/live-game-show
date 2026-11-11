-- P0: unify the production golden path around server-approved letter pools.
-- The answer key remains server-only; clients receive only shuffled letters.

WITH answer_source AS (
  SELECT DISTINCT ON (c.id)
    c.id,
    regexp_replace(a.normalized_answer, '[[:space:]]', '', 'g') AS answer
  FROM public.challenges AS c
  JOIN public.challenge_answers AS a ON a.challenge_id = c.id
  WHERE c.active = true
    AND c.qa_status = 'approved'
    AND (c.letter_pool IS NULL OR cardinality(c.letter_pool) = 0)
    AND char_length(regexp_replace(a.normalized_answer, '[[:space:]]', '', 'g')) > 0
  ORDER BY c.id, a.id
), choice_source AS (
  SELECT DISTINCT ON (c.id)
    c.id,
    regexp_replace(public.normalize_question_answer(cc.label), '[[:space:]]', '', 'g') AS answer
  FROM public.challenges AS c
  JOIN public.challenge_choices AS cc ON cc.challenge_id = c.id AND cc.is_correct = true
  WHERE c.active = true
    AND c.qa_status = 'approved'
    AND (c.letter_pool IS NULL OR cardinality(c.letter_pool) = 0)
    AND NOT EXISTS (SELECT 1 FROM answer_source AS a WHERE a.id = c.id)
    AND char_length(regexp_replace(public.normalize_question_answer(cc.label), '[[:space:]]', '', 'g')) > 0
  ORDER BY c.id, cc.choice_id
), source AS (
  SELECT id, answer FROM answer_source
  UNION ALL
  SELECT id, answer FROM choice_source
)
UPDATE public.challenges AS c
SET max_length = char_length(source.answer),
    letter_pool = regexp_split_to_array(source.answer, '')
FROM source
WHERE c.id = source.id;

COMMENT ON COLUMN public.challenges.letter_pool IS
  'Shuffled client hint for the unified letter-answer interaction; accepted answers remain service-role only.';

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM public.challenges
  WHERE active = true
    AND qa_status = 'approved'
    AND (letter_pool IS NULL OR cardinality(letter_pool) = 0 OR max_length IS NULL OR max_length < 1);
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'letter answer contract remains invalid for % approved active challenges', invalid_count;
  END IF;
END $$;
