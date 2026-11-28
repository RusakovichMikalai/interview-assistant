## 1. Spikes

- [ ] 1.1 Run T-one in sherpa-onnx on a 10-min RU interview recording; record WER and RTF; verify: report file with numbers, decision T-one vs GigaAM v3
- [ ] 1.2 Run Parakeet TDT 0.6B v2 and Moonshine on a 10-min EN recording; verify: report with WER, RTF, finalize latency after end of speech
- [ ] 1.3 Measure TTFT of each preset (Claude fast/deep, DeepSeek, Groq, Cerebras, Ollama) with a 2k-token cached prefix; verify: table with p50/p90 over 20 requests
- [ ] 1.4 Run a warm `claude -p` stream-json process with tools disabled and no `ANTHROPIC_API_KEY`; capture TTFT and the exact limit error and reset-time format; verify: report with sample error payload
- [ ] 1.5 Check capture exclusion on Windows 11, macOS 14 and 15 with Zoom, Teams, Meet (Chrome) full-screen share; verify: screenshots from the receiving side
- [x] 1.6 Check that Electron/Chromium lists PipeWire monitor sources on Ubuntu 24.04 and Fedora; verify: note with result, decide on native addon
- [ ] 1.7 Check mDNS discovery between two laptops on home Wi-Fi and a guest corporate network; verify: note with result

## 2. Project skeleton

- [x] 2.1 Create Electron + TypeScript project with main, renderer, utility process and electron-builder targets for win, mac, linux; verify: installers build in CI for all three OS
- [x] 2.2 Add settings store (mode, language, profiles, hotkeys) without secrets; verify: unit test that saved settings JSON contains no key values
- [x] 2.3 Add secret storage via `safeStorage`; verify: unit test round-trip and absence of the key in logs

## 3. Usage modes

- [x] 3.1 Mode selector with per-OS availability (no ALL-IN-ONE on Linux) and lock during session; verify: unit tests for availability matrix and lock
- [ ] 3.2 HOST tray-only mode without hint window; verify: manual check on each OS, documented in README

## 4. Audio capture

- [ ] 4.1 Native capture addon for Windows (WASAPI loopback, per-process when available) and mic; verify: integration test writes 10 s of both channels to WAV
- [ ] 4.2 Native capture for macOS (Process Taps, ScreenCaptureKit fallback) and mic; verify: same WAV test on macOS 14 and 15
- [x] 4.3 Linux capture from PipeWire/Pulse monitor source and mic; verify: same WAV test on Ubuntu
- [ ] 4.4 AEC on mic channel with loopback reference; verify: speaker playback test, interviewer speech not transcribed as "Me"
- [x] 4.5 Pre-interview check with level meters and silent-channel warning; verify: unit test for silence detection, manual UI check

## 5. Speech recognition

- [ ] 5.1 STT utility process with sherpa-onnx, Silero VAD, partial and final events; verify: test on recorded audio, final within 500 ms on reference hardware
- [x] 5.2 Model download with checksum and per-language loading; verify: test that only the selected model is loaded and start is blocked when missing
- [x] 5.3 Interviewer-channel priority scheduling; verify: load test with both channels, interviewer finals not delayed
- [ ] 5.4 Offline check; verify: session with network disabled keeps transcribing

## 6. LLM routing

- [x] 6.1 Profile model, presets, CRUD UI and "Test" button with TTFT; verify: unit tests for presets, manual test against one API
- [x] 6.2 Adapters `anthropic` and `openai-compatible` with streaming and abort; verify: tests with a mock server
- [x] 6.3 `claude-subscription` adapter: warm CLI process, env without `ANTHROPIC_API_KEY`, login detection, restart on crash; verify: tests with a fake CLI binary
- [x] 6.4 Router: health states, failover on limit and error, LIMITED until reset; verify: unit tests for each transition with fake clocks
- [x] 6.5 Hedging: adaptive threshold (800 ms start, p90 of 20, cap 1500 ms), first-token wins, loser abort, no mixing, SLOW after 3 lost races for 5 min; verify: unit tests with controllable fake adapters
- [x] 6.6 Mandatory backup when subscription is primary; verify: test that session start is refused
- [x] 6.7 Source and health indicator in overlay; verify: UI test shows `SUB`, `API`, `API (limit)`
- [x] 6.8 Fast/deep chains with hotkey switch; verify: test that next request uses the selected chain

## 7. Answer hints

- [x] 7.1 Context loader for CV, vacancy, notes; included as cached prefix; verify: unit test of prompt assembly
- [x] 7.2 Trigger modes and hotkey; `NONE` handling keeps previous hint; verify: unit tests per mode
- [x] 7.3 Speculative start at 300 ms silence with cancel on resumed speech; verify: test with scripted VAD events
- [x] 7.4 Streaming bullets overlay, transcript with roles, history, session delete; verify: UI test and test that delete removes files
- [x] 7.5 End-to-end latency metric (end of HR speech -> first token on screen) logged per hint; verify: p50 within 1.8 s on reference setup

## 8. Capture invisibility

- [x] 8.1 Hide toggle and hotkey with `setContentProtection`, state shown in window; disabled with message on Linux; verify: manual share test on Windows and macOS
- [ ] 8.2 Skip taskbar, switcher hiding, always on top, click-through, opacity; verify: manual check per OS
- [ ] 8.3 Focus-free global hotkeys for all in-session actions; verify: manual test that call window keeps focus
- [x] 8.4 Self-check via screen capture and pixel diff; verify: test reports visible when protection is off

## 9. Pairing (HOST / VIEWER)

- [x] 9.1 Pairing by QR and 6-digit code, 5-min expiry, one-time use, key pinning; verify: unit tests for expiry and reuse
- [ ] 9.2 mDNS discovery and manual IP; verify: manual test on LAN
- [ ] 9.3 WebRTC with two Opus tracks, DTLS-SRTP, reject unpaired peers; verify: test that unpaired peer gets no media
- [x] 9.4 Link state, delay indicator, auto-reconnect, gap marker; verify: test with 10 s network drop

## 10. VIEWER-SOLO

- [ ] 10.1 Diarization on single mixed input and one-click "Me" mapping; verify: test on a two-speaker recording

## 11. Integration

- [ ] 11.1 Full mock interview in ALL-IN-ONE on Windows and macOS with screen share; verify: hints shown, window invisible on receiver side, latency log within target
- [ ] 11.2 Full mock interview in HOST + VIEWER (Linux VIEWER); verify: hints shown on VIEWER, nothing on HOST screen
- [ ] 11.3 Subscription limit and outage drill during a session; verify: hints continue from backup, overlay shows `API (limit)`
