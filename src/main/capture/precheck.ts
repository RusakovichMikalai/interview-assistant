// Pre-interview audio check (audio-capture spec, task 4.5). The live level meters
// are renderer UI (deferred); this is the pure detector behind them. A channel
// counts as silent when its RMS level stays under the floor, so the check can warn
// that a channel - the interviewer's system audio or the candidate's mic - is not
// being captured, and name the device the user selected for it.

export type ChannelKind = "system" | "mic";

export interface ChannelState {
  kind: ChannelKind;
  /** Device the user selected for this channel, named in the warning. */
  device: string;
  /** RMS amplitude over the check window, 0..1 (0 = pure silence). */
  level: number;
}

/** A channel counts as silent below this RMS level (~-60 dBFS). */
export const SILENCE_FLOOR = 0.001;

/** RMS amplitude of a PCM frame, the value a level meter displays. */
export function channelLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

/** Warnings for every channel whose level is below the floor, naming its device. */
export function silentChannelWarnings(channels: ChannelState[], floor = SILENCE_FLOOR): string[] {
  return channels
    .filter((c) => c.level < floor)
    .map((c) =>
      c.kind === "system"
        ? `System audio is not captured on "${c.device}"`
        : `Microphone is not capturing on "${c.device}"`,
    );
}
