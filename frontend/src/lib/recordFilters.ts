import type { JobQuery } from './apiV030';
export const MAX_SEARCH_LENGTH = 200;
export const advancedFilterKeys = [
  'company_id',
  'location',
  'work_mode',
  'employment_type',
  'seniority',
  'priority',
  'tags',
  'date_field',
  'date_from',
  'date_to',
  'show_archived',
] as const;
export const recordFilterKeys = [
  'search',
  'status',
  'decision',
  'source',
  ...advancedFilterKeys,
] as const;

export function recordFilters(params: URLSearchParams): JobQuery {
  const result: JobQuery = {};
  for (const key of advancedFilterKeys) {
    if (key === 'tags') {
      const tags = params.getAll(key).filter(Boolean);
      if (tags.length) result.tags = tags;
    } else if (key === 'show_archived') {
      if (params.get(key) === 'true') result.show_archived = true;
    } else if (params.get(key))
      Object.assign(result, { [key]: params.get(key) });
  }
  return result;
}

export function changeRecordFilters(
  params: URLSearchParams,
  changes: Record<string, string | string[]>
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, values] of Object.entries(changes)) {
    next.delete(key);
    for (const value of Array.isArray(values) ? values : [values])
      if (value)
        next.append(
          key,
          key === 'search' || key === 'query'
            ? value.slice(0, MAX_SEARCH_LENGTH)
            : value
        );
  }
  if (Object.keys(changes).some((key) => key !== 'page' && key !== 'view'))
    next.set('page', '1');
  return next;
}
