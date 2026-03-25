import type { FormDetectionState } from './detection';
import type { PopupState } from './view';

export function handlePopupRuntimeMessage(
  message: unknown,
  options: {
    setFormDetectionState: (state: FormDetectionState) => void;
    updateAutofillVisibility: (state: PopupState) => void;
    getCurrentState: () => PopupState;
  }
): undefined {
  const { setFormDetectionState, updateAutofillVisibility, getCurrentState } =
    options;
  const msg = message as {
    type?: string;
    hasApplicationForm?: boolean;
    fillableFieldCount?: number;
  };

  if (msg.type !== 'FORM_DETECTION_UPDATE') {
    return undefined;
  }

  setFormDetectionState({
    hasApplicationForm: msg.hasApplicationForm ?? false,
    fillableFieldCount: msg.fillableFieldCount ?? 0,
  });
  updateAutofillVisibility(getCurrentState());
  return undefined;
}
