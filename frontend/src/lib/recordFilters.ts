import type { JobQuery } from './apiV030';
export const MAX_SEARCH_LENGTH = 200;
export const MAX_TAG_LENGTH = 100;
export const MAX_TAGS = 50;
// Ten URL tags fit below the HTTP request-line limit, including Unicode.
export const MAX_FILTER_TAGS = 10;
export const filterTags = (tags: string[]) =>
  [
    ...new Set(
      tags.filter((tag) => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
    ),
  ].slice(0, MAX_FILTER_TAGS);
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
      const tags = filterTags(params.getAll(key));
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
    const list = Array.isArray(values) ? values : [values];
    for (const value of key === 'tags' ? filterTags(list) : list)
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
