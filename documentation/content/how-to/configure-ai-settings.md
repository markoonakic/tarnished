---
title: Configure AI settings
sidebar_position: 3
description: Configure text analysis and interview transcription for your installation.
---

AI is optional. Requested processing can send private content to the configured
service and can incur charges. Check its terms and verify generated advice.

You can save leads, track applications and edit transcripts without AI. An
administrator configures text and speech services for all users.

## Configure AI in the web app

1. Sign in as an administrator and open **Admin**.
2. Under **AI Configuration**, select **Configure AI**.
3. Set the text model, protocol, endpoint and API key.
4. If you want recording transcription, enable speech and choose its provider,
   model, endpoint and key. Speech settings are independent of text settings.
5. Select **Save Settings**.

Leave a stored key or endpoint blank to keep it. Use its **Clear** checkbox to
remove it. Closing the dialog does not save your changes. Saving settings does
not test a provider, download a model or start paid work.

Use keyless mode only for a service that intentionally does not require an API
key. An explicit endpoint is required for keyless services.

## Text analysis

Job extraction and the legacy aggregate-insight API use LiteLLM. Support depends
on the selected provider and model.

Saved application, interview and pipeline feedback use a narrower OpenAI-compatible
route: an `openai/` model identifier and an explicit HTTP(S) base endpoint are
required. Do not assume that a provider supported by LiteLLM also supports this
report route.

Choose the protocol supported by the endpoint:

- **Chat Completions** sends feedback requests to `<base>/chat/completions`.
- **Responses API** sends feedback requests to `<base>/responses`.

Both remove the leading `openai/` from the model name before sending it. Changing
protocol does not select a different model or endpoint. Responses requests have
bounded output allowances of 12,000 tokens for individual application/interview
feedback and 32,000 for pipeline feedback. Reasoning can consume this allowance.
Incomplete, invalid or ungrounded output is rejected; retries are explicit.

Requested feedback can send saved job details, transcript passages, documents and
relevant profile information to the configured service. Review its privacy and
pricing terms before use.

## Speech services

The **Apply speech preset** control fills in defaults for Local, OpenAI, Groq or
a custom compatible endpoint. Selecting a preset clears the previous speech key
when you save. Enter a new key where required.

For cloud or custom speech, use provider `openai`, an unprefixed model identifier
and a compatible `/v1` endpoint. Audio is sent only after an explicit transcription
request. Video inputs use their audio, not video-frame analysis.

Local speech runs on the Tarnished server, not in the browser. Install the service
and models first using `deploy/compose/LOCAL-SPEECH.md`. The model selector offers
Tiny English and Base English; selecting either does not download it. **Check saved
local installation** checks the installed model list, not transcription quality.

## Use feedback

- Application: select **Application feedback** on the application card.
- Interview: select **Interview feedback** on the round or in its transcript.
- Pipeline: open **Analytics**, choose a period, then select **Seek Grace**.

Opening feedback reads the saved result. **Get feedback** or **Update feedback**
starts processing. Data changes can make a result outdated; they do not start an
automatic rerun. Failed requests retain the last valid result unless its source
was removed. Exact citations help you inspect the evidence, but do not guarantee
that every model interpretation is correct.

## Stored secrets

Keys and endpoints are encrypted and are not returned in readable form by the
settings API. Keys show a masked/configured indicator; endpoints show whether a
value is stored. Back up the installation's secret key with the database if you
need to restore these settings.

## Related pages

- [Edit interview transcripts](./edit-interview-transcripts.md)
- [Auth and API keys](../explanation/auth-and-api-keys.md)
- [API overview](../reference/api-overview.md)
