import {
  act,
  cleanup,
  fireEvent,
  render,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Admin from './Admin';
import {
  getAISettings,
  updateAISettings,
  getLocalSpeechStatus,
} from '../lib/aiSettings';
import type { AISettingsResponse, AISettingsUpdate } from '../lib/aiSettings';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));
vi.mock('../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../components/CreateUserModal', () => ({ default: () => null }));
vi.mock('../components/EditUserModal', () => ({ default: () => null }));
vi.mock('../lib/admin', () => ({
  listUsers: async () => ({ items: [], total: 0, total_pages: 1 }),
  getAdminStats: async () => ({ total_users: 0, total_applications: 0 }),
}));
vi.mock('../lib/aiSettings', () => ({
  getAISettings: vi.fn(),
  updateAISettings: vi.fn(),
  getLocalSpeechStatus: vi.fn(),
}));
const capability = {
  enabled: true,
  provider: 'openai',
  model: 'gpt-4o-mini',
  configuration_status: 'configured' as const,
  configuration_revision: 'text-initial',
  verified: false as const,
  dispatch_supported: true,
  available: true,
  external_processing: 'External processing',
  input_disclosure: 'Requested text',
  message: 'Unverified',
};
let server: AISettingsResponse;
function apply(patch: AISettingsUpdate) {
  const textChanged = Object.entries(patch).some(
    ([key, value]) =>
      (key.startsWith('text_') || key.startsWith('litellm_')) &&
      server[key as keyof AISettingsResponse] !== value
  );
  server = {
    ...server,
    ...patch,
    litellm_base_url: null,
    text: {
      ...server.text,
      configuration_revision: textChanged
        ? `${server.text.configuration_revision}-changed`
        : server.text.configuration_revision,
    },
  };
  return structuredClone(server);
}
beforeEach(() => {
  vi.clearAllMocks();
  server = {
    litellm_model: 'openai/gpt-4o-mini',
    litellm_api_key_masked: '****',
    litellm_base_url: null,
    litellm_endpoint_configured: true,
    is_configured: true,
    text_protocol: 'chat_completions',
    text_enabled: true,
    text_keyless: false,
    speech_enabled: false,
    speech_keyless: false,
    speech_provider: 'openai',
    speech_model: 'whisper-1',
    speech_endpoint_configured: false,
    speech_api_key_configured: false,
    text: { ...capability },
    speech: { ...capability, configuration_revision: 'speech-initial' },
  };
  vi.mocked(getAISettings).mockImplementation(async () =>
    structuredClone(server)
  );
  vi.mocked(updateAISettings).mockImplementation(async (patch) => apply(patch));
});
afterEach(cleanup);
async function tab() {
  const view = render(<Admin />);
  await within(view.container).findByText('AI Configuration');
  fireEvent.click(
    within(view.container).getByRole('button', { name: 'Configure AI' })
  );
  return within(view.container);
}

it('keeps user management visible and opens AI fields only on request', async () => {
  const view = render(<Admin />);
  const a = within(view.container);
  await a.findByText('AI Configuration');
  expect(a.getByRole('heading', { name: 'Users' })).toBeVisible();
  expect(a.queryByLabelText('Text credential')).not.toBeInTheDocument();
  expect(a.queryByText('Unverified')).not.toBeInTheDocument();
  fireEvent.click(a.getByRole('button', { name: 'Configure AI' }));
  expect(a.getByRole('dialog', { name: 'AI Configuration' })).toBeVisible();
  fireEvent.change(a.getByLabelText('Text model'), {
    target: { value: 'unsaved-model' },
  });
  fireEvent.click(a.getByRole('button', { name: 'Close AI settings' }));
  expect(a.queryByRole('dialog')).not.toBeInTheDocument();
  expect(updateAISettings).not.toHaveBeenCalled();
  expect(getLocalSpeechStatus).not.toHaveBeenCalled();
  fireEvent.click(a.getByRole('button', { name: 'Configure AI' }));
  expect(a.getByLabelText('Text model')).toHaveValue('unsaved-model');
});

