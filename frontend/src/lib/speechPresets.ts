import { t } from '@/lib/i18n';
/** Form-only defaults. Selection never contacts a provider or downloads a model. */
export const localSpeechModels = [
  {
    id: 'Systran/faster-whisper-tiny.en',
    get label() {
      return t('Tiny English');
    },
    get note() {
      return t(
        'About 78 MB snapshot. Fastest on CPU; lowest accuracy of the pair.'
      );
    },
  },
  {
    id: 'Systran/faster-whisper-base.en',
    get label() {
      return t('Base English');
    },
    get note() {
      return t(
        'About 148 MB snapshot. Optional larger model; better accuracy, roughly 30% slower on CPU.'
      );
    },
  },
] as const;

export const speechPresets = {
  local: {
    provider: 'local',
    model: 'Systran/faster-whisper-tiny.en',
    endpoint: 'http://speaches:8000/v1',
    keyless: true,
  },
  openai: {
    provider: 'openai',
    model: 'whisper-1',
    endpoint: 'https://api.openai.com/v1',
    keyless: false,
  },
  groq: {
    provider: 'openai',
    model: 'whisper-large-v3-turbo',
    endpoint: 'https://api.groq.com/openai/v1',
    keyless: false,
  },
  custom: { provider: 'openai', model: '', endpoint: '', keyless: false },
} as const;
