import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReadHttpError } from '../../lib/readRecovery';
import api, { withAxiosTimeZoneHeaders } from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';
import { useEffectiveDayKey } from '@/hooks/useEffectiveDayKey';
import { getStableFlameQuote, type FlameStateKey } from '@/lib/flameQuotes';

type FlameState = 'burning' | 'ember' | 'extinguished' | 'dormant';
type CellKind = 'ember-core' | 'ember-smoke' | 'ash' | 'ash-smoke';

interface StreakData {
  current_streak: number;
  longest_streak: number;
  total_activity_days: number;
  last_activity_date: string | null;
  ember_active: boolean;
  state: FlameState;
  is_recently_extinguished: boolean;
  flame_stage: number;
  flame_name: string;
  flame_art: string;
  streak_exhausted_at: string | null;
}

interface FlameCell {
  char: string;
  kind?: CellKind;
}

interface FlameFrame {
  duration: number;
  data: Record<string, FlameCell>;
}

interface FlameAssetPayload {
  frameDuration: number;
  width: number;
  height: number;
  state: string;
  frames: FlameFrame[];
}

function getStateKey(data: StreakData): FlameStateKey {
  if (data.state === 'burning') {
    const stage = Math.min(15, Math.max(1, data.flame_stage || 1));
    return `burning-${stage}`;
  }
  return data.state;
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const value =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const int = parseInt(value, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(
    A.r + (B.r - A.r) * t,
    A.g + (B.g - A.g) * t,
    A.b + (B.b - A.b) * t
  );
}

function getAccentRamp(accentBase: string, accentBright: string) {
  const bg0 = '#282828';
  const fg0 = '#fbf1c7';
  return {
    '.': mix(bg0, accentBase, 0.32),
    ':': mix(bg0, accentBase, 0.5),
    '+': accentBase,
    '*': mix(accentBase, accentBright, 0.55),
    '#': mix(accentBright, fg0, 0.3),
    '@': fg0,
  };
}

function getSmokeRamp() {
  return {
    '.': '#504945',
    ':': '#665c54',
    '+': '#928374',
    '*': '#928374',
    '#': '#928374',
    '@': '#928374',
  };
}

function FlameCanvas({
  frames,
  width,
  height,
  accentBase,
  accentBright,
  frameIndex,
  animated,
}: {
  frames: FlameFrame[];
  width: number;
  height: number;
  accentBase: string;
  accentBright: string;
  frameIndex: number;
  animated: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frame = frames[animated ? frameIndex : 0] ?? frames[0];
    const flameRamp = getAccentRamp(accentBase, accentBright);
    const smokeRamp = getSmokeRamp();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';

    for (const [key, cell] of Object.entries(frame.data)) {
      if (!cell?.char || cell.char === ' ') continue;
      const [x, y] = key.split(',').map(Number);
      let color = flameRamp[cell.char as keyof typeof flameRamp] ?? '#fbf1c7';
      if (
        cell.kind === 'ember-smoke' ||
        cell.kind === 'ash' ||
        cell.kind === 'ash-smoke'
      ) {
        color = smokeRamp[cell.char as keyof typeof smokeRamp] ?? '#928374';
      }
      ctx.fillStyle = color;
      ctx.fillText(cell.char, x * 9, y * 15);
    }
  }, [accentBase, accentBright, animated, frameIndex, frames]);

  return (
    <div className="flex justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width * 9}
        height={height * 15}
        className="block h-auto max-w-full"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}

export default function FlameEmblem() {
  const { currentTheme, currentAccent, accentOptions } = useTheme();
  const dayKey = useEffectiveDayKey();
  const [frameIndex, setFrameIndex] = useState(0);

  const { data, isLoading } = useQuery<StreakData>({
    queryKey: ['streak', dayKey],
    queryFn: () =>
      api
        .get('/api/streak', { headers: withAxiosTimeZoneHeaders() })
        .then((r) => r.data),
  });

  const stateKey = useMemo(() => (data ? getStateKey(data) : null), [data]);

  const { data: asset } = useQuery<FlameAssetPayload>({
    enabled: Boolean(stateKey),
    queryKey: ['flame-asset', stateKey],
    queryFn: async () => {
      const response = await fetch(`/flame-assets/${stateKey}.json`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new ReadHttpError(response.status);
      }
      return (await response.json()) as FlameAssetPayload;
    },
  });

  useEffect(() => {
    setFrameIndex(0);
  }, [stateKey]);

  useEffect(() => {
    if (!asset || !stateKey) return;
    if (stateKey === 'dormant' || stateKey === 'extinguished') return;
    const frames = asset.frames;
    if (!frames || frames.length <= 1) return;

    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;

    const tick = (now: number) => {
      const frameDuration = frames[0]?.duration ?? asset.frameDuration ?? 33;
      accumulator += now - lastTime;
      lastTime = now;
      while (accumulator >= frameDuration) {
        accumulator -= frameDuration;
        setFrameIndex((index) => (index + 1) % frames.length);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [asset, stateKey]);

  const accent = useMemo(() => {
    const option = accentOptions.find((item) => item.name === currentAccent);
    const style = getComputedStyle(document.documentElement);
    return {
      base: option ? style.getPropertyValue(option.cssVar).trim() : '#d79921',
      bright: option
        ? style.getPropertyValue(option.cssVarBright).trim()
        : '#fabd2f',
    };
    // The same accent resolves to different CSS colors in each theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTheme, accentOptions, currentAccent]);

  const quote =
    data && stateKey
      ? getStableFlameQuote({
          stateKey,
          currentStreak: data.current_streak,
          totalActivityDays: data.total_activity_days,
          streakExhaustedAt: data.streak_exhausted_at,
        })
      : '';

  if (isLoading || !data || !stateKey || !asset) {
    return (
      <div className="bg-secondary mb-6 rounded-lg p-6">
        <div className="flex flex-col items-center justify-center">
          <div className="animate-pulse">
            <div className="bg-tertiary mb-4 h-20 rounded"></div>
            <div className="bg-tertiary h-4 w-48 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const animated = stateKey !== 'dormant' && stateKey !== 'extinguished';
  const borderClass =
    stateKey === 'dormant'
      ? 'border-tertiary'
      : stateKey === 'ember'
        ? 'border-orange'
        : 'border-fg1';

  return (
    <div className="bg-secondary mb-6 rounded-lg p-6">
      <div className="flex flex-col items-center justify-center">
        <div className="text-muted mb-2 text-xs tracking-[0.08em] uppercase">
          Flame of Ambition
        </div>
        <div
          key={stateKey}
          className={`relative max-w-full rounded-lg border-2 px-4 py-4 transition-all duration-300 sm:px-12 ${borderClass}`}
          style={
            animated ? { animation: 'kindle-once 700ms ease-out 1' } : undefined
          }
        >
          <div className="border-fg0 absolute top-0 left-0 h-3 w-3 rounded-tl-sm border-t-2 border-l-2"></div>
          <div className="border-fg0 absolute top-0 right-0 h-3 w-3 rounded-tr-sm border-t-2 border-r-2"></div>
          <div className="border-fg0 absolute bottom-0 left-0 h-3 w-3 rounded-bl-sm border-b-2 border-l-2"></div>
          <div className="border-fg0 absolute right-0 bottom-0 h-3 w-3 rounded-br-sm border-r-2 border-b-2"></div>

          <FlameCanvas
            frames={asset.frames}
            width={asset.width}
            height={asset.height}
            accentBase={accent.base}
            accentBright={accent.bright}
            frameIndex={frameIndex}
            animated={animated}
          />

          <div className="mt-3 text-center">
            <div className="text-fg1 text-3xl font-bold">
              {data.current_streak} {data.current_streak === 1 ? 'DAY' : 'DAYS'}
            </div>
            {!stateKey.startsWith('burning') && (
              <div className="text-fg4 mt-1 text-sm font-medium capitalize">
                {stateKey}
              </div>
            )}
          </div>
        </div>

        <p className="text-fg1 mt-4 max-w-md text-center text-sm leading-relaxed">
          {quote}
        </p>

        <div className="text-fg4 mt-4 flex gap-6 text-xs">
          <span>
            Best: {data.longest_streak}{' '}
            {data.longest_streak === 1 ? 'day' : 'days'}
          </span>
          <span>
            Total: {data.total_activity_days}{' '}
            {data.total_activity_days === 1 ? 'day' : 'days'}
          </span>
        </div>
      </div>
    </div>
  );
}
