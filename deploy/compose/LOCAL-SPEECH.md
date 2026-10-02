# Optional local English speech

Local speech runs on the Tarnished server, not in the browser. It is optional
and does not affect text-model settings. The Compose service uses CPU inference
with four CPUs and a 4 GiB memory limit. Allow at least 5 GiB free on both the
Docker storage filesystem and the model-cache filesystem.

The pinned amd64 Speaches 0.9.0-rc.3 image offers two MIT-licensed English models:

| Model | Snapshot size | Use |
| --- | --- | --- |
| `Systran/faster-whisper-tiny.en` | 78 MB | Faster, lower accuracy; default |
| `Systran/faster-whisper-base.en` | 148 MB | Higher accuracy, more CPU work |

Review and correct transcripts. Recordings are analyzed as audio, not video.
This image is an upstream release candidate and supports amd64 only.

## Provision the service and model

Run from the repository root. Pulling the image and downloading a model require
network access. Startup and Admin settings do not download models.

```bash
docker pull --platform linux/amd64 ghcr.io/speaches-ai/speaches@sha256:c26e287cbfbd77d7035f80a297f3695f8d33c797c894e4555cc258f5a4a5dd07
export LOCAL_SPEECH_CACHE=/absolute/path/to/new/speech-cache
python3 deploy/compose/setup-local-speech.py --cache "$LOCAL_SPEECH_CACHE"
```

Use a new dedicated cache whose parent directory exists. Run setup as UID 1000
or as root; the service must be able to read it. Do not use application storage
or a shared Hugging Face cache. The script verifies the pinned model files and
retains partial downloads on failure for inspection.

To add Base to a verified cache:

```bash
python3 deploy/compose/setup-local-speech.py --cache "$LOCAL_SPEECH_CACHE" \
  --model Systran/faster-whisper-base.en
```

Verify and start both the app and speech service:

```bash
python3 deploy/compose/setup-local-speech.py --cache "$LOCAL_SPEECH_CACHE" --verify
docker compose -f deploy/compose/docker-compose.yml \
  -f deploy/compose/local-speech.yml --profile local-speech up -d
```

For PostgreSQL, replace the first file with `docker-compose.postgres.yml` and set
`POSTGRES_PASSWORD`. Keep the same Compose files and cache setting for later
commands.

## Configure Tarnished

In **Admin → AI Configuration**, choose the **Local** speech preset and save.
The endpoint is `http://speaches:8000/v1`; this private route needs no API key.
Choose Tiny or Base only after installing it. **Check saved local installation**
checks the model list, not transcription quality. An installed model is loaded
on an explicit transcription request.

The speech container has no published port. It uses an internal network, an
offline read-only model cache and no application credentials. Do not expose its
other upstream endpoints through an ingress or proxy. Cloud speech presets are
separate and require their own provider configuration.

## Other installations

For a source backend or Kubernetes deployment, provision Speaches separately and
configure a private literal IP `/v1` endpoint reachable from Tarnished. The local
route accepts private IPs, `localhost` and `speaches`; other public/custom services
use the compatible `openai` provider. Keep the same pinned model cache and do not
publish the speech service externally. There is no automatic Helm sidecar or
model installation.
