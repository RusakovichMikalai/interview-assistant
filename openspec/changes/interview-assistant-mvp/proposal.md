# Proposal

## Why

During a live job interview the candidate has no time to recall a fitting answer, a STAR story or a technical detail. A desktop assistant that listens to the call, separates the interviewer from the candidate and shows a short answer hint within about 1-2 seconds of an interviewer question closes that gap. The assistant must stay invisible to the interviewer when the candidate shares the screen.

## What Changes

- New cross-platform desktop application (Windows, macOS, Linux; no phones) with a usage mode chosen in settings:
  - ALL-IN-ONE: one machine runs the call and the assistant (not offered on Linux, where the window cannot be hidden from capture).
  - HOST + VIEWER: the interview machine runs a small tray agent that streams its audio to a second desktop device, which does all processing and shows hints.
  - VIEWER-SOLO: the second device hears the call through an audio cable/splitter or a room microphone, with speaker diarization.
- Audio capture from any source: microphone and system output (loopback) as two separate channels, so the role (candidate vs interviewer) follows from the channel.
- Local, low-latency speech recognition with one specialized model per language. Russian and English are supported; the language is chosen in settings before the interview and only that model is loaded.
- Answer hints: when the interviewer finishes a question, the app shows a short answer (3-5 bullets) built from the transcript and the candidate's prepared context (CV, vacancy, STAR stories). Hints start by hotkey, automatically on every interviewer turn, or only for turns detected as questions.
- Selectable LLM providers through profiles: Anthropic API, any OpenAI-compatible API (DeepSeek, OpenAI, OpenRouter, Groq, Cerebras, local Ollama/LM Studio), and the user's own Claude Pro/Max subscription through a locally installed and logged-in Claude Code CLI.
- Automatic failover: when the subscription hits its usage limit, loses connection or answers slowly, requests go to a preconfigured backup API profile; slow answers trigger a parallel (hedged) request and the first answer wins.
- Capture invisibility: a dedicated toggle and hotkey exclude the assistant window from screen sharing and recording where the OS allows it, plus taskbar hiding, click-through and always-on-top.

## Capabilities

### New Capabilities
- `usage-modes`: choosing and switching between ALL-IN-ONE, HOST, VIEWER and VIEWER-SOLO, including per-OS availability.
- `audio-capture`: capturing microphone and system audio as separate role channels on each OS, and the VIEWER-SOLO diarization fallback.
- `device-pairing`: pairing a HOST with a VIEWER and streaming encrypted audio between them.
- `speech-recognition`: local streaming transcription with a per-language model selected in settings.
- `answer-hints`: interviewer question detection, hint triggers, prepared interview context and hint display.
- `llm-routing`: provider profiles, the Claude subscription adapter, secret storage, failover, hedged requests and source indication.
- `capture-invisibility`: hiding the assistant from screen capture and controlling it without stealing focus.

### Modified Capabilities

None (new project).

## Impact

- New repository `interview-assistant`; no existing code is affected.
- New dependencies: a desktop application runtime with native audio capture per OS, a local speech recognition runtime with downloadable RU and EN models, a voice activity detector, a peer-to-peer audio transport for HOST/VIEWER, and HTTP clients for LLM providers.
- External services: LLM provider APIs chosen by the user; optional Claude Code CLI on the user's machine for the subscription adapter.
- Legal and policy: recording consent rules differ by country; employer proctoring tools may detect the assistant. The app shows a one-time notice and does not try to evade proctoring software.
