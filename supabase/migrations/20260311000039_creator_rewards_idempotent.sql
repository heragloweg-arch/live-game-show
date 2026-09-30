-- Creator approval rewards are one-time per submission.
CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_approval_reward
  ON public.wallet_ledger(user_id, reference_id)
  WHERE type = 'creator_approval';
