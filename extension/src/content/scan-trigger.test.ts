import { describe, expect, it } from 'vitest';

import { shouldScheduleFormRescan } from './scan-trigger';

describe('content scan trigger helpers', () => {
  it('requests a rescan when mutations add form fields', () => {
    const input = document.createElement('input');

    expect(
      shouldScheduleFormRescan([
        { addedNodes: [input] } as unknown as MutationRecord,
      ])
    ).toBe(true);
  });

  it('requests a rescan when mutations add iframes or nested fields', () => {
    const wrapper = document.createElement('div');
    wrapper.append(document.createElement('textarea'));

    expect(
      shouldScheduleFormRescan([
        { addedNodes: [wrapper] } as unknown as MutationRecord,
        {
          addedNodes: [document.createElement('iframe')],
        } as unknown as MutationRecord,
      ])
    ).toBe(true);
  });

  it('ignores unrelated added nodes', () => {
    const div = document.createElement('div');
    div.textContent = 'hello';

    expect(
      shouldScheduleFormRescan([
        { addedNodes: [div] } as unknown as MutationRecord,
      ])
    ).toBe(false);
  });
});
