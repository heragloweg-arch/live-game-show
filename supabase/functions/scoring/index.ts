/**
 * Edge Function: scoring
 * POST /functions/v1/scoring
 *
 * Utility / admin endpoint to compute score for a given answer context.
 * Also used for configuration snapshots.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { calculateScore, DEFAULT_SCORING } from '../_shared/scoring.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json();
    const {
      outcome = 'correct',
      responseTimeMs = 3000,
      timeLimitMs = 15000,
      difficulty = 'normal',
      challengeType = 'knowledge',
    } = body;

    const result = calculateScore({
      outcome,
      responseTimeMs,
      timeLimitMs,
      difficulty,
      challengeType,
      config: DEFAULT_SCORING,
    });

    return new Response(
      JSON.stringify({
        ...result,
        config: DEFAULT_SCORING,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
