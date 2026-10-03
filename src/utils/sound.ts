type SoundName = 'correct' | 'wrong' | 'tick' | 'finish' | 'click';

const STORAGE_KEY = 'qaddaha_sound_enabled';

function isEnabled() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) !== '0';
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
}

export function isSoundEnabled() {
  return isEnabled();
}

export function playSound(name: SoundName) {
  if (!isEnabled() || typeof window === 'undefined') return;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;
    const notes: Record<SoundName, { frequencies: number[]; duration: number; gain: number }> = {
      click: { frequencies: [440], duration: 0.045, gain: 0.035 },
      tick: { frequencies: [640], duration: 0.06, gain: 0.025 },
      correct: { frequencies: [523.25, 659.25, 783.99], duration: 0.11, gain: 0.07 },
      wrong: { frequencies: [220, 164.81], duration: 0.14, gain: 0.055 },
      finish: { frequencies: [392, 523.25, 659.25, 783.99], duration: 0.16, gain: 0.08 },
    };
    const note = notes[name];
    note.frequencies.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = name === 'wrong' ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      const start = now + index * (name === 'finish' ? 0.08 : 0.035);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + note.duration + 0.02);
    });
    window.setTimeout(() => void ctx.close(), 700);
  } catch {
    // Audio is an enhancement; gameplay must never depend on it.
  }
}

export type { SoundName };
