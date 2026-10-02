import type { ThemeColors } from '@/hooks/useThemeColors';

// Default statuses follow the theme; custom statuses keep their saved color.
const STATUS_COLOR_MAP: Record<string, keyof ThemeColors> = {
  Applied: 'blueBright',
  Screening: 'yellowBright',
  Interviewing: 'orangeBright',
  Offer: 'greenBright',
  Accepted: 'aquaBright',
  Rejected: 'redBright',
  Withdrawn: 'purpleBright',
  'No Reply': 'gray',
};

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
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const colorKey = STATUS_COLOR_MAP[statusName];
    if (colorKey) {
      return colors[colorKey];
    }
  }

  // Fallback for unknown nodes
  return fallbackColor || colors.aqua;
}
