type RateLimitResult = {
  allowed?: boolean;
  hits?: number;
  limit?: number;
  window_seconds?: number;
  reset_at?: string;
};

export async function enforceRateLimit(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => any },
  subjectKey: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; resetAt?: string }> {
  const { data, error } = await supabase.rpc('consume_rate_limit_atomic', {
    p_subject_key: subjectKey,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || !data) {
    console.error('[rate-limit] unavailable', { action, error });
    return { allowed: false };
  }
  return { allowed: data.allowed === true, resetAt: data.reset_at };
}
