## Purpose

Lets the user choose and change which language model generates hints, including their own Claude subscription, and keeps hints flowing when a provider hits a limit, fails or answers slowly.

## ADDED Requirements

### Requirement: Provider profiles
The user SHALL be able to create, edit, test and delete provider profiles. A profile SHALL have a name, a provider type (Anthropic API, OpenAI-compatible API, or Claude subscription), a base URL where applicable, a model id and, for API types, an API key. Presets SHALL be offered for Claude, DeepSeek, Groq, Cerebras, OpenRouter, local Ollama and a custom endpoint.

#### Scenario: DeepSeek preset
- **WHEN** the user picks the DeepSeek preset and enters a key
- **THEN** the profile is saved with the DeepSeek base URL and an editable model id

#### Scenario: Test a profile
- **WHEN** the user presses "Test" on a profile
- **THEN** the application sends a short request and shows the time to first token in milliseconds or the error text

### Requirement: Secret storage
API keys SHALL be stored only in the OS credential store and SHALL NOT appear in settings files, logs or exported diagnostics.

#### Scenario: Settings file has no key
- **WHEN** the user saves a profile with an API key
- **THEN** the settings file on disk contains no key value

### Requirement: Claude subscription option
A separate setting "Use Claude subscription" SHALL route hints through the Claude Code CLI installed on the processing device and logged in with the user's Pro/Max account. The option SHALL be disabled with an explanation when the CLI is missing or not logged in. Requests through this option SHALL NOT be billed to any API key configured in the application.

#### Scenario: CLI not logged in
- **WHEN** the Claude Code CLI is installed but not logged in
- **THEN** the option is disabled and shows how to log in

#### Scenario: No silent API billing
- **WHEN** the subscription option is active and an Anthropic API key exists in the user environment
- **THEN** subscription requests still use the subscription, not that key

### Requirement: Backup chain
The user SHALL configure an ordered chain of a primary profile and at least one backup profile. A backup API profile SHALL be mandatory when the subscription option is the primary.

#### Scenario: Subscription without backup
- **WHEN** the user enables the subscription option without a backup profile
- **THEN** the application refuses to start a session and asks for a backup

### Requirement: Failover on limit
When the subscription reports a usage limit, the application SHALL mark it as LIMITED, send the current and following requests to the backup, and SHALL try the subscription again only after the reported reset time, or after 15 minutes when no reset time is given.

#### Scenario: Limit mid-interview
- **WHEN** the subscription returns a usage-limit error during a session
- **THEN** the same question is answered by the backup without user action

### Requirement: Failover on error
When the primary fails with a connection error, a crash or an error response, the application SHALL send the request to the next profile in the chain immediately and SHALL restore the primary in the background.

#### Scenario: Network error
- **WHEN** the primary returns a connection error
- **THEN** the backup receives the request within 100 ms

### Requirement: Hedged request on slow answer
When the primary has not returned a first token within the slow threshold, the application SHALL start the same request on the backup in parallel. The first profile to return a token SHALL win, its stream SHALL be shown, and the other request SHALL be cancelled. The threshold SHALL adapt to the recent first-token times of the primary, starting at 800 ms and never exceeding 1500 ms.

#### Scenario: Backup wins
- **WHEN** the primary is silent past the threshold and the backup returns a token first
- **THEN** the backup answer is shown and the primary request is cancelled

#### Scenario: Primary wins after hedge
- **WHEN** both requests run and the primary returns a token first
- **THEN** the primary answer is shown and the backup request is cancelled

#### Scenario: No mixing
- **WHEN** a hedged race is decided
- **THEN** the hint contains text from the winning profile only

### Requirement: Slow primary demotion
After 3 consecutive hedged races lost by the primary, the application SHALL mark it SLOW and use the backup as primary for 5 minutes.

#### Scenario: Temporary demotion
- **WHEN** the primary loses 3 races in a row
- **THEN** the next requests go to the backup first for 5 minutes

### Requirement: Source indication
Each hint SHALL show which profile produced it, and the overlay SHALL show the current health state of the primary (OK, SLOW, LIMITED, DOWN), so the user knows when paid API usage happens.

#### Scenario: Limit visible
- **WHEN** the subscription is LIMITED
- **THEN** the overlay shows an indicator such as "API (limit)" next to new hints

### Requirement: Fast and deep switch
The user SHALL be able to assign a fast and a deep profile chain and switch between them during a session with a hotkey.

#### Scenario: Switch to deep
- **WHEN** the user presses the deep hotkey before a system design question
- **THEN** the next hint uses the deep chain
