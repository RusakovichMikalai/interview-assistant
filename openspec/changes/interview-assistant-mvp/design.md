## Context

New project, see `proposal.md`. One desktop app that captures interview audio, transcribes it locally, labels roles by channel, asks an LLM for short answer hints, and hides itself from screen sharing. It must run on Windows, macOS and Linux and support a second-device setup. Latency is the main quality bar: a hint should start appearing 1.0-1.8 s after the interviewer stops talking.

## Goals / Non-Goals

**Goals:**
- One codebase for Windows, macOS, Linux; usage mode chosen in settings.
- Role separation by channel (mic = candidate, system output = interviewer), no voice-based guessing in the main modes.
- Local, streaming STT with one specialized model per language (RU, EN).
- Pluggable LLM providers, including the user's Claude Pro/Max subscription with automatic API failover and hedging.
- Window excluded from capture on Windows and macOS; HOST + VIEWER as the answer for Linux and for proctored setups.

**Non-Goals:**
- Phone/tablet clients.
- Cloud STT.
- More than two languages, or switching language mid-session.
- Distributing the subscription adapter to other users (personal use only, see Risks).
- Defeating proctoring software or kernel-level capture.
- Meeting bots that join the call.

## Decisions

### D1. Electron as the shell
Electron gives `setContentProtection`, `globalShortcut`, tray, `safeStorage`, utility processes and WebRTC on all three OS from one TypeScript codebase.
- Alternative: Tauri. Smaller binary, but capture exclusion, loopback audio and WebRTC would need more native glue per OS. Rejected for MVP speed.
- Alternative: native per OS. Best control, three codebases. Rejected.

### D2. Audio capture per OS, role by channel
| OS | Interviewer channel | Candidate channel |
| --- | --- | --- |
| Windows | WASAPI loopback (per-process loopback on Win10 2004+) | mic |
| macOS 14.2+ | Core Audio Process Taps; fallback ScreenCaptureKit audio | mic |
| Linux | PipeWire/PulseAudio monitor source | mic |

Native capture lives in a small N-API addon per OS; frames go to the STT process as 16 kHz mono PCM. Echo: WebRTC AEC on the mic channel using the loopback as reference.
- Alternative: virtual audio driver (BlackHole, VB-Cable). Extra install and user routing. Kept only as a VIEWER-SOLO fallback.
- Alternative: diarization on a mixed stream. Slower and less accurate. Used only in VIEWER-SOLO.

### D3. Local STT: sherpa-onnx in a utility process
- sherpa-onnx runtime, Silero VAD for endpointing.
- RU: T-one streaming model; fallback GigaAM v3 (CTC) if T-one is not supported or too slow.
- EN: NVIDIA Parakeet TDT 0.6B v2; fallback Moonshine for weak CPUs.
- Only the selected language model is loaded. Models are downloaded on first use with checksum verification.
- Interviewer stream has scheduling priority; candidate stream is processed when idle.
- Alternative: Whisper family. Not streaming-native, higher latency, weaker per-language accuracy than the specialized models. Rejected.
- Alternative: one multilingual model. Worse on both languages. Rejected per user choice.

### D4. Usage modes and pairing
- ALL-IN-ONE: capture + STT + LLM + overlay on the interview machine (Windows, macOS).
- HOST: tray agent, capture only, sends 2 Opus tracks over WebRTC.
- VIEWER: receives tracks, runs STT + LLM + UI.
- VIEWER-SOLO: no HOST; audio from a cable splitter or room mic, diarization maps speakers.
- Pairing: QR or 6-digit code, mutual key pinning, DTLS-SRTP media, mDNS discovery with manual IP fallback. No relay server in MVP (LAN only).
- Alternative: stream raw PCM over WebSocket. Simpler, no jitter buffer or congestion control. Rejected.

