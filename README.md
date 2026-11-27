# Interview Assistant

Desktop app that listens to an interview call, transcribes it locally, labels
roles by audio channel, asks an LLM for short answer hints, and can hide itself
from screen sharing. Windows, macOS, Linux. See `openspec/changes/` for the full
specification.

## Status

Early skeleton. Implemented so far (OpenSpec change `interview-assistant-mvp`,
task group 2): Electron + TypeScript project with main / renderer / utility
processes, settings store (no secrets), and OS-keychain secret storage.

## Develop

```bash
npm install
npm run build     # compile main + renderer, copy assets -> dist/
npm start         # build and launch Electron
npm test          # unit tests (vitest)
npm run typecheck # type-check both tsconfig projects
npm run dist      # build installers for the current OS (electron-builder)
```

## Layout

```
src/main/      Electron main process: window, settings store, secret store, STT supervisor
src/renderer/  UI (hint overlay, settings) - skeleton
src/utility/   STT utility process - skeleton
src/shared/    Types shared across processes (settings schema)
test/          Unit tests
```

## Secrets

API keys are never written to `settings.json`. The settings file holds only a
`keyRef`; the encrypted key lives in a separate file via Electron `safeStorage`
(`SecretStore`). See `src/shared/settings.ts` and `src/main/secret-store.ts`.
