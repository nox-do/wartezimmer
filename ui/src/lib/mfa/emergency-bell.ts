/**
 * Procedural reception bell (Web Audio API) — no bundled audio file, no licensing.
 */

let audioContext: AudioContext | null = null;
let unlocked = false;
let loopTimer: ReturnType<typeof setInterval> | null = null;
let loopingEmergencyId: string | null = null;

const BELL_LOOP_MS = 2_200;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  audioContext ??= new AudioContext();
  return audioContext;
}

export async function unlockEmergencyBellAudio(): Promise<boolean> {
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

  return unlocked;
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
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + decaySeconds);
  gain.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startAt);
  osc.connect(gain);
  osc.start(startAt);
  osc.stop(startAt + decaySeconds + 0.04);
}

function playBellStrike(ctx: AudioContext, startAt: number, intensity: number): void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(intensity, startAt);
  master.connect(ctx.destination);

  playPartial(ctx, master, 988, startAt, 1, 0.55);
  playPartial(ctx, master, 1482, startAt + 0.002, 0.62, 0.42);
  playPartial(ctx, master, 1976, startAt + 0.004, 0.38, 0.28);
  playPartial(ctx, master, 2630, startAt + 0.006, 0.22, 0.18);
}

export function playEmergencyBell(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  if (!unlocked || ctx.state !== 'running') {
    void unlockEmergencyBellAudio();
    return;
  }

  const now = ctx.currentTime;
  playBellStrike(ctx, now, 1);
  playBellStrike(ctx, now + 0.42, 0.95);
}

export function startEmergencyBellLoop(emergencyId: string): void {
  if (loopingEmergencyId === emergencyId && loopTimer) {
    return;
  }

  stopEmergencyBellLoop();
  loopingEmergencyId = emergencyId;
  playEmergencyBell();
  loopTimer = setInterval(() => {
    playEmergencyBell();
  }, BELL_LOOP_MS);
}

export function stopEmergencyBellLoop(): void {
  loopingEmergencyId = null;
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

export function isEmergencyBellLoopActive(): boolean {
  return loopTimer != null;
}
