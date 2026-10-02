---
title: Edit interview transcripts
description: Add, read and correct interview transcripts without AI.
---

Open an application, find its interview round and choose **Open transcript**.
Existing transcripts open in reading mode. **Edit transcript** lets you correct
passage text, speaker names and roles. **Read transcript** keeps an unsaved draft;
save corrections before requesting feedback.

## Add or replace text

Under **Add transcript**, paste text or upload a UTF-8 TXT, SRT or VTT file.
Use **Replace transcript** to replace existing text. Saving text does not call an
AI service. Other round attachments, such as PDF and DOCX, remain attachments.

Assign Candidate, Interviewer, Other or Unknown speaker roles only when you know
them. Corrections retain passage IDs, order and source times. Replacing the
source discards previous corrections. Downloading an original upload returns
its original bytes; personal JSON/ZIP exports include current corrections.

Supported limits:

- 2,000,000 UTF-8 bytes of supplied text.
- 10,000 passages, 64,000 characters per passage and 100 per speaker label.
- Subtitle times from 0 to 7,200 seconds, with nondecreasing cue starts.
- English text. TXT lines have unknown timing and speakers.

Text markup is displayed as text, not executed. Subtitle gaps do not prove that
a recording is complete.

## Conflicts and deletion

If another change makes your draft stale, saving returns a conflict instead of
overwriting it. Copy any text you need before reloading the current transcript.
There is no automatic retry.

Deleting a transcript removes its current text and corrections. Deleting its
round or application removes the owned transcript. Shared stored files can
remain until storage cleanup runs.

## Transcribe a recording

Configure [speech in Admin](./configure-ai-settings.md), then select **Transcribe**
next to a round recording. Review where the audio will be sent and start the job.
Video uses its audio only. Uploading a recording or opening a transcript does not
start processing.

A completed result can be opened in the same editor. Failed or partial processing
does not replace valid text. Saved corrections made after the job starts prevent
it from overwriting them. Unsaved edits can still require conflict recovery.

Retry is explicit. A timeout or interrupted job can have sent audio to the remote
service and incurred charges. Inspect the job before requesting another attempt.
Deleting or replacing the source recording also removes its generated transcript;
independently pasted or uploaded text remains separate.

Recordings are limited to 1,000,000,000 bytes and two hours. Long recordings are
split into audio chunks of about ten minutes. Multiple tracks and channels can
require more requests. Transcription quality, timing and speaker identification
depend on the service; review the result before using feedback.

## Operations and API access

Run one application process and one replica. Stop it fully before an upgrade or
offline cleanup; do not remove executor lock files while the app is running.
Interrupted jobs remain visible for review after restart.

The transcript resource is `/api/rounds/{round_id}/transcript`. Reads require
`rounds:read` and `files:read`; writes and transcription start/retry also require
`files:write`. Mutations use `Expected-Transcript-Generation` to detect conflicts.
Transcription requests additionally use `Request-Intent` and the reviewed
`Speech-Configuration-Revision`. See the running instance's `/docs` for schemas
and the [CLI guide](./use-the-cli.md) for command examples.
