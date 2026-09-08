let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  audioContext ??= new AudioContext();
  return audioContext;
}

export async function unlockAssistanceChime(): Promise<void> {
  const context = getAudioContext();
  if (!context || context.state === 'running') {
    return;
  }

  try {
    await context.resume();
  } catch {
    // The visual alert remains authoritative if autoplay is blocked.
  }
}

export function playAssistanceChime(): void {
  const context = getAudioContext();
  if (!context || context.state !== 'running') {
    void unlockAssistanceChime();
    return;
  }

  const startAt = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, startAt);
  master.gain.exponentialRampToValueAtTime(0.24, startAt + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.85);
  master.connect(context.destination);

  for (const [frequency, offset] of [
    [659.25, 0],
    [783.99, 0.18],
  ] as const) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);
    oscillator.connect(master);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + 0.55);
  }
}
