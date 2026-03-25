type BrowserActionImageData = ImageData & Record<string, unknown>;

export function buildActionIconPayload(
  imageData: Record<number, ImageData>
): { imageData: Record<string, BrowserActionImageData> } {
  return {
    imageData: Object.fromEntries(
      Object.entries(imageData).map(([size, data]) => [
        String(size),
        data as BrowserActionImageData,
      ])
    ),
  };
}
