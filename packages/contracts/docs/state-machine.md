# State Machine

## Overview

INDAGO uses explicit state machines for investigation and run lifecycles. Both valid and invalid transitions are defined.

## Investigation States

```
DRAFT → ACTIVE → PAUSED → ACTIVE → CLOSED → ARCHIVED
```

### Valid Transitions

| From | To | Trigger |
|------|----|---------|
| DRAFT | ACTIVE | START |
| ACTIVE | PAUSED | PAUSE |
| PAUSED | ACTIVE | RESUME |
| ACTIVE | CLOSED | CLOSE |
| CLOSED | ARCHIVED | ARCHIVE |

### Invalid Transitions

| From | To | Reason |
|------|----|--------|
| DRAFT | CLOSED | Must be ACTIVE first |
| DRAFT | ARCHIVED | Must be CLOSED first |
| ARCHIVED | ACTIVE | Cannot unarchive |
| ARCHIVED | DRAFT | Not supported |

## Run States

```
QUEUED → INITIALIZING → RUNNING → PAUSED → RUNNING → COMPLETED
                                          → FAILED → QUEUED (retry)
                                          → CANCELLED
```

### Valid Transitions

| From | To | Trigger |
|------|----|---------|
| QUEUED | INITIALIZING | DEQUEUE |
| INITIALIZING | RUNNING | INIT_COMPLETE |
| RUNNING | PAUSED | PAUSE |
| PAUSED | RUNNING | RESUME |
| RUNNING | COMPLETED | COMPLETE |
| RUNNING | FAILED | ERROR |
| RUNNING | CANCELLED | CANCEL |
| FAILED | QUEUED | RETRY |

### Invalid Transitions

| From | To | Reason |
|------|----|--------|
| COMPLETED | RUNNING | Already completed |
| CANCELLED | RUNNING | Cannot resume cancelled |
| QUEUED | COMPLETED | Not started |

## Checkpoints

Checkpoints capture state at each stage boundary:

- Enable resumability after failures
- Support recovery from specific points
- Track progress through the pipeline

## Recovery Strategies

| Strategy | Description |
|----------|-------------|
| RETRY_FROM_CHECKPOINT | Resume from last checkpoint |
| RETRY_FAILED_STAGE | Retry only the failed stage |
| RESTART_RUN | Start over from beginning |
| SKIP_FAILED_STAGE | Skip and continue |
| MANUAL_INTERVENTION | Require human action |
