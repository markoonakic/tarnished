import { useQuery } from '@tanstack/react-query';
import { useRef, useEffect, useState } from 'react';
import api from '@/lib/api';

interface StreakData {
  current_streak: number;
  longest_streak: number;
  total_activity_days: number;
  last_activity_date: string | null;
  ember_active: boolean;
  flame_stage: number;
  flame_name: string;
  flame_art: string;
  streak_exhausted_at: string | null;
}

const flameMessages: Record<number, string> = {
  1: 'A single spark...',
  2: 'It flickers...',
  3: 'The embers glow...',
  4: 'Something awakens...',
  5: 'It grows stronger...',
  6: 'Brighter now...',
  7: 'A flame is born...',
  8: 'Finding its form...',
  9: 'Burning steady...',
  10: 'Gaining momentum...',
  11: 'Unstoppable force...',
  12: 'A true blaze...',
  13: 'Inferno unleashed...',
  14: 'Transcendent...',
  15: 'Beyond mortal...',
};

type FlameState = 'BURNING' | 'EMBER' | 'EXTINGUISHED' | 'COLD';

function getPlaceholderFlameArt(state: FlameState): string {
  switch (state) {
    case 'EMBER':
      return '▓▓▓▓';
    case 'EXTINGUISHED':
      return '░░░░';
    case 'COLD':
      return '····';
    default:
      return '';
  }
}

export default function FlameEmblem() {
  const { data, isLoading } = useQuery<StreakData>({
    queryKey: ['streak'],
    queryFn: () => api.get('/api/streak').then((r) => r.data),
  });

  // Store the current timestamp when data changes to avoid calling Date.now() during render
  // Using lazy initialization for useRef to avoid calling Date.now() during render
  const nowRef = useRef<number | null>(null);
  const [isRecentlyExhausted, setIsRecentlyExhausted] = useState(false);

  useEffect(() => {
    if (!data || !data.streak_exhausted_at || data.longest_streak === 0) {
      setIsRecentlyExhausted(false);
      return;
    }
    if (nowRef.current === null) {
      nowRef.current = Date.now();
    }
    const daysSinceExhausted = Math.floor(
      (nowRef.current - new Date(data.streak_exhausted_at).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    setIsRecentlyExhausted(daysSinceExhausted <= 7);
  }, [data]);

  if (isLoading) {
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

  if (!data) return null;

  const isEmber = data.ember_active;
  // Extinguished means HAD a streak but lost it (longest_streak > 0)
  const isExtinguished =
    data.current_streak === 0 && !isEmber && data.longest_streak > 0;
  // Never lit means never had any streak
  const neverLit =
    data.current_streak === 0 && !isEmber && data.longest_streak === 0;

  const flameState: FlameState = neverLit
    ? 'COLD'
    : isExtinguished
      ? 'EXTINGUISHED'
      : isEmber
        ? 'EMBER'
        : 'BURNING';

  const getFlameArt = (): string => {
    if (flameState === 'BURNING' && data.flame_art) {
      return data.flame_art;
    }
    return getPlaceholderFlameArt(flameState);
  };

  return (
    <div className="bg-secondary mb-6 rounded-lg p-6">
      <div className="flex flex-col items-center justify-center">
        {/* Emblem frame - Elden Ring inspired ornate border */}
        <div
          className={`relative rounded-lg border-2 px-12 py-4 ${flameState === 'COLD' ? 'border-tertiary' : isEmber ? 'border-orange' : 'border-fg1'} transition-all duration-300`}
        >
          {/* Decorative corners */}
          <div className="border-fg0 absolute top-0 left-0 h-3 w-3 rounded-tl-sm border-t-2 border-l-2"></div>
          <div className="border-fg0 absolute top-0 right-0 h-3 w-3 rounded-tr-sm border-t-2 border-r-2"></div>
          <div className="border-fg0 absolute bottom-0 left-0 h-3 w-3 rounded-bl-sm border-b-2 border-l-2"></div>
          <div className="border-fg0 absolute right-0 bottom-0 h-3 w-3 rounded-br-sm border-r-2 border-b-2"></div>

          {/* Flame display */}
          <div className="mb-3 text-center">
            <div className="text-primary font-mono text-xs leading-tight whitespace-pre">
              {getFlameArt()}
            </div>
          </div>

          {/* Days display */}
          <div className="text-center">
            <div className="text-fg1 text-3xl font-bold">
              {data.current_streak} DAYS
            </div>
            {flameState === 'EMBER' && (
              <p className="text-orange mt-1 text-sm">
                ⚠ EMBER — Apply today to rekindle
              </p>
            )}
            {flameState === 'EXTINGUISHED' && (
              <p className="text-fg4 mt-1 text-sm">
                {isRecentlyExhausted
                  ? 'The embers still warm...'
                  : 'The fire has gone cold...'}
              </p>
            )}
            {flameState === 'COLD' && (
              <p className="text-fg4 mt-1 text-sm">
                ❄️ COLD — Awaiting the first spark...
              </p>
            )}
          </div>
        </div>

        {/* Stage name and message */}
        {flameState === 'BURNING' && (
          <>
            <div className="mt-4 text-center">
              <div className="text-fg4 text-sm font-semibold">
                {data.flame_name}
              </div>
              <div className="text-fg4 mt-1 text-xs">
                "{flameMessages[data.flame_stage] || 'Keep it up...'}"
              </div>
            </div>

            {/* Stats */}
            <div className="text-fg4 mt-4 flex gap-6 text-xs">
              <span>Best: {data.longest_streak} days</span>
              <span>Total: {data.total_activity_days} days</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