### D5. Hint pipeline
```
HR audio -> VAD -> partial STT --300 ms silence--> speculative LLM request
                                  |                     |
                     speech resumes: cancel        first token -> overlay
```
- Prompt: short system prompt + cached prefix (CV, vacancy, notes) + last N turns + question. Answer 3-5 bullets in session language, or `NONE` when the turn is not a question.
- Trigger modes: hotkey, every HR turn, questions only (model returns `NONE` for non-questions).

### D6. LLM profiles and router
- Profile: name, adapter (`anthropic`, `openai-compatible`, `claude-subscription`), baseURL, model id, key ref, role (fast/deep). Keys stored with Electron `safeStorage`; config holds only a reference.
- Presets: Claude fast `claude-haiku-5-5` (low effort), Claude deep `claude-sonnet-5-5` / `claude-opus-5-5`, DeepSeek, Groq, Cerebras, OpenRouter, Ollama `http://localhost:11434/v1`, Custom.
- Router chain: primary -> backup -> optional backup 2 (Ollama). Health per profile: OK, SLOW, LIMITED (until reset), DOWN.
  - Limit error -> LIMITED until reset (15 min default), route to backup, probe after reset.
  - Crash / network error -> DOWN, route immediately, restart in background.
  - No first token within threshold -> hedge: start backup in parallel; first token wins, loser aborted; streams never mixed.
  - Threshold: 800 ms at start, then p90 of last 20 primary TTFTs, capped at 1500 ms.
  - 3 lost races in a row -> SLOW for 5 min, backup becomes primary.
- Prompt caching enabled on the backup profile so hedged requests stay cheap.
- Alternative: sequential failover only. Adds the full timeout to latency. Rejected; user chose speed over cost.

### D7. Claude subscription adapter
- Uses the locally installed Claude Code CLI logged in with Pro/Max. One warm long-lived process: `claude -p --input-format stream-json --output-format stream-json`, tools disabled, custom short system prompt.
- Child env drops `ANTHROPIC_API_KEY`, otherwise the CLI would bill the API key.
- Login status is checked at startup; option disabled when the CLI is missing or logged out.
- Alternative: Agent SDK with claude.ai login inside the app. Not allowed for third-party products. Rejected.
- Alternative: no subscription support. Rejected per user requirement.

### D8. Capture invisibility
- Windows: `setContentProtection(true)` -> `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`.
- macOS: `setContentProtection(true)` -> `NSWindow.sharingType = .none`.
- Linux: no API; toggle disabled, HOST + VIEWER recommended.
- Plus: skip taskbar, hide from window switcher, always on top, click-through, opacity, global hotkeys that do not take focus. Self-check via `desktopCapturer` screenshot and pixel diff.

## Risks / Trade-offs

- [macOS 15+ may ignore `sharingType = .none` for ScreenCaptureKit captures] -> Self-check on every session start; if visible, warn and recommend HOST + VIEWER.
- [Subscription adapter violates terms if distributed] -> Personal-use build flag; off by default; not shipped in public builds.
- [CLI limit error format and reset time undocumented] -> Spike; default 15 min LIMITED when reset time is unknown.
- [CLI TTFT may be higher than API] -> Hedge with adaptive threshold; source shown per hint.
- [T-one not supported by sherpa-onnx] -> Fallback to GigaAM v3.
- [Chromium/Electron may not see Linux monitor sources] -> Native PipeWire addon.
- [mDNS blocked on corporate Wi-Fi] -> Manual IP entry.
- [Speaker echo mislabels roles] -> AEC with loopback reference; headphones recommended in pre-check.
- [Hedging doubles API spend on slow periods] -> Accepted by user; prompt caching on backup.
- [Use may break interview or employer rules, proctoring may detect the app] -> Notice in onboarding; no anti-proctoring features.

## Migration Plan

New project, nothing to migrate. Rollout: spikes first (tasks group 1), then ALL-IN-ONE on Windows and macOS, then HOST/VIEWER, then Linux, then VIEWER-SOLO. Rollback is per feature flag.

## Open Questions

- Reference hardware for the latency targets (CPU class, RAM). Decide after the STT spike.
- Code signing and notarization accounts for Windows and macOS installers. Needed before the first external build.
