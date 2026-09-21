-- Daily: letter pool → extract 3 words
-- Seed challenges with rich letter pools + multiple accepted answers

INSERT INTO public.challenges (
  id, type, subtype, prompt, difficulty, time_limit_ms, active, qa_status, weight, letter_pool, validation_mode
) VALUES
(
  'd0000001-0000-4000-8000-000000000001',
  'speed',
  'letters',
  'من الحروف التالية: كوّن 3 كلمات عربية صحيحة (أسماء أو أفعال شائعة)',
  'normal',
  90000,
  true,
  'approved',
  10,
  ARRAY['م','د','ر','س','ة','ك','ت','ا','ب','و','ل','ع','ب','ن'],
  'open_speed'
),
(
  'd0000001-0000-4000-8000-000000000002',
  'speed',
  'letters',
  'استخرج 3 كلمات من هذه الحروف — كل كلمة من حروف موجودة في المجموعة',
  'normal',
  90000,
  true,
  'approved',
  10,
  ARRAY['ش','م','س','ق','م','ر','ن','ج','م','ر','ي','ح','ب','ح','ر'],
  'open_speed'
),
(
  'd0000001-0000-4000-8000-000000000003',
  'words',
  'letters',
  'رتّب الحروف لتكوّن 3 كلمات مختلفة',
  'easy',
  90000,
  true,
  'approved',
  10,
  ARRAY['ب','ي','ت','ب','ا','ب','ش','ب','ا','ك','غ','ر','ف','ة'],
  'open_speed'
)
ON CONFLICT (id) DO UPDATE SET
  prompt = EXCLUDED.prompt,
  letter_pool = EXCLUDED.letter_pool,
  active = true,
  qa_status = 'approved',
  weight = 10;

-- Accepted answers for challenge 1
INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT 'd0000001-0000-4000-8000-000000000001', a, a FROM (VALUES
  ('مدرسة'),('كتاب'),('لعب'),('ولد'),('بنت'),('كرة'),('درس'),('كتب'),('مدرس'),('لعبة')
) AS v(a)
ON CONFLICT DO NOTHING;

INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT 'd0000001-0000-4000-8000-000000000002', a, a FROM (VALUES
  ('شمس'),('قمر'),('نجم'),('ريح'),('بحر'),('سمر'),('مرح')
) AS v(a)
ON CONFLICT DO NOTHING;

INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT 'd0000001-0000-4000-8000-000000000003', a, a FROM (VALUES
  ('بيت'),('باب'),('شباك'),('غرفة'),('تراب'),('بائع')
) AS v(a)
ON CONFLICT DO NOTHING;

-- Reset today's daily row so next get_today can prefer letter-pool (optional manual)
-- DELETE FROM public.daily_challenges WHERE challenge_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date;

