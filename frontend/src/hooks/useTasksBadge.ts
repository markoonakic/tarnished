// Filled by the reminders worker. No request is made before the endpoint exists.
export function useTasksBadge(): { count: number; overdue: boolean } {
  return { count: 0, overdue: false };
}
