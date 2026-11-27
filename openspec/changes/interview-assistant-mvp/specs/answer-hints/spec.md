## Purpose

Shows the candidate a short, relevant answer hint right after the interviewer asks a question, based on the live transcript and the candidate's prepared material.

## ADDED Requirements

### Requirement: Prepared interview context
Before a session the user SHALL be able to load a CV, a vacancy description and free-form notes (for example STAR stories prepared in another tool). This context SHALL be included in every hint request.

#### Scenario: Context used
- **WHEN** the CV contains a project and the interviewer asks about relevant experience
- **THEN** the hint references that project

### Requirement: Hint trigger modes
The user SHALL choose one trigger mode: by hotkey only, automatically after every interviewer turn, or automatically only after interviewer turns detected as questions. A hotkey SHALL request a hint at any time regardless of the mode.

#### Scenario: Auto on question
- **WHEN** the mode is "questions only" and the interviewer finishes a question
- **THEN** a hint request starts without user action

#### Scenario: Not a question
- **WHEN** the mode is "every turn" and the interviewer turn is not a question
- **THEN** no hint is shown and the previous hint stays visible

#### Scenario: Manual hotkey
- **WHEN** the user presses the hint hotkey
- **THEN** a hint request starts for the latest interviewer turn

### Requirement: Early start
A hint request SHALL start after 300 ms of interviewer silence, before the segment is finalized. If the interviewer continues speaking, the request SHALL be cancelled and restarted after the next pause.

#### Scenario: Interviewer resumes
- **WHEN** a request started after a pause and the interviewer keeps talking
- **THEN** the request is cancelled and its partial hint is discarded

### Requirement: Hint format and timing
A hint SHALL be shown as 3 to 5 short bullets in the interview language and SHALL stream in as it is generated. The first bullet SHALL start appearing within 1.8 seconds after the interviewer stops speaking on the reference setup.

#### Scenario: Streaming bullets
- **WHEN** the model returns the answer
- **THEN** bullets appear token by token, not after the whole answer is ready

### Requirement: Transcript and hint history
The application SHALL show a live transcript with role labels and SHALL keep earlier hints of the session scrollable. Session data SHALL stay on the device and SHALL be deleted on request.

#### Scenario: Delete session
- **WHEN** the user deletes a session
- **THEN** its transcript, hints and audio buffers are removed from disk
