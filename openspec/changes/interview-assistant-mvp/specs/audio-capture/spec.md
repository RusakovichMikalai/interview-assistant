## Purpose

Captures the interview audio from any call application and splits it into a candidate channel and an interviewer channel, so roles are known without guessing from voices.

## ADDED Requirements

### Requirement: Two role channels
The application SHALL capture the microphone as the candidate channel and the system audio output as the interviewer channel, as two independent streams. Each transcript segment SHALL carry the role of the channel it came from.

#### Scenario: Interviewer speech is labeled
- **WHEN** audio arrives on the system output channel
- **THEN** its transcript segments are labeled "Interviewer"

#### Scenario: Candidate speech is labeled
- **WHEN** audio arrives on the microphone channel
- **THEN** its transcript segments are labeled "Me"

### Requirement: Source independence
System audio capture SHALL work for any call application (browser, desktop client) without integration with that application. The user SHALL be able to choose the input device and, where the OS supports it, a single application as the interviewer source instead of the whole system output.

#### Scenario: Browser call
- **WHEN** the interview runs in a browser tab
- **THEN** the interviewer channel receives that audio without any browser extension

#### Scenario: Per-application source
- **WHEN** the OS supports per-process capture and the user selects one application
- **THEN** only audio from that application reaches the interviewer channel

### Requirement: Echo handling
When the candidate uses speakers instead of headphones, the application SHALL suppress interviewer audio leaking into the microphone channel, and SHALL recommend headphones in the pre-interview check.

#### Scenario: Speaker echo suppressed
- **WHEN** the interviewer speaks through speakers and the microphone picks it up
- **THEN** that speech is not transcribed as "Me"

### Requirement: Pre-interview audio check
Before a session starts, the application SHALL show live level meters for both channels and SHALL warn when a channel is silent.

#### Scenario: Silent channel warning
- **WHEN** the interviewer channel has no signal during the check
- **THEN** the application warns that system audio is not captured and names the selected device

### Requirement: VIEWER-SOLO diarization
In VIEWER-SOLO mode, when only one mixed input is available (cable splitter or room microphone), the application SHALL separate speakers by diarization. The user SHALL be able to mark which detected speaker is "Me" with one click, and the mapping SHALL apply to the rest of the session.

#### Scenario: Speaker mapping
- **WHEN** two speakers are detected and the user marks speaker 1 as "Me"
- **THEN** all following segments of speaker 2 are labeled "Interviewer"
