import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { colors } from '@/lib/theme';
import FrozenBlockIcon from '@/components/icons/FrozenBlockIcon';
import SmokingOrbIcon from '@/components/icons/SmokingOrbIcon';
import BurningEmbersIcon from '@/components/icons/BurningEmbersIcon';
import CelebrationFireIcon from '@/components/icons/CelebrationFireIcon';

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
  1: "A single spark...",
  2: "It flickers...",
  3: "The embers glow...",
  4: "Something awakens...",
  5: "It grows stronger...",
  6: "Brighter now...",
  7: "A flame is born...",
  8: "Finding its form...",
  9: "Burning steady...",
  10: "Gaining momentum...",
  11: "Unstoppable force...",
  12: "A true blaze...",
  13: "Inferno unleashed...",
  14: "Transcendent...",
  15: "Beyond mortal...",
};

type FlameState = 'BURNING' | 'EMBER' | 'EXTINGUISHED' | 'COLD';

export default function FlameEmblem() {
  const { data, isLoading } = useQuery<StreakData>({
    queryKey: ['streak'],
    queryFn: () => api.get('/api/streak').then(r => r.data),
  });

  const isRecentlyExhausted = !data || !data.streak_exhausted_at || data.longest_streak === 0
    ? false
    : (() => {
        const daysSinceExhausted = Math.floor(
          (Date.now() - new Date(data.streak_exhausted_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSinceExhausted <= 7;
      })();

  if (isLoading) {
    return (
      <div className="bg-secondary p-6 mb-6">
        <div className="animate-pulse">
          <div className="h-20 bg-tertiary rounded mb-4"></div>
          <div className="h-4 bg-tertiary rounded w-48"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isEmber = data.ember_active;
  // Extinguished means HAD a streak but lost it (longest_streak > 0)
  const isExtinguished = data.current_streak === 0 && !isEmber && data.longest_streak > 0;
  // Never lit means never had any streak
  const neverLit = data.current_streak === 0 && !isEmber && data.longest_streak === 0;

  const flameState: FlameState = neverLit ? 'COLD' : isExtinguished ? 'EXTINGUISHED' : isEmber ? 'EMBER' : 'BURNING';

  return (
    <div className="bg-secondary p-6 mb-6">
      <div className="flex flex-col items-center justify-center py-4">
        {/* Emblem frame - Elden Ring inspired ornate border */}
        <div
          className={`
            relative px-12 py-6 border-2 rounded-lg
            ${flameState === 'COLD' ? 'border-tertiary' : 'border-accent-aqua'}
            transition-all duration-300
          `}
          style={{
            ...(isEmber && { borderColor: colors.orange }),
            animation: (flameState === 'BURNING' || flameState === 'EMBER') ? 'flicker 2s ease-in-out infinite' : 'none',
          }}
        >
          {/* Decorative corners */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-fg4"></div>
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-fg4"></div>
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-fg4"></div>
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-fg4"></div>

          {/* Flame display */}
          <div className="text-center mb-3">
            {flameState === 'BURNING' && (
              <CelebrationFireIcon color={colors.orangeBright} />
            )}
            {flameState === 'EMBER' && (
              <BurningEmbersIcon color={colors.yellowBright} />
            )}
            {flameState === 'EXTINGUISHED' && (
              isRecentlyExhausted ? (
                <SmokingOrbIcon color={colors.gray} />
              ) : (
                <FrozenBlockIcon color={colors.fg4} />
              )
            )}
            {flameState === 'COLD' && (
              <FrozenBlockIcon color={colors.fg4} />
            )}
          </div>

          {/* Days display */}
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: colors.fg1 }}>
              {data.current_streak} DAYS
            </div>
            {flameState === 'EMBER' && (
              <p className="text-sm mt-1" style={{ color: colors.orange }}>
                ⚠ EMBER — Apply today to rekindle
              </p>
            )}
            {flameState === 'EXTINGUISHED' && (
              <p className="text-sm mt-1" style={{ color: colors.fg4 }}>
                {isRecentlyExhausted
                  ? "The embers still warm..."
                  : "The fire has gone cold..."}
              </p>
            )}
            {flameState === 'COLD' && (
              <p className="text-sm mt-1" style={{ color: colors.fg4 }}>
                ❄️ COLD — Awaiting the first spark...
              </p>
            )}
          </div>
        </div>

        {/* Stage name and message */}
        {flameState === 'BURNING' && (
          <>
            <div className="text-center mt-4">
              <div className="text-sm font-semibold" style={{ color: colors.fg4 }}>
                {data.flame_name}
              </div>
              <div className="text-xs mt-1" style={{ color: colors.fg4 }}>
                "{flameMessages[data.flame_stage] || 'Keep it up...'}"
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-6 mt-4 text-xs" style={{ color: colors.fg4 }}>
              <span>Best: {data.longest_streak} days</span>
              <span>Total: {data.total_activity_days} days</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
