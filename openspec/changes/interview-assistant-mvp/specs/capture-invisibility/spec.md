## Purpose

Keeps the assistant window off the interviewer's screen when the candidate shares the screen on the same machine, and lets the candidate control it without visible window switching.

## ADDED Requirements

### Requirement: Hide from capture toggle
The application SHALL provide a toggle button and a global hotkey that exclude all assistant windows from screen sharing and screen recording on Windows and macOS. The current state SHALL be visible in the window itself.

#### Scenario: Shared screen on Windows
- **WHEN** the toggle is on and the candidate shares the entire screen in a call
- **THEN** the interviewer sees the content behind the assistant window, not the window

#### Scenario: Toggle off
- **WHEN** the user turns the toggle off
- **THEN** the window becomes capturable again

### Requirement: Unsupported OS warning
On an OS or OS version where capture exclusion is not available or cannot be verified, the application SHALL NOT claim the window is hidden and SHALL recommend the HOST + VIEWER mode.

#### Scenario: Linux
- **WHEN** the application runs a hint window on Linux
- **THEN** the toggle is disabled with the text that hiding is not supported on this OS

### Requirement: Low-visibility window behavior
When hiding is on, the window SHALL be absent from the taskbar/dock and the window switcher, SHALL stay on top, SHALL support click-through and adjustable opacity.

#### Scenario: Click-through
- **WHEN** click-through is enabled
- **THEN** mouse clicks pass to the window underneath

### Requirement: Focus-free control
All in-session actions (request hint, switch fast/deep, scroll hints, toggle hiding, click-through) SHALL be available through global hotkeys that do not move focus away from the call application.

#### Scenario: Hint by hotkey
- **WHEN** the user presses the hint hotkey while the call window is focused
- **THEN** a hint is requested and the call window keeps focus

### Requirement: Self-check
The application SHALL offer a self-check that captures the screen through the OS capture API and reports whether the assistant window appears in it.

#### Scenario: Self-check fails
- **WHEN** the window is visible in the self-check capture
- **THEN** the application reports that hiding does not work on this system
