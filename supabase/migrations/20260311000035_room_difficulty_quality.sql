-- Rooms carry a difficulty contract so Host cannot bypass production content rules.
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS difficulty public.difficulty_level NOT NULL DEFAULT 'normal';
CREATE INDEX IF NOT EXISTS idx_rooms_difficulty ON public.rooms(difficulty);
