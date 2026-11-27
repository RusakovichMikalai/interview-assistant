// Offline capability split (speech-recognition spec, task 5.4). Transcription runs
// entirely on-device, so it depends only on the local model, never on the network.
// Only answer hints (network LLM, answer-hints spec) need connectivity. With the
// network down a session keeps transcribing; hints are what degrade.

export interface SessionCapabilities {
  /** Local STT; true when the selected model is ready, regardless of connectivity. */
  canTranscribe: boolean;
  /** Network LLM hints; true only while online. */
  canHint: boolean;
}

export function sessionCapabilities(opts: { online: boolean; modelReady: boolean }): SessionCapabilities {
  return { canTranscribe: opts.modelReady, canHint: opts.online };
}
