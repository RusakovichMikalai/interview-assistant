## Purpose

Lets the user choose how the assistant is deployed for an interview: on the interview machine itself, or on a second desktop device that receives or hears the interview audio.

## ADDED Requirements

### Requirement: Usage mode selection
The application SHALL let the user pick exactly one usage mode in settings: ALL-IN-ONE, HOST, VIEWER or VIEWER-SOLO. The selected mode SHALL persist between launches and SHALL be changeable only while no interview session is running.

#### Scenario: Mode persists
- **WHEN** the user selects VIEWER and restarts the application
- **THEN** the application starts in VIEWER mode

#### Scenario: Mode locked during a session
- **WHEN** an interview session is running
- **THEN** the mode selector is disabled and shows that the session must be stopped first

### Requirement: Per-OS mode availability
The application SHALL offer only modes supported on the current OS. ALL-IN-ONE SHALL NOT be offered on Linux, because the window cannot be excluded from screen capture there. HOST, VIEWER and VIEWER-SOLO SHALL be offered on Windows, macOS and Linux.

#### Scenario: Linux hides ALL-IN-ONE
- **WHEN** the application runs on Linux
- **THEN** ALL-IN-ONE is not selectable and a hint explains why and suggests HOST + VIEWER

#### Scenario: Windows offers all modes
- **WHEN** the application runs on Windows
- **THEN** all four modes are selectable

### Requirement: HOST mode is a background agent
In HOST mode the application SHALL run without a hint window, as a tray icon only, and SHALL only capture and stream audio to a paired VIEWER.

#### Scenario: HOST shows no hints
- **WHEN** the application runs in HOST mode during an interview
- **THEN** no transcript or hint window is shown on the HOST machine

### Requirement: Mobile platforms excluded
The application SHALL target desktop operating systems only; no phone or tablet client is provided.

#### Scenario: Desktop only build targets
- **WHEN** release artifacts are built
- **THEN** they contain installers for Windows, macOS and Linux only
