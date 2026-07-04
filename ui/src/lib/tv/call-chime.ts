/**
 * Procedural call chime (Web Audio API) — no bundled audio file, no licensing.
 *
 * Kiosk TVs have no touch input. Browsers block Web Audio until user gesture;
 * `primeCallAudio` uses muted HTML autoplay (allowed) then resumes AudioContext.
 */

/** Minimal valid WAV (single silent sample). */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let audioContext: AudioContext | null = null;
let primeAudioElement: HTMLAudioElement | null = null;
let unlocked = false;
let pendingChime = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  audioContext ??= new AudioContext();
  return audioContext;
}

export function isCallAudioUnlocked(): boolean {
  return unlocked;
}

export async function unlockCallAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) {
    return false;
  }

  try {
    await ctx.resume();
    unlocked = ctx.state === 'running';
  } catch {
    unlocked = false;
  }

  if (unlocked && pendingChime) {
    pendingChime = false;
    playCallChime();
  }

  return unlocked;
}

/** Unlock audio on kiosk displays without touch (muted autoplay + Web Audio resume). */
export async function primeCallAudio(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    primeAudioElement ??= new Audio(SILENT_WAV);
    primeAudioElement.muted = true;
    primeAudioElement.setAttribute('playsinline', '');
    await primeAudioElement.play();
    primeAudioElement.pause();
    primeAudioElement.currentTime = 0;
  } catch {
    // Strict autoplay policies may still reject even muted play — try Web Audio resume anyway.
  }

  return unlockCallAudio();
}

/** Keep call audio primed across visibility changes; optional pointer fallback. */
export function mountCallAudioPriming(): () => void {
  void primeCallAudio();

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void primeCallAudio();
    }
  };

  const unlockOnInteraction = () => {
    void unlockCallAudio();
  };

  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerdown', unlockOnInteraction, { passive: true });

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerdown', unlockOnInteraction);
  };
}

function playPartial(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startAt: number,
  peakGain: number,
  decaySeconds: number,
): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + decaySeconds);
  gain.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startAt);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.978, startAt + 0.18);
  osc.connect(gain);
  osc.start(startAt);
  osc.stop(startAt + decaySeconds + 0.05);
}

function playGongStrike(ctx: AudioContext, startAt: number, intensity: number): void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(intensity, startAt);
  master.connect(ctx.destination);

  playPartial(ctx, master, 329.63, startAt, 0.72, 2.8);
  playPartial(ctx, master, 659.25, startAt + 0.006, 0.28, 2.1);
  playPartial(ctx, master, 987.75, startAt + 0.01, 0.12, 1.4);
}

export function playCallChime(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  if (!unlocked || ctx.state !== 'running') {
    pendingChime = true;
    void primeCallAudio();
    return;
  }

  playGongStrike(ctx, ctx.currentTime, 1);
}

export function callTicketCodes(calls: Array<{ ticketCode: string }>): string[] {
  return calls.map((row) => row.ticketCode);
}

export function findNewCallTickets(previous: Set<string>, current: string[]): string[] {
  return current.filter((ticketCode) => !previous.has(ticketCode));
}
