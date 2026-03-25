import { describe, expect, it, vi } from 'vitest';

import { handlePopupRuntimeMessage } from './runtime-messages';

describe('popup runtime messages', () => {
  it('updates form detection state and refreshes autofill visibility on detection updates', () => {
    const setFormDetectionState = vi.fn();
    const updateAutofillVisibility = vi.fn();
    const getCurrentState = vi.fn().mockReturnValue('detected');

    handlePopupRuntimeMessage(
      {
        type: 'FORM_DETECTION_UPDATE',
        hasApplicationForm: true,
        fillableFieldCount: 4,
      },
      {
        setFormDetectionState,
        updateAutofillVisibility,
        getCurrentState,
      }
    );

    expect(setFormDetectionState).toHaveBeenCalledWith({
      hasApplicationForm: true,
      fillableFieldCount: 4,
    });
    expect(updateAutofillVisibility).toHaveBeenCalledWith('detected');
  });

  it('ignores unrelated runtime messages', () => {
    const setFormDetectionState = vi.fn();
    const updateAutofillVisibility = vi.fn();

    handlePopupRuntimeMessage(
      { type: 'OTHER_EVENT' },
      {
        setFormDetectionState,
        updateAutofillVisibility,
        getCurrentState: vi.fn(),
      }
    );

    expect(setFormDetectionState).not.toHaveBeenCalled();
    expect(updateAutofillVisibility).not.toHaveBeenCalled();
  });
});
