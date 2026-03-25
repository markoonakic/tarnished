import type { Application, Round } from './types';

export function preserveApplicationRounds(
  previous: Application | null,
  updated: Application
): Application {
  return previous ? { ...updated, rounds: previous.rounds } : updated;
}

export function upsertApplicationRound(
  rounds: Round[] | undefined,
  savedRound: Round
): Round[] {
  const currentRounds = rounds || [];
  const existingIndex = currentRounds.findIndex(
    (round) => round.id === savedRound.id
  );

  if (existingIndex >= 0) {
    const nextRounds = [...currentRounds];
    nextRounds[existingIndex] = savedRound;
    return nextRounds;
  }

  return [...currentRounds, savedRound];
}

export function removeApplicationRound(
  application: Application | null,
  roundId: string
): Application | null {
  if (!application) {
    return null;
  }

  return {
    ...application,
    rounds: application.rounds?.filter((round) => round.id !== roundId) || [],
  };
}

export function mergeApplicationRoundMedia(
  current: Application | null,
  refreshed: Application,
  roundId: string
): Application {
  if (!current) {
    return refreshed;
  }

  const updatedRound = refreshed.rounds?.find((round) => round.id === roundId);
  if (!updatedRound) {
    return current;
  }

  return {
    ...current,
    rounds:
      current.rounds?.map((round) =>
        round.id === roundId ? updatedRound : round
      ) || [],
  };
}
