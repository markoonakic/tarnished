import type { ThemeColors } from '@/hooks/useThemeColors';

/**
 * Maps status names to theme color keys.
 * Default statuses use theme colors; custom user statuses keep their stored hex.
 */
const STATUS_COLOR_MAP: Record<string, keyof ThemeColors> = {
  'Applied': 'blueBright',
  'Screening': 'yellowBright',
  'Interviewing': 'orangeBright',
  'Offer': 'greenBright',
  'Accepted': 'aquaBright',
  'Rejected': 'redBright',
  'Withdrawn': 'purpleBright',
  'No Reply': 'gray',
};

/**
 * Get a theme-aware color for a status.
 * Returns the mapped theme color for default statuses, or the provided fallback for custom statuses.
 */
export function getStatusColor(
  statusName: string,
  colors: ThemeColors,
  fallbackColor?: string
): string {
  const colorKey = STATUS_COLOR_MAP[statusName];
  if (colorKey) {
    return colors[colorKey];
  }
  // For custom statuses, use the provided fallback (usually the stored DB color)
  return fallbackColor || colors.aqua;
}

/**
 * Get the default color for a new status (theme-aware).
 */
export function getDefaultNewStatusColor(colors: ThemeColors): string {
  return colors.aquaBright;
}

/**
 * Get theme-aware color for a Sankey chart node.
 * Maps node IDs like "status_applied", "terminal_rejected_applied" to theme colors.
 * Returns fallback color for unknown/custom statuses.
 */
export function getSankeyNodeColor(
  nodeId: string,
  colors: ThemeColors,
  fallbackColor?: string
): string {
  // Handle terminal rejected/withdrawn nodes
  if (nodeId.startsWith('terminal_rejected_')) {
    return colors.redBright;
  }
  if (nodeId.startsWith('terminal_withdrawn_')) {
    return colors.purpleBright;
  }

  // Handle regular status nodes
  if (nodeId.startsWith('status_')) {
    // Extract status name from node ID (e.g., "status_applied" -> "Applied")
    const statusName = nodeId
      .replace('status_', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const colorKey = STATUS_COLOR_MAP[statusName];
    if (colorKey) {
      return colors[colorKey];
    }
  }

  // Handle "applications" source node
  if (nodeId === 'applications') {
    return colors.aquaBright;
  }

  // Fallback for unknown nodes
  return fallbackColor || colors.aqua;
}