it('ignores an older admin snapshot after the search changes', async () => {
  const view = render(<Admin />);
  const a = within(view.container);
  await a.findByText('AI Configuration');
  let resolveOld!: (data: AISettingsResponse) => void;
  vi.mocked(getAISettings)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      })
    )
    .mockResolvedValueOnce({ ...server, litellm_model: 'current-model' });
  fireEvent.change(a.getByPlaceholderText('Search by email...'), {
    target: { value: 'old' },
  });
  fireEvent.change(a.getByPlaceholderText('Search by email...'), {
    target: { value: 'new' },
  });
  await a.findByText('current-model');
  await act(async () =>
    resolveOld({ ...server, litellm_model: 'obsolete-model' })
  );
  expect(a.queryByText('obsolete-model')).not.toBeInTheDocument();
  expect(a.getByText('current-model')).toBeVisible();
});

it.each([false, true])(
  'a stale client save (speech edit: %s) cannot undo another client text disablement',
  async (editSpeech) => {
    const a = await tab();
    const b = await tab();
    fireEvent.click(b.getByLabelText('Enable text processing'));
    await act(async () => fireEvent.click(b.getByText('Save Settings')));
    const revision = server.text.configuration_revision;
    if (editSpeech)
      fireEvent.change(a.getByLabelText('Speech model'), {
        target: { value: 'whisper-2' },
      });
    // A user-list refresh observes B's status, but must not replace A's own baseline.
    fireEvent.change(a.getByPlaceholderText('Search by email...'), {
      target: { value: 'refresh' },
    });
    await act(async () => {});
    let finish!: (response: AISettingsResponse) => void;
    vi.mocked(updateAISettings).mockImplementationOnce((patch) => {
      const response = apply(patch);
      return new Promise((resolve) => {
        finish = () => resolve(response);
      });
    });
    fireEvent.click(a.getByText('Save Settings'));
    expect(updateAISettings).toHaveBeenLastCalledWith(
      editSpeech ? { speech_model: 'whisper-2' } : {}
    );
    expect(server.text_enabled).toBe(false);
    expect(server.text.configuration_revision).toBe(revision);
    expect(a.getByLabelText('Text credential')).toBeDisabled();
    expect(a.getByLabelText('Speech model')).toBeDisabled();
    await act(async () => finish(server));
    // Saving again must not treat stale, unedited text controls as new edits.
    await act(async () => fireEvent.click(a.getByText('Save Settings')));
    expect(updateAISettings).toHaveBeenLastCalledWith({});
    expect(server.text_enabled).toBe(false);
    expect(server.text.configuration_revision).toBe(revision);
  }
);

it('sends only the changed text protocol and keeps the selector hydrated', async () => {
  const a = await tab();
  expect(a.getByLabelText('Text protocol')).toHaveTextContent(
    'Chat Completions'
  );
  fireEvent.click(a.getByLabelText('Text protocol'));
  fireEvent.click(a.getByRole('option', { name: 'Responses API' }));
  await act(async () => fireEvent.click(a.getByText('Save Settings')));
  expect(updateAISettings).toHaveBeenLastCalledWith({
    text_protocol: 'responses',
  });
  expect(server.text_protocol).toBe('responses');
  // An unchanged selector must not resend the field.
  await act(async () => fireEvent.click(a.getByText('Save Settings')));
  expect(updateAISettings).toHaveBeenLastCalledWith({});
});

