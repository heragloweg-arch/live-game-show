-- True Speed prompts (letter / name games) — not knowledge disguised as speed

INSERT INTO public.challenges (type, subtype, prompt, difficulty, time_limit_ms, active, qa_status, weight, letter_pool)
VALUES
('speed','letters','اسم بنت من 4 حروف', 'easy', 8000, true, 'approved', 20, NULL),
('speed','letters','اسم ولد يبدأ بحرف ك', 'easy', 8000, true, 'approved', 20, NULL),
('speed','letters','دولة عربية تبدأ بحرف م', 'normal', 8000, true, 'approved', 20, NULL),
('speed','letters','اسم حيوان بحرف س', 'easy', 7000, true, 'approved', 20, NULL),
('speed','letters','اسم أكلة تبدأ بحرف م', 'normal', 8000, true, 'approved', 20, NULL),
('speed','letters','اسم مدينة من 5 حروف', 'normal', 9000, true, 'approved', 18, NULL),
('speed','letters','اسم لاعب يبدأ بحرف م', 'hard', 8000, true, 'approved', 18, NULL),
('speed','letters','اسم لون من 4 حروف', 'easy', 7000, true, 'approved', 20, NULL),
('speed','letters','دولة تنتهي بحرف ن', 'normal', 8000, true, 'approved', 18, NULL),
('speed','letters','كلمة من 3 حروف', 'easy', 6000, true, 'approved', 20, NULL),
('speed','letters','شيء في البيت يبدأ بحرف ب', 'easy', 8000, true, 'approved', 18, NULL),
('speed','letters','اسم فيلم عربي من كلمة واحدة', 'hard', 10000, true, 'approved', 16, NULL),
('speed','letters','عاصمة عربية تبدأ بحرف ب', 'normal', 8000, true, 'approved', 18, NULL),
('speed','letters','اسم نهر معروف', 'normal', 8000, true, 'approved', 16, NULL),
('speed','letters','فاكهة بحرف ت', 'easy', 7000, true, 'approved', 20, NULL)
ON CONFLICT DO NOTHING;

-- Minimal accepted answers for a few (open-ended speed still validated loosely client-side; seed samples)
INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT c.id, a.ans, a.norm
FROM public.challenges c
JOIN (VALUES
  ('اسم بنت من 4 حروف', 'سارة', 'ساره'),
  ('اسم بنت من 4 حروف', 'نور', 'نور'),
  ('اسم ولد يبدأ بحرف ك', 'كريم', 'كريم'),
  ('اسم ولد يبدأ بحرف ك', 'خالد', 'خالد'),
  ('دولة عربية تبدأ بحرف م', 'مصر', 'مصر'),
  ('دولة عربية تبدأ بحرف م', 'المغرب', 'المغرب'),
  ('اسم حيوان بحرف س', 'أسد', 'اسد'),
  ('اسم حيوان بحرف س', 'سمكة', 'سمكه'),
  ('اسم لون من 4 حروف', 'أحمر', 'احمر'),
  ('اسم لون من 4 حروف', 'أزرق', 'ازرق'),
  ('كلمة من 3 حروف', 'بيت', 'بيت'),
  ('كلمة من 3 حروف', 'نار', 'نار'),
  ('فاكهة بحرف ت', 'تفاح', 'تفاح'),
  ('فاكهة بحرف ت', 'تمر', 'تمر'),
  ('دولة تنتهي بحرف ن', 'الأردن', 'الاردن'),
  ('دولة تنتهي بحرف ن', 'السودان', 'السودان'),
  ('عاصمة عربية تبدأ بحرف ب', 'بيروت', 'بيروت'),
  ('عاصمة عربية تبدأ بحرف ب', 'بغداد', 'بغداد')
) AS a(prompt, ans, norm) ON c.prompt = a.prompt AND c.type = 'speed'
ON CONFLICT DO NOTHING;
