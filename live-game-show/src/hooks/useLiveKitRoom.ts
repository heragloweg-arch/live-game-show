/**
 * Production LiveKit room hook.
 * Connects with server-issued token; manages mic + participants.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteParticipant,
  type LocalParticipant,
} from 'livekit-client';
import { fetchLiveKitToken, type LiveKitCredentials } from '../services/livekit/voiceApi';

export interface VoiceParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isHost?: boolean;
}

export type VoiceStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export function useLiveKitRoom() {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [creds, setCreds] = useState<LiveKitCredentials | null>(null);

  const syncParticipants = useCallback((room: Room) => {
    const list: VoiceParticipant[] = [];

    const push = (p: LocalParticipant | RemoteParticipant, isLocal: boolean) => {
      const micPub = p.getTrackPublication(Track.Source.Microphone);
      list.push({
        identity: p.identity,
        name: p.name || p.identity.slice(0, 8),
        isLocal,
        isSpeaking: p.isSpeaking,
        isMuted: isLocal
          ? !(p as LocalParticipant).isMicrophoneEnabled
          : micPub?.isMuted ?? true,
      });
    };

    if (room.localParticipant) push(room.localParticipant, true);
    room.remoteParticipants.forEach((p) => push(p, false));
    setParticipants(list);
  }, []);

  const connect = useCallback(
    async (roomId: string, canPublish = false) => {
      setError(null);
      setStatus('connecting');

      try {
        const credentials = await fetchLiveKitToken(roomId, canPublish);
        setCreds(credentials);

        // Cleanup previous
        if (roomRef.current) {
          await roomRef.current.disconnect();
          roomRef.current = null;
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
        room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room));
        room.on(RoomEvent.ActiveSpeakersChanged, () => syncParticipants(room));
        room.on(RoomEvent.TrackMuted, () => syncParticipants(room));
        room.on(RoomEvent.TrackUnmuted, () => syncParticipants(room));
        room.on(RoomEvent.LocalTrackPublished, () => syncParticipants(room));
        room.on(RoomEvent.LocalTrackUnpublished, () => syncParticipants(room));
        room.on(RoomEvent.Disconnected, () => {
          setStatus('disconnected');
          setParticipants([]);
        });
        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Connected) setStatus('connected');
          if (state === ConnectionState.Disconnected) setStatus('disconnected');
        });

        await room.connect(credentials.url, credentials.token);

        // Start with mic muted for safety
        await room.localParticipant.setMicrophoneEnabled(false);
        setIsMuted(true);

        roomRef.current = room;
        setStatus('connected');
        syncParticipants(room);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus('error');
      }
    },
    [syncParticipants]
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== 'connected') return;

    const next = !isMuted;
    // next=true means we want muted
    await room.localParticipant.setMicrophoneEnabled(!next);
    setIsMuted(next);
    syncParticipants(room);
  }, [isMuted, status, syncParticipants]);

  const setMuted = useCallback(
    async (muted: boolean) => {
      const room = roomRef.current;
      if (!room || status !== 'connected') return;
      await room.localParticipant.setMicrophoneEnabled(!muted);
      setIsMuted(muted);
      syncParticipants(room);
    },
    [status, syncParticipants]
  );

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    setStatus('idle');
    setParticipants([]);
    setCreds(null);
    setIsMuted(true);
  }, []);

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  return {
    status,
    error,
    participants,
    isMuted,
    creds,
    connect,
    disconnect,
    toggleMute,
    setMuted,
    isConnected: status === 'connected',
  };
}
