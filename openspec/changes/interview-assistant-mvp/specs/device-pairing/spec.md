## Purpose

Connects the interview machine (HOST) to the second device (VIEWER) so the second device receives both audio channels with low latency over an encrypted link.

## ADDED Requirements

### Requirement: Pairing by code
A VIEWER SHALL pair with a HOST by scanning a QR code or entering a 6-digit code shown by the HOST. A pairing code SHALL expire after 5 minutes or after one successful use.

#### Scenario: Successful pairing
- **WHEN** the user enters the valid code shown on the HOST into the VIEWER
- **THEN** both devices show "Paired" and remember each other

#### Scenario: Expired code
- **WHEN** the user enters a code older than 5 minutes
- **THEN** pairing fails with a message to generate a new code

### Requirement: Discovery on the local network
The VIEWER SHALL discover paired HOSTs on the local network automatically and SHALL allow a manual IP address when discovery is blocked.

#### Scenario: Manual address
- **WHEN** automatic discovery finds nothing
- **THEN** the user can enter the HOST IP address and connect

### Requirement: Encrypted two-channel stream
The HOST SHALL stream the candidate and interviewer channels as two separate encrypted audio streams. Only a paired VIEWER SHALL be able to receive them.

#### Scenario: Unpaired device rejected
- **WHEN** an unpaired device tries to connect to the HOST
- **THEN** the HOST refuses the connection and streams nothing

### Requirement: Link status and recovery
Both devices SHALL show the link state and the VIEWER SHALL show the measured audio delay. After a link drop the devices SHALL reconnect automatically without a new pairing.

#### Scenario: Reconnect after Wi-Fi drop
- **WHEN** the network drops for 10 seconds and returns
- **THEN** streaming resumes without user action and the gap is marked in the transcript
