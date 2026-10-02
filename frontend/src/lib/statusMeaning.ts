import type { Status } from './types';

// The API's name-based visibility can shadow a still-valid current reference.
export function statusOptionsWithCurrent(
  statuses: Status[],
  current?: Status
): Status[] {
  return current && !statuses.some((status) => status.id === current.id)
    ? [...statuses, current]
    : statuses;
}