it('disables every capability input while saving and retains sensitive drafts on failure', async () => {
  const a = await tab();
  fireEvent.change(a.getByLabelText('Text credential'), {
    target: { value: 'synthetic-new-key' },
  });
  fireEvent.click(a.getByLabelText('Clear speech endpoint'));
  let reject!: (error: Error) => void;
  vi.mocked(updateAISettings).mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  fireEvent.click(a.getByText('Save Settings'));
  expect(updateAISettings).toHaveBeenLastCalledWith({
    litellm_api_key: 'synthetic-new-key',
    speech_endpoint: null,
  });
  for (const input of [
    ...a.getAllByRole('checkbox'),
    a.getByLabelText('Text model'),
    a.getByLabelText('Text credential'),
    a.getByLabelText('Text endpoint'),
    a.getByLabelText('Speech model'),
    a.getByLabelText('Speech provider'),
    a.getByLabelText('Speech credential'),
    a.getByLabelText('Speech endpoint'),
  ])
    expect(input).toBeDisabled();
  await act(async () => reject(new Error('offline save failure')));
  expect(a.getByLabelText('Text credential')).toHaveValue('synthetic-new-key');
  expect(a.getByLabelText('Clear speech endpoint')).toBeChecked();
  await act(async () => fireEvent.click(a.getByText('Save Settings')));
  expect(a.getByLabelText('Text credential')).toHaveValue('');
  expect(a.getByLabelText('Clear speech endpoint')).not.toBeChecked();
  fireEvent.change(a.getByLabelText('Text credential'), {
    target: { value: 'next-unsaved-key' },
  });
  expect(a.getByLabelText('Text credential')).toHaveValue('next-unsaved-key');
});

it.each(['Local speech', 'OpenAI', 'Groq', 'Custom endpoint'])(
  'shows the selected %s preset after selection, save and reopening',
  async (label) => {
    const a = await tab();
    fireEvent.click(a.getByLabelText('Apply speech preset'));
    fireEvent.click(a.getByRole('option', { name: label }));
    expect(a.getByLabelText('Apply speech preset')).toHaveTextContent(label);
    await act(async () => fireEvent.click(a.getByText('Save Settings')));
    expect(a.getByLabelText('Speech endpoint')).toHaveValue('');
    expect(a.getByLabelText('Apply speech preset')).toHaveTextContent(label);
    fireEvent.click(a.getByRole('button', { name: 'Close AI settings' }));
    fireEvent.click(a.getByRole('button', { name: 'Configure AI' }));
    expect(a.getByLabelText('Apply speech preset')).toHaveTextContent(label);
  }
);

it.each([
  ['local', 'Systran/faster-whisper-tiny.en', 'Local speech'],
  ['openai', 'whisper-1', 'OpenAI'],
  ['openai', 'whisper-large-v3-turbo', 'Groq'],
  ['openai', 'custom-model', 'Custom endpoint'],
  ['', '', 'Choose a preset'],
])(
  'derives the saved preset from provider %s and model %s without the private endpoint',
  async (provider, model, label) => {
    server.speech_provider = provider || null;
    server.speech_model = model || null;
    server.speech_endpoint_configured = !!provider;
    const a = await tab();
    expect(a.getByLabelText('Speech endpoint')).toHaveValue('');
    expect(a.getByLabelText('Apply speech preset')).toHaveTextContent(label);
    fireEvent.click(a.getByRole('button', { name: 'Close AI settings' }));
    fireEvent.click(a.getByRole('button', { name: 'Configure AI' }));
    expect(a.getByLabelText('Apply speech preset')).toHaveTextContent(label);
  }
);

it.each([
  ['https://api.openai.com/v1', 'OpenAI'],
  ['https://api.groq.com/openai/v1', 'Groq'],
  ['https://speech.example.test/v1', 'Custom endpoint'],
])(
  'derives the preset from the edited endpoint %s',
  async (endpoint, label) => {
    server.speech_model = 'custom-model';
    const a = await tab();
    fireEvent.change(a.getByLabelText('Speech endpoint'), {
      target: { value: endpoint },
    });
    expect(a.getByLabelText('Apply speech preset')).toHaveTextContent(label);
    expect(updateAISettings).not.toHaveBeenCalled();
  }
);

