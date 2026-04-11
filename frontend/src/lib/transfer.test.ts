import { describe, expect, it } from 'vitest';

describe('transfer helpers', () => {
  it('builds an upload progress state', async () => {
    const { createTransferStateFromUpload } = await import('./transfer');

    expect(
      createTransferStateFromUpload({
        phase: 'uploading',
        loaded: 25,
        total: 100,
        fileName: 'archive.zip',
      })
    ).toEqual({
      phase: 'uploading',
      progress: 25,
      fileName: 'archive.zip',
      message: 'Uploading archive.zip...',
    });
  });

  it('maps backend job payloads into transfer processing state', async () => {
    const { createTransferStateFromJob } = await import('./transfer');

    expect(
      createTransferStateFromJob({
        status: 'processing',
        stage: 'extracting',
        percent: 30,
        message: 'Extracting files...',
      })
    ).toEqual({
      phase: 'processing',
      progress: 30,
      stage: 'extracting',
      message: 'Extracting files...',
    });
  });

  it('maps completed backend jobs into ready state', async () => {
    const { createTransferStateFromJob } = await import('./transfer');

    expect(
      createTransferStateFromJob({
        status: 'complete',
        percent: 100,
        message: 'Export ready',
        result: { filename: 'export.zip' },
      })
    ).toEqual({
      phase: 'ready',
      progress: 100,
      message: 'Export ready',
      result: { filename: 'export.zip' },
    });
  });
});
