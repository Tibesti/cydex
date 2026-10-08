// Chime for notifications that arrive while the app is open (push
// notifications on a closed app use the phone's own sound; see public/sw.js).
// Made with Web Audio, so there's no sound file to load.

// Need attention straight away: a longer, louder chime (keep in step with public/sw.js)
export const URGENT_NOTIFICATION_TYPES = new Set([
  'new_order', // vendor
  'order_nearby', // rider
  'assigned_by_admin', // rider
  'payout_request', // admin
  'verification_request', // admin
]);

let ctx: AudioContext | null = null;

const audioContext = () => {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
};

// Browsers only allow sound after the person has tapped or typed on the page:
// wake the audio up on the first interaction so later chimes can play
export const unlockNotificationSound = () => {
  const wake = () => {
    void audioContext()?.resume();
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  return wake;
};

const tone = (ac: AudioContext, freq: number, start: number, length: number, volume: number) => {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
};

export const playNotificationSound = (type?: string) => {
  try {
    const ac = audioContext();
    if (!ac || ac.state !== 'running') return; // not unlocked yet: stay quiet rather than error
    const t = ac.currentTime + 0.01;
    if (type && URGENT_NOTIFICATION_TYPES.has(type)) {
      // Three rising notes, repeated once
      [0, 0.6].forEach((offset) => {
        tone(ac, 784, t + offset, 0.18, 0.35); // G5
        tone(ac, 988, t + offset + 0.15, 0.18, 0.35); // B5
        tone(ac, 1319, t + offset + 0.3, 0.28, 0.35); // E6
      });
    } else {
      tone(ac, 880, t, 0.16, 0.2); // A5
      tone(ac, 1175, t + 0.13, 0.26, 0.2); // D6
    }
    navigator.vibrate?.(type && URGENT_NOTIFICATION_TYPES.has(type) ? [200, 100, 200] : 120);
  } catch {
    // Sound is a nice-to-have; never let it break notifications
  }
};
