-- Qaddaha playable question contract.
-- Every active challenge must have a prompt, a server-side accepted answer,
-- and a deterministic answer hint for the letter interaction.

UPDATE public.challenges AS c
SET active = false,
    disabled_reason = COALESCE(c.disabled_reason, 'missing_playable_question_contract'),
    reviewed_at = COALESCE(c.reviewed_at, now())
WHERE c.active = true
  AND (
    c.prompt IS NULL
    OR char_length(btrim(c.prompt)) < 8
    OR NOT EXISTS (
      SELECT 1 FROM public.challenge_answers AS a
      WHERE a.challenge_id = c.id
        AND char_length(btrim(a.normalized_answer)) > 0
    )
    OR (
      c.letter_pool IS NOT NULL
      AND (
        COALESCE(array_length(c.letter_pool, 1), 0) = 0
        OR c.max_length IS NULL
        OR c.max_length < 1
        OR c.max_length > array_length(c.letter_pool, 1)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_playable_challenge_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active = true THEN
    IF NEW.prompt IS NULL OR char_length(btrim(NEW.prompt)) < 8 THEN
      RAISE EXCEPTION 'active challenge requires a clear prompt of at least 8 characters';
    END IF;
    IF NEW.letter_pool IS NOT NULL AND (
      COALESCE(array_length(NEW.letter_pool, 1), 0) = 0
      OR NEW.max_length IS NULL
      OR NEW.max_length < 1
      OR NEW.max_length > array_length(NEW.letter_pool, 1)
    ) THEN
      RAISE EXCEPTION 'letter challenge requires a valid max_length and letter_pool';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_playable_challenge_contract ON public.challenges;
CREATE TRIGGER trg_enforce_playable_challenge_contract
BEFORE INSERT OR UPDATE OF active, prompt, letter_pool, max_length
ON public.challenges
FOR EACH ROW
EXECUTE FUNCTION public.enforce_playable_challenge_contract();

COMMENT ON FUNCTION public.enforce_playable_challenge_contract() IS
'Prevents activation of malformed prompts and letter challenges without a deterministic answer hint. Server answer rows remain mandatory for release approval.';
