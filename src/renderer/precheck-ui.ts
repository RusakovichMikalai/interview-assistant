// Pre-interview audio check UI (audio-capture spec, task 4.5): live level meters
// for the two channels and the silent-channel warning. Pure DOM painters plus a
// derivation, matching overlay.ts / source-badge.ts. The detector and warning
// text mirror src/main/capture/precheck.ts; they are restated here because the
// renderer tsconfig keeps src/main out of its rootDir. Channel levels arrive from
// the capture layer over IPC when session wiring lands (integration); this layer
// only paints what it is given.

export type ChannelKind = "system" | "mic";

export interface ChannelState {
  kind: ChannelKind;
  /** Device the user selected for this channel, named in the warning. */
  device: string;
  /** RMS amplitude over the check window, 0..1 (0 = pure silence). */
  level: number;
}

/** A channel counts as silent below this RMS level (~-60 dBFS). Mirrors main. */
export const SILENCE_FLOOR = 0.001;

const KIND_LABEL: Record<ChannelKind, string> = {
  system: "Interviewer (system audio)",
  mic: "You (microphone)",
};

/** Warnings for every channel below the floor, naming its device. Mirrors
 *  silentChannelWarnings in src/main/capture/precheck.ts. */
export function silentWarnings(channels: ChannelState[], floor = SILENCE_FLOOR): string[] {
  return channels
    .filter((c) => c.level < floor)
    .map((c) =>
      c.kind === "system"
        ? `System audio is not captured on "${c.device}"`
        : `Microphone is not capturing on "${c.device}"`,
    );
}

/** Paint a labelled level bar per channel. The bar width tracks the RMS level and
 *  `data-silent` flags a channel under the floor so styling can highlight it. */
export function renderMeters(el: HTMLElement, channels: ChannelState[], floor = SILENCE_FLOOR): void {
  el.replaceChildren(
    ...channels.map((c) => {
      const row = document.createElement("div");
      row.className = "meter";
      row.dataset.kind = c.kind;
      row.dataset.silent = String(c.level < floor);

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = KIND_LABEL[c.kind];

      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = `${Math.min(100, Math.round(c.level * 100))}%`;
      bar.append(fill);

      row.append(label, bar);
      return row;
    }),
  );
}

/** Paint the silent-channel warnings, one line each; clears when there are none. */
export function renderWarnings(el: HTMLElement, warnings: string[]): void {
  el.replaceChildren(
    ...warnings.map((w) => {
      const li = document.createElement("li");
      li.className = "warning";
      li.textContent = w;
      return li;
    }),
  );
}
