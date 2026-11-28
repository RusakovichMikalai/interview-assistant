// Linux audio capture (audio-capture spec, task 4.3). Chromium/getUserMedia does
// not expose PipeWire monitor sources (spike 1.6), so the system-output channel
// is captured with the PipeWire/Pulse stack's own recorder spawned as a child
// process emitting raw PCM; the mic channel uses the same path. Design D2 asked
// for an N-API addon - a child-process recorder meets the same spec without the
// native build glue (see spike 1.6 note and D2 update).
// shortcut: whole-source capture only, no per-process (single-app) interviewer
// source; upgrade to a native libpipewire addon if that becomes a hard requirement.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";
import type { ChannelKind } from "./precheck";

export interface PcmFormat {
  /** Samples per second. 16 kHz is what the STT process consumes (design D2). */
  rate: number;
  /** 1 = mono. */
  channels: number;
  /** Sample width; s16le only. */
  bits: 16;
}

export const STT_FORMAT: PcmFormat = { rate: 16000, channels: 1, bits: 16 };

export interface LinuxSource {
  /** PulseAudio/PipeWire source name, e.g. alsa_output.pci-....analog-stereo.monitor */
  name: string;
  /** true for a sink monitor (system output), false for a real input (mic). */
  monitor: boolean;
}

/** Parse `pactl list sources short` into named sources, flagging sink monitors. */
export function parseSources(text: string): LinuxSource[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[1]) // columns: index NAME driver sample-spec state
    .filter((name): name is string => Boolean(name) && name !== "-")
    .map((name) => ({ name, monitor: name.endsWith(".monitor") }));
}

/**
 * Pick the capture source for a channel: a monitor for the interviewer (system
 * output), a non-monitor input for the candidate (mic).
 * shortcut: first match wins; explicit per-channel device choice is renderer UI
 * (deferred to integration, like the pre-interview check).
 */
export function pickSource(sources: LinuxSource[], kind: ChannelKind): LinuxSource | undefined {
  return sources.find((s) => (kind === "system" ? s.monitor : !s.monitor));
}

export interface Recorder {
  /** Raw headerless PCM (s16le, STT_FORMAT) from the source. */
  pcm: Readable;
  proc: ChildProcessWithoutNullStreams;
  /** Stop capture and release the source. */
  stop(): void;
}

/** Spawn `parecord` on a source, emitting raw PCM on stdout. */
export function recordPcm(source: string, fmt: PcmFormat = STT_FORMAT): Recorder {
  // parecord ships with the PipeWire/Pulse stack (pipewire-pulse); --raw omits
  // the WAV header, no file arg -> stdout.
  const proc = spawn("parecord", [
    `--device=${source}`,
    "--format=s16le",
    `--rate=${fmt.rate}`,
    `--channels=${fmt.channels}`,
    "--raw",
  ]);
  return { proc, pcm: proc.stdout, stop: () => void proc.kill("SIGTERM") };
}

/** Canonical 44-byte WAV header for PCM of this format and data length. */
export function wavHeader(dataLen: number, fmt: PcmFormat = STT_FORMAT): Buffer {
  const { rate, channels, bits } = fmt;
  const blockAlign = (channels * bits) / 8;
  const b = Buffer.alloc(44);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + dataLen, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); // PCM fmt chunk size
  b.writeUInt16LE(1, 20); // audioFormat = PCM
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * blockAlign, 28); // byte rate
  b.writeUInt16LE(blockAlign, 32);
  b.writeUInt16LE(bits, 34);
  b.write("data", 36);
  b.writeUInt32LE(dataLen, 40);
  return b;
}
