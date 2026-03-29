type CanvasLike = {
  getContext: (contextId: '2d') => OffscreenCanvasRenderingContext2D | null;
};

type BitmapLike = {
  width: number;
  height: number;
  close: () => void;
};

function drawTreeIcon(
  ctx: OffscreenCanvasRenderingContext2D,
  size: number,
  color: string
): void {
  const scale = size / 128;

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const trunkWidth = 20 * scale;
  const trunkHeight = 30 * scale;
  const trunkX = (size - trunkWidth) / 2;
  const trunkY = size - trunkHeight - 5 * scale;

  ctx.fillRect(trunkX, trunkY, trunkWidth, trunkHeight);

  const centerX = size / 2;
  const baseY = trunkY + 5 * scale;

  ctx.beginPath();
  ctx.moveTo(centerX, baseY - 50 * scale);
  ctx.lineTo(centerX - 45 * scale, baseY);
  ctx.lineTo(centerX + 45 * scale, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(centerX, baseY - 75 * scale);
  ctx.lineTo(centerX - 35 * scale, baseY - 30 * scale);
  ctx.lineTo(centerX + 35 * scale, baseY - 30 * scale);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(centerX, baseY - 100 * scale);
  ctx.lineTo(centerX - 25 * scale, baseY - 55 * scale);
  ctx.lineTo(centerX + 25 * scale, baseY - 55 * scale);
  ctx.closePath();
  ctx.fill();
}

export async function updateActionIcon(options: {
  accentHex: string;
  getRuntimeUrl: (path: string) => string;
  fetchBlob: (url: string) => Promise<Blob>;
  createImageBitmap: (blob: Blob) => Promise<BitmapLike>;
  createCanvas: (size: number) => CanvasLike;
  setIcon: (imageData: Record<number, ImageData>) => Promise<void>;
  debug: (context: string, ...args: unknown[]) => void;
  error: (context: string, ...args: unknown[]) => void;
}): Promise<void> {
  const {
    accentHex,
    getRuntimeUrl,
    fetchBlob,
    createImageBitmap,
    createCanvas,
    setIcon,
    debug,
    error,
  } = options;

  debug('Icon', 'Starting color update to:', accentHex);

  const sizes = [16, 48, 128] as const;
  const imageDataMap: Record<number, ImageData> = {};

  for (const size of sizes) {
    try {
      const iconName = `icon${size}.png`;
      const iconUrl = getRuntimeUrl(`icons/${iconName}`);
      const pngBlob = await fetchBlob(iconUrl);
      const bitmap = await createImageBitmap(pngBlob);

      debug(
        'Icon',
        `Loaded ${iconName}, size:`,
        bitmap.width,
        'x',
        bitmap.height
      );

      const canvas = createCanvas(size);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        error('Icon', 'Failed to get canvas context for size', size);
        bitmap.close();
        continue;
      }

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(bitmap as ImageBitmap, 0, 0, size, size);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = accentHex;
      ctx.fillRect(0, 0, size, size);
      imageDataMap[size] = ctx.getImageData(0, 0, size, size);
      bitmap.close();
    } catch (err) {
      error('Icon', `Failed to load/tint icon for size ${size}:`, err);
      const canvas = createCanvas(size);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, size, size);
        drawTreeIcon(ctx, size, accentHex);
        imageDataMap[size] = ctx.getImageData(0, 0, size, size);
      }
    }
  }

  try {
    await setIcon(imageDataMap);
    debug('Icon', 'Successfully updated with accent color:', accentHex);
  } catch (err) {
    error('Icon', 'Failed to set icon:', err);
  }
}

export async function fetchRuntimeBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  return response.blob();
}

export function createRuntimeBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

export function createOffscreenIconCanvas(size: number): OffscreenCanvas {
  return new OffscreenCanvas(size, size);
}
