import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { colors } from '@/lib/theme';

interface StreakData {
  current_streak: number;
  longest_streak: number;
  total_activity_days: number;
  last_activity_date: string | null;
  ember_active: boolean;
  flame_stage: number;
  flame_name: string;
  flame_art: string;
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

export default function FlameEmblem() {
  const { data, isLoading } = useQuery<StreakData>({
    queryKey: ['streak'],
    queryFn: () => api.get('/api/streak').then(r => r.data),
  });

  if (isLoading) {
    return (
      <div className="bg-secondary rounded-lg p-6 border border-tertiary">
        <div className="animate-pulse">
          <div className="h-20 bg-tertiary rounded mb-4"></div>
          <div className="h-4 bg-tertiary rounded w-48"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isEmber = data.ember_active;
  const isExtinguished = data.current_streak === 0 && !isEmber;

  // Determine flame colors based on state
  const getFlameColors = () => {
    if (isExtinguished) {
      return { primary: colors.gray, secondary: colors.gray };
    }
    if (isEmber) {
      return { primary: colors.orange, secondary: colors.yellowBright };
    }
    return { primary: colors.orangeBright, secondary: colors.yellowBright };
  };

  const flameColors = getFlameColors();

  return (
    <div className="bg-secondary rounded-lg p-6 border border-tertiary">
      <div className="flex flex-col items-center justify-center py-4">
        {/* Emblem frame - Elden Ring inspired ornate border */}
        <div
          className={`
            relative px-12 py-6 border-2 rounded-lg
            ${isExtinguished ? 'border-tertiary' : 'border-accent-aqua'}
            transition-all duration-300
          `}
          style={{
            ...(isEmber && { borderColor: colors.orange }),
            animation: (isEmber || data.current_streak > 0) ? 'flicker 2s ease-in-out infinite' : 'none',
          }}
        >
          {/* Decorative corners */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-fg4"></div>
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-fg4"></div>
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-fg4"></div>
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-fg4"></div>

          {/* Flame display */}
          <div className="text-center mb-3">
            {isExtinguished ? (
              <span className="text-4xl opacity-30">○</span>
            ) : (
              <span
                className="text-4xl"
                style={{ color: flameColors.primary }}
              >
                🔥
              </span>
            )}
          </div>

          {/* Days display */}
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: colors.fg1 }}>
              {data.current_streak} DAYS
            </div>
            {isEmber && (
              <div className="text-sm mt-1" style={{ color: colors.orange }}>
                ⚠ EMBER — Apply today to rekindle
              </div>
            )}
            {isExtinguished && (
              <div className="text-sm mt-1" style={{ color: colors.fg4 }}>
                💀 EXTINGUISHED — The fire has gone cold...
              </div>
            )}
          </div>
        </div>

        {/* Stage name and message */}
        {!isExtinguished && (
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
