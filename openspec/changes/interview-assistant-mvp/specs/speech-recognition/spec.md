## Purpose

Turns both audio channels into a live transcript on the user's own machine, with the lowest possible delay, using a model specialized for the interview language.

## ADDED Requirements

### Requirement: Local recognition
Speech recognition SHALL run entirely on the processing device. Audio SHALL NOT be sent to any network service for transcription.

#### Scenario: Offline transcription
- **WHEN** the device has no internet connection during a session
- **THEN** the transcript keeps updating

### Requirement: Per-language model
The user SHALL select the interview language (Russian or English) in settings before a session. The application SHALL load only the model specialized for that language. The language SHALL NOT change during a session.

#### Scenario: English session
- **WHEN** the user selects English and starts a session
- **THEN** only the English model is loaded into memory

#### Scenario: Model not downloaded
- **WHEN** the selected language model is not on disk
- **THEN** the application offers to download it and blocks session start until it is available

### Requirement: Streaming transcript latency
The application SHALL show partial transcript text while a person is speaking and SHALL finalize a segment when voice activity ends. On the reference hardware the final text of a segment SHALL appear within 500 ms after the speaker stops.

#### Scenario: Partial text
- **WHEN** the interviewer is speaking
- **THEN** partial text appears and updates in the transcript before the sentence ends

#### Scenario: Final segment
- **WHEN** the interviewer stops speaking
- **THEN** the segment is finalized within 500 ms on the reference hardware

### Requirement: Interviewer channel priority
When both channels have speech at the same time, recognition of the interviewer channel SHALL take priority over the candidate channel.

#### Scenario: Overlapping speech
- **WHEN** the CPU is saturated and both people speak
- **THEN** interviewer segments are finalized first and candidate segments may lag
