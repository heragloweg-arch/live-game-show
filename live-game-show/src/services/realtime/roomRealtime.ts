/**
 * Supabase Realtime for live rooms — primary path.
 * Falls back to light participant refresh if channel fails.
 */
import { supabase } from '../supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RoomRealtimeHandlers {
  onRoomUpdate?: (row: Record<string, unknown>) => void;
  onParticipantChange?: () => void;
  onRoundChange?: () => void;
  onError?: (err: Error) => void;
}

export function startRoomRealtime(
  roomId: string,
  handlers: RoomRealtimeHandlers
): () => void {
  let channel: RealtimeChannel | null = null;
  let stopped = false;

  try {
    channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            handlers.onRoomUpdate?.(payload.new as Record<string, unknown>);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${roomId}`,
        },
        () => handlers.onParticipantChange?.()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_rounds',
          filter: `room_id=eq.${roomId}`,
        },
        () => handlers.onRoundChange?.()
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          handlers.onError?.(new Error('Room realtime channel error'));
        }
      });
  } catch (e) {
    handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
  }

  return () => {
    stopped = true;
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };
}