it('local preset clears speech secrets, preserves text and performs no implicit service check', async () => {
  const a = await tab();
  fireEvent.change(a.getByLabelText('Speech credential'), {
    target: { value: 'old-draft-canary' },
  });
  fireEvent.click(a.getByLabelText('Apply speech preset'));
  fireEvent.click(a.getByRole('option', { name: 'Local speech' }));
  expect(updateAISettings).not.toHaveBeenCalled();
  expect(getLocalSpeechStatus).not.toHaveBeenCalled();
  expect(a.getByLabelText('Speech credential')).toHaveValue('');
  expect(a.getByLabelText('Speech credential')).toBeDisabled();
  expect(a.getByLabelText('Speech model')).toHaveTextContent('Tiny English');
  await act(async () => fireEvent.click(a.getByText('Save Settings')));
  expect(updateAISettings).toHaveBeenLastCalledWith({
    speech_enabled: true,
    speech_keyless: true,
    speech_provider: 'local',
    speech_model: 'Systran/faster-whisper-tiny.en',
    speech_endpoint: 'http://speaches:8000/v1',
    speech_api_key: null,
  });
  vi.mocked(getLocalSpeechStatus).mockResolvedValue({
    status: 'not_installed',
    message: 'Run explicit setup.',
    installed: [],
  });
  await act(async () =>
    fireEvent.click(a.getByText('Check saved local installation'))
  );
  expect(getLocalSpeechStatus).toHaveBeenCalledOnce();
  expect(
    a.getByText(
      'No supported model is installed. Selecting a model does not download it.'
    )
  ).toBeVisible();
});

it('offers both curated local models and selects base without any implicit call', async () => {
  const a = await tab();
  fireEvent.click(a.getByLabelText('Apply speech preset'));
  fireEvent.click(a.getByRole('option', { name: 'Local speech' }));
  const selector = a.getByLabelText('Speech model');
  fireEvent.click(selector);
  expect(a.getAllByRole('option').map((option) => option.textContent)).toEqual([
    'Tiny English',
    'Base English',
  ]);
  expect(updateAISettings).not.toHaveBeenCalled();
  expect(getLocalSpeechStatus).not.toHaveBeenCalled();
  fireEvent.click(a.getByRole('option', { name: 'Base English' }));
  expect(getLocalSpeechStatus).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(a.getByText('Save Settings')));
  expect(updateAISettings).toHaveBeenLastCalledWith({
    speech_enabled: true,
    speech_keyless: true,
    speech_provider: 'local',
    speech_model: 'Systran/faster-whisper-base.en',
    speech_endpoint: 'http://speaches:8000/v1',
    speech_api_key: null,
  });
  expect(getLocalSpeechStatus).not.toHaveBeenCalled();
});

it.each([
  ['openai', 'whisper-1', 'https://api.openai.com/v1'],
  ['groq', 'whisper-large-v3-turbo', 'https://api.groq.com/openai/v1'],
])(
  'applies %s compatible defaults and requires a fresh key without cloud requests',
  async (preset, model, endpoint) => {
    const a = await tab();
    fireEvent.click(a.getByLabelText('Apply speech preset'));
    fireEvent.click(
      a.getByRole('option', { name: preset === 'openai' ? 'OpenAI' : 'Groq' })
    );
    expect(a.getByLabelText('Clear speech credential')).toBeChecked();
    fireEvent.change(a.getByLabelText('Speech credential'), {
      target: { value: 'synthetic-new-key' },
    });
    expect(a.getByLabelText('Clear speech credential')).not.toBeChecked();
    await act(async () => fireEvent.click(a.getByText('Save Settings')));
    expect(updateAISettings).toHaveBeenLastCalledWith({
      speech_enabled: true,
      ...(model === 'whisper-1' ? {} : { speech_model: model }),
      speech_endpoint: endpoint,
      speech_api_key: 'synthetic-new-key',
    });
    expect(getLocalSpeechStatus).not.toHaveBeenCalled();
  }
);
