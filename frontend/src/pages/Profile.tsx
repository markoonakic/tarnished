import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import HelpTip from '@/components/HelpTip';
import axios from 'axios';
import i18n, { t, locale } from '@/lib/i18n';
import {
  apiV030,
  type Profile as ProfileData,
  type ProfileItem,
  type ProfileUpdate,
} from '@/lib/apiV030';
import { observeRead } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import TagInput from '@/components/TagInput';
import AiToggle from '@/components/AiToggle';
import AiCheckbox from '@/components/AiCheckbox';
import EntryRow from '@/components/EntryRow';
import Dropdown from '@/components/Dropdown';
import SegmentedControl from '@/components/SegmentedControl';

type Section =
  | 'personal'
  | 'job_preferences'
  | 'work_authorization'
  | 'skills'
  | 'work_history'
  | 'projects'
  | 'education'
  | 'certificates'
  | 'languages';
type EntrySection =
  'work_history' | 'projects' | 'education' | 'certificates' | 'languages';
type Field = {
  key: string;
  type?:
    | 'email'
    | 'tel'
    | 'url'
    | 'month'
    | 'date'
    | 'number'
    | 'textarea'
    | 'tags'
    | 'select'
    | 'multi'
    | 'boolean'
    | 'current'
    | 'kind';
  options?: string[];
  required?: boolean;
  max?: number;
};
const sections: {
  key: Section;
  icon: string;
  fields: Field[];
  entry?: boolean;
}[] = [
  {
    key: 'personal',
    icon: 'bi-person',
    fields: [
      { key: 'display_name', max: 255 },
      { key: 'first_name', max: 100 },
      { key: 'last_name', max: 100 },
      { key: 'email', type: 'email' },
      { key: 'phone', type: 'tel', max: 50 },
      { key: 'city', max: 100 },
      { key: 'country', max: 100 },
      { key: 'linkedin_url', type: 'url', max: 512 },
    ],
  },
  {
    key: 'job_preferences',
    icon: 'bi-compass',
    fields: [
      { key: 'desired_positions', type: 'tags' },
      { key: 'fields_of_work', type: 'tags' },
      {
        key: 'seniority',
        type: 'select',
        options: ['intern', 'junior', 'medior', 'senior', 'lead'],
      },
      {
        key: 'work_modes',
        type: 'multi',
        options: ['office', 'hybrid', 'remote'],
      },
      {
        key: 'employment_types',
        type: 'multi',
        options: [
          'full_time',
          'part_time',
          'contract',
          'internship',
          'temporary',
        ],
      },
      { key: 'years_experience', type: 'number' },
    ],
  },
  {
    key: 'work_authorization',
    icon: 'bi-passport',
    fields: [
      { key: 'authorized_to_work', max: 100 },
      { key: 'requires_sponsorship', type: 'boolean' },
      { key: 'location_restrictions', max: 2000 },
    ],
  },
  {
    key: 'skills',
    icon: 'bi-lightning',
    fields: [
      { key: 'skill_items', type: 'tags' },
      { key: 'technologies', type: 'tags' },
    ],
  },
  {
    key: 'work_history',
    icon: 'bi-briefcase',
    entry: true,
    fields: [
      { key: 'title', required: true },
      { key: 'company', required: true },
      { key: 'start_date', type: 'month' },
      { key: 'end_date', type: 'month' },
      { key: 'current', type: 'current' },
      { key: 'description', type: 'textarea' },
    ],
  },
  {
    key: 'projects',
    icon: 'bi-kanban',
    entry: true,
    fields: [
      { key: 'name', required: true },
      { key: 'kind', type: 'kind' },
      { key: 'description', type: 'textarea' },
      { key: 'technologies', type: 'tags' },
      { key: 'link', type: 'url' },
    ],
  },
  {
    key: 'education',
    icon: 'bi-mortarboard',
    entry: true,
    fields: [
      { key: 'institution', required: true },
      { key: 'degree' },
      { key: 'field' },
      { key: 'start_date', type: 'month' },
      { key: 'end_date', type: 'month' },
    ],
  },
  {
    key: 'certificates',
    icon: 'bi-patch-check',
    entry: true,
    fields: [
      { key: 'name', required: true },
      { key: 'issuer' },
      { key: 'date', type: 'date' },
      { key: 'link', type: 'url' },
    ],
  },
  {
    key: 'languages',
    icon: 'bi-translate',
    entry: true,
    fields: [
      { key: 'name', required: true },
      {
        key: 'level',
        type: 'select',
        options: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'],
      },
    ],
  },
];
const inputClass =
  'bg-bg2 text-fg1 focus:ring-accent-bright mt-1 w-full rounded px-3 py-2 focus:ring-2 focus:outline-none';
const ghostClass =
  'text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50 focus:ring-2 focus:ring-accent';
const saveClass =
  'bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50 flex items-center gap-1.5 focus:ring-2 focus:ring-accent';
const label = (key: string) => t(`accounts.${key}`);
const optionLabel = (value: string) =>
  !value
    ? '—'
    : /^[ABC][12]$/.test(value)
      ? value
      : i18n.exists(`accounts.${value.toLowerCase()}`)
        ? label(
            value.toLowerCase() === 'personal'
              ? 'personalProject'
              : value.toLowerCase()
          )
        : value;
function tags(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === 'string' ? item : String(item.name ?? '')
        )
        .filter(Boolean)
    : [];
}
function summary(value: unknown, field?: Field): string {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && !value.length)
  )
    return '—';
  if (typeof value === 'boolean') return label(value ? 'yes' : 'no');
  if (Array.isArray(value))
    return tags(value)
      .map((item) => (field?.type === 'multi' ? optionLabel(item) : item))
      .join(', ');
  return field?.type === 'select' ? optionLabel(String(value)) : String(value);
}
function itemTitle(section: EntrySection, item: ProfileItem): string {
  return String(
    section === 'work_history'
      ? [item.title ?? item.name, item.company ?? item.employer]
          .filter(Boolean)
          .join(' · ')
      : section === 'projects'
        ? [item.name, optionLabel(String(item.kind ?? 'personal'))]
            .filter(Boolean)
            .join(' · ')
        : section === 'education'
          ? (item.degree ?? item.qualification ?? item.institution ?? '')
          : (item.name ?? item.language ?? '')
  );
}
function itemSubtitle(section: EntrySection, item: ProfileItem): string {
  if (section === 'languages')
    return optionLabel(String(item.level ?? item.proficiency ?? ''));
  const month = (value: unknown) => {
    if (!value) return '';
    const date = new Date(`${String(value).slice(0, 7)}-01T12:00:00`);
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(locale(), {
          month: 'short',
          year: 'numeric',
        }).format(date);
  };
  const dates = [
    month(item.start_date),
    item.current ? label('present') : month(item.end_date),
  ]
    .filter(Boolean)
    .join(' – ');
  if (section === 'projects')
    return [item.description, tags(item.technologies).join(', ')]
      .filter(Boolean)
      .join(' · ');
  return [
    section === 'work_history' ? undefined : (item.institution ?? item.issuer),
    dates || month(item.date),
    item.description,
  ]
    .filter(Boolean)
    .join(' · ');
}
function Fields({
  fields,
  value,
  onChange,
  entry = false,
  prefix = '',
}: {
  fields: Field[];
  value: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  entry?: boolean;
  prefix?: string;
}) {
  return (
    <div className={`grid gap-4 ${entry ? '' : 'sm:grid-cols-2'}`}>
      {fields.map((field) => {
        const current = value[field.key];
        const id = `profile-${entry ? 'entry-' : ''}${prefix}${field.key}`;
        if (field.type === 'current')
          return (
            <label
              key={field.key}
              className="text-muted flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={Boolean(current)}
                onChange={(e) => {
                  onChange(field.key, e.target.checked);
                  if (e.target.checked) onChange('end_date', '');
                }}
              />
              {label(field.key)}
            </label>
          );
        return (
          <div
            key={field.key}
            className={field.type === 'textarea' ? 'sm:col-span-full' : ''}
          >
            <label htmlFor={id} className="text-muted mb-1 block text-sm">
              {label(field.key)}
            </label>
            {field.type === 'tags' ? (
              <TagInput
                id={id}
                label={label(field.key)}
                value={tags(current)}
                onChange={(items) => onChange(field.key, items)}
              />
            ) : field.type === 'multi' ? (
              <div className="flex flex-wrap gap-3">
                {field.options?.map((option) => (
                  <label
                    key={option}
                    className="text-fg1 flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={tags(current).includes(option)}
                      onChange={(e) =>
                        onChange(
                          field.key,
                          e.target.checked
                            ? [...tags(current), option]
                            : tags(current).filter((item) => item !== option)
                        )
                      }
                    />
                    {optionLabel(option)}
                  </label>
                ))}
              </div>
            ) : field.type === 'kind' ? (
              <SegmentedControl
                label={label(field.key)}
                options={['personal', 'professional'].map((option) => ({
                  value: option,
                  label: optionLabel(option),
                }))}
                value={String(current ?? 'personal')}
                onChange={(item) => onChange(field.key, item)}
              />
            ) : field.type === 'select' || field.type === 'boolean' ? (
              <Dropdown
                id={id}
                value={
                  field.type === 'boolean'
                    ? current === null || current === undefined
                      ? ''
                      : String(current)
                    : String(current ?? '')
                        .toLowerCase()
                        .replace(
                          /^([abc])([12])$/,
                          (_, a: string, b: string) => a.toUpperCase() + b
                        )
                }
                options={[
                  { value: '', label: label('unknown') },
                  ...(field.type === 'boolean'
                    ? [
                        { value: 'true', label: label('yes') },
                        { value: 'false', label: label('no') },
                      ]
                    : (field.options ?? []).map((option) => ({
                        value: option,
                        label: optionLabel(option),
                      }))),
                ]}
                onChange={(item) =>
                  onChange(
                    field.key,
                    field.type === 'boolean'
                      ? item === ''
                        ? null
                        : item === 'true'
                      : item || null
                  )
                }
              />
            ) : field.type === 'textarea' ? (
              <textarea
                id={id}
                rows={4}
                className={inputClass}
                value={String(current ?? '')}
                maxLength={10000}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            ) : (
              <input
                id={id}
                className={inputClass}
                type={field.type ?? 'text'}
                value={String(current ?? '')}
                required={field.required}
                maxLength={field.max ?? 255}
                min={field.type === 'number' ? 0 : undefined}
                max={field.type === 'number' ? 100 : undefined}
                step={field.type === 'number' ? 'any' : undefined}
                disabled={field.key === 'end_date' && Boolean(value.current)}
                onChange={(e) =>
                  onChange(
                    field.key,
                    field.type === 'number'
                      ? e.target.value === ''
                        ? null
                        : Number(e.target.value)
                      : e.target.value
                  )
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Profile() {
  useTranslation();
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [entry, setEntry] = useState<{
    section: EntrySection;
    value: ProfileItem;
    allowed: boolean;
    existing: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    section: EntrySection;
    item: ProfileItem;
  } | null>(null);
  const load = useCallback(async () => {
    try {
      setProfile(await apiV030.profile());
      setError('');
      setStale(false);
    } catch (cause) {
      setError(label('loadError'));
      return { error: cause };
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => observeRead(load, { staleTime: Infinity }), [load]);
  async function save(
    data: Omit<ProfileUpdate, 'expected_revision'>
  ): Promise<boolean> {
    if (!profile || busy) return false;
    setBusy(true);
    setError('');
    try {
      const updated = await apiV030.updateProfile({
        ...data,
        expected_revision: profile.revision,
      });
      setProfile(updated);
      setStale(false);
      if ('display_name' in data) void refreshUser();
      return true;
    } catch (cause) {
      const conflict =
        axios.isAxiosError(cause) && cause.response?.status === 409;
      setStale(conflict);
      setError(label(conflict ? 'staleError' : 'saveError'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function edit(section: Section) {
    if (!profile) return;
    const items = ['work_history', 'education'].includes(section)
      ? (profile[section as EntrySection] ?? []).map((item) => ({
          ...item,
          start_date: item.start_date
            ? String(item.start_date).slice(0, 7)
            : '',
          end_date: item.end_date ? String(item.end_date).slice(0, 7) : '',
        }))
      : profile[section as EntrySection];
    setDraft({
      ...profile,
      ...(sections.find((item) => item.key === section)?.entry
        ? { [section]: items }
        : {}),
    });
    setEditing(section);
    setError('');
  }
  function newEntry(section: EntrySection, existing?: ProfileItem) {
    setError('');
    const value: ProfileItem = existing
      ? {
          ...existing,
          ...(existing.needs_repair ? { needs_repair: false } : {}),
          ...(['work_history', 'education'].includes(section)
            ? {
                start_date: existing.start_date
                  ? String(existing.start_date).slice(0, 7)
                  : '',
                end_date: existing.end_date
                  ? String(existing.end_date).slice(0, 7)
                  : '',
              }
            : {}),
        }
      : {
          id: crypto.randomUUID(),
          ...(section === 'projects' ? { kind: 'personal' } : {}),
        };
    setEntry({
      section,
      value,
      existing: Boolean(existing),
      allowed: profile?.ai_permissions[value.id] !== false,
    });
  }
  async function saveEntry() {
    if (!profile || !entry) return;
    const items = profile[entry.section] ?? [];
    const value = { ...entry.value };
    // Native month inputs store YYYY-MM; the API uses complete ISO dates.
    if (entry.section === 'work_history' || entry.section === 'education')
      for (const key of ['start_date', 'end_date'])
        value[key] = value[key] ? `${String(value[key]).slice(0, 7)}-01` : null;
    if (entry.section === 'work_history' && value.current)
      value.end_date = null;
    const changed = entry.existing
      ? items.map((item) => (item.id === value.id ? value : item))
      : [...items, value];
    if (
      await save({
        [entry.section]: changed,
        ai_permissions: {
          ...profile.ai_permissions,
          [value.id]: entry.allowed,
        },
      })
    )
      setEntry(null);
  }
  async function saveSection(section: (typeof sections)[number]) {
    if (!profile) return;
    const data: Record<string, unknown> = {};
    if (section.entry) {
      data[section.key] = ((draft[section.key] as ProfileItem[]) ?? []).map(
        (item) => {
          const value = { ...item };
          if (section.key === 'work_history' || section.key === 'education')
            for (const key of ['start_date', 'end_date'])
              value[key] = value[key]
                ? `${String(value[key]).slice(0, 7)}-01`
                : null;
          if (section.key === 'work_history' && value.current)
            value.end_date = null;
          return value;
        }
      );
    } else
      for (const field of section.fields) {
        const value = draft[field.key];
        if (section.key === 'skills') {
          const previous = profile[field.key as 'skill_items' | 'technologies'];
          data[field.key] = tags(value).map(
            (name) =>
              previous.find((item) => item.name === name) ?? {
                id: crypto.randomUUID(),
                name,
              }
          );
        } else
          data[field.key] =
            typeof value === 'string' && !value.trim() ? null : value;
      }
    if (await save(data as ProfileUpdate)) setEditing(null);
  }
  function review() {
    if (!profile) return;
    for (const section of sections.filter((item) => item.key !== 'personal')) {
      if (profile.ai_permissions[section.key] === false) {
        document
          .getElementById(section.key)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const items = section.entry
        ? profile[section.key as EntrySection]
        : section.key === 'skills'
          ? [...profile.skill_items, ...profile.technologies]
          : [];
      const excluded = items?.find(
        (item) => profile.ai_permissions[item.id] === false
      );
      if (excluded) {
        document
          .getElementById(excluded.id)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }
  let total = 0;
  let allowed = 0;
  if (profile)
    for (const section of sections.filter((item) => item.key !== 'personal')) {
      const enabled = profile.ai_permissions[section.key] !== false;
      if (section.entry || section.key === 'skills') {
        const items =
          section.key === 'skills'
            ? [...profile.skill_items, ...profile.technologies]
            : (profile[section.key as EntrySection] ?? []);
        total += items.length;
        allowed += items.filter(
          (item) =>
            enabled &&
            profile.ai_permissions[item.id] !== false &&
            !item.needs_repair
        ).length;
      } else
        for (const field of section.fields) {
          const value = profile[field.key as keyof ProfileData];
          if (
            value !== null &&
            value !== undefined &&
            value !== '' &&
            (!Array.isArray(value) || value.length)
          ) {
            total++;
            if (enabled && profile.ai_permissions[field.key] !== false)
              allowed++;
          }
        }
    }
  const viewProfile: Record<string, unknown> = profile
    ? {
        ...profile,
        name:
          [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
          profile.display_name,
        cityCountry: [profile.city, profile.country].filter(Boolean).join(', '),
      }
    : {};
  const modalSection = entry
    ? sections.find((section) => section.key === entry.section)!
    : null;
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <h1 className="text-primary text-2xl font-bold">
            {label('profile')}
          </h1>
          <HelpTip label={label('profile')}>{label('profileSubtitle')}</HelpTip>
        </div>
        {error && !entry && (
          <div
            role="alert"
            className="text-red border-red mb-4 rounded border p-3"
          >
            {error}
            {stale && (
              <button className={ghostClass} onClick={() => void load()}>
                <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
                {label('reload')}
              </button>
            )}
          </div>
        )}
        {loading ? (
          <Loading message={label('loading')} />
        ) : !profile ? (
          <button className={saveClass} onClick={() => void load()}>
            <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
            {label('retry')}
          </button>
        ) : (
          <>
            {!total && !profile.display_name && !profile.first_name ? (
              <div className="bg-secondary mb-6 rounded-lg p-6">
                <EmptyState
                  message={label('emptyProfile')}
                  action={{
                    label: label('editProfile'),
                    onClick: () => edit('personal'),
                  }}
                />
              </div>
            ) : (
              <div className="bg-secondary mb-6 flex flex-wrap items-start justify-between gap-4 rounded-lg p-6">
                <div>
                  <h2 className="text-fg1 text-2xl font-bold">
                    {profile.display_name ||
                      [profile.first_name, profile.last_name]
                        .filter(Boolean)
                        .join(' ') ||
                      label('profile')}
                  </h2>
                  <p className="text-fg2 mt-1 text-sm">
                    {profile.desired_positions.join(' · ')}
                  </p>
                  <p className="text-muted mt-1 text-sm">
                    <i className="bi-geo-alt" aria-hidden="true" />{' '}
                    {[profile.city, profile.country]
                      .filter(Boolean)
                      .join(', ') || profile.location}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ...(profile.seniority
                        ? [optionLabel(profile.seniority)]
                        : []),
                      ...profile.work_modes.map(optionLabel),
                      ...profile.employment_types.map(optionLabel),
                      ...(profile.years_experience !== null
                        ? [
                            t('accounts.years', {
                              count: profile.years_experience,
                            }),
                          ]
                        : []),
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="bg-bg3 text-fg2 rounded px-2 py-0.5 text-xs"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-bg2 rounded-lg p-4 text-sm">
                  <p className="text-fg1">
                    <i
                      className="bi-stars text-accent mr-2"
                      aria-hidden="true"
                    />
                    {t('accounts.aiCount', { allowed, total, count: total })}
                  </p>
                  {allowed < total && (
                    <button className={`${ghostClass} px-0`} onClick={review}>
                      <i
                        className="bi-arrow-right icon-sm"
                        aria-hidden="true"
                      />
                      {label('review')}
                    </button>
                  )}
                </div>
              </div>
            )}
            {sections.map((section) => {
              const enabled = profile.ai_permissions[section.key] !== false;
              const isEditing = editing === section.key;
              const items = section.entry
                ? (profile[section.key as EntrySection] ?? [])
                : [];
              return (
                <div key={section.key} id={section.key}>
                  <Card
                    title={label(section.key)}
                    icon={section.icon}
                    actions={
                      <>
                        {section.key === 'personal' ? (
                          <span className="text-muted flex items-center gap-1 text-xs">
                            <i className="bi-lock" aria-hidden="true" />
                            {label('notUsedByAi')}
                          </span>
                        ) : (
                          <>
                            <AiToggle
                              checked={enabled}
                              disabled={busy}
                              label={label('ai')}
                              onChange={(checked) =>
                                void save({
                                  ai_permissions: {
                                    ...profile.ai_permissions,
                                    [section.key]: checked,
                                  },
                                })
                              }
                            />
                            {!enabled && (
                              <span className="text-muted text-xs">
                                {label('notUsedByAi')}
                              </span>
                            )}
                          </>
                        )}
                        {!isEditing && (
                          <button
                            className={ghostClass}
                            disabled={busy}
                            onClick={() => edit(section.key)}
                          >
                            <i className="bi-pencil mr-1" aria-hidden="true" />
                            {label('edit')}
                          </button>
                        )}
                      </>
                    }
                  >
                    {section.entry && isEditing ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveSection(section);
                        }}
                      >
                        <fieldset disabled={busy} className="space-y-6">
                          {((draft[section.key] as ProfileItem[]) ?? []).map(
                            (item) => (
                              <div
                                key={item.id}
                                className="bg-bg2 space-y-4 rounded-lg p-4"
                              >
                                <Fields
                                  fields={section.fields}
                                  value={item}
                                  entry
                                  prefix={item.id + '-'}
                                  onChange={(key, value) =>
                                    setDraft((previous) => ({
                                      ...previous,
                                      [section.key]: (
                                        previous[section.key] as ProfileItem[]
                                      ).map((row) =>
                                        row.id === item.id
                                          ? { ...row, [key]: value }
                                          : row
                                      ),
                                    }))
                                  }
                                />
                                <AiCheckbox
                                  checked={
                                    profile.ai_permissions[item.id] !== false
                                  }
                                  disabled={
                                    !enabled || Boolean(item.needs_repair)
                                  }
                                  label={label('aiMayUseEntry')}
                                  onChange={(checked) =>
                                    void save({
                                      ai_permissions: {
                                        ...profile.ai_permissions,
                                        [item.id]: checked,
                                      },
                                    })
                                  }
                                />
                              </div>
                            )
                          )}
                          {!items.length && (
                            <p className="text-muted text-sm">
                              {label('noEntries')}
                            </p>
                          )}
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              className={ghostClass}
                              onClick={() => setEditing(null)}
                            >
                              <i
                                className="bi-x-lg icon-sm"
                                aria-hidden="true"
                              />
                              {label('cancel')}
                            </button>
                            <button className={saveClass}>
                              <i
                                className="bi-check2 icon-sm"
                                aria-hidden="true"
                              />
                              {label('save')}
                            </button>
                          </div>
                        </fieldset>
                      </form>
                    ) : section.entry ? (
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            id={item.id}
                            className={
                              item.needs_repair
                                ? 'border-yellow rounded border'
                                : ''
                            }
                          >
                            <EntryRow
                              title={itemTitle(
                                section.key as EntrySection,
                                item
                              )}
                              subtitle={itemSubtitle(
                                section.key as EntrySection,
                                item
                              )}
                              aiAllowed={
                                profile.ai_permissions[item.id] !== false
                              }
                              aiDisabled={
                                !enabled || busy || Boolean(item.needs_repair)
                              }
                              onAiChange={(checked) =>
                                void save({
                                  ai_permissions: {
                                    ...profile.ai_permissions,
                                    [item.id]: checked,
                                  },
                                })
                              }
                              onEdit={() =>
                                !busy &&
                                newEntry(section.key as EntrySection, item)
                              }
                              onDelete={() =>
                                !busy &&
                                setDeleting({
                                  section: section.key as EntrySection,
                                  item,
                                })
                              }
                            />
                            {item.needs_repair && (
                              <p className="text-yellow mt-1 text-xs">
                                {label('repair')}
                              </p>
                            )}
                          </div>
                        ))}
                        {!items.length && (
                          <p className="text-muted text-sm">
                            {label('noEntries')}
                          </p>
                        )}
                        <button
                          className={`${ghostClass} mt-2 px-0`}
                          disabled={busy}
                          onClick={() => newEntry(section.key as EntrySection)}
                        >
                          <i
                            className="bi-plus-lg icon-sm"
                            aria-hidden="true"
                          />
                          + {label(`add_${section.key}`)}
                        </button>
                      </div>
                    ) : isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveSection(section);
                        }}
                      >
                        <fieldset disabled={busy}>
                          <Fields
                            fields={section.fields}
                            value={draft}
                            onChange={(key, value) =>
                              setDraft((previous) => ({
                                ...previous,
                                [key]: value,
                              }))
                            }
                          />
                          <div className="mt-6 flex justify-end gap-3">
                            <button
                              type="button"
                              className={ghostClass}
                              onClick={() => setEditing(null)}
                            >
                              <i
                                className="bi-x-lg icon-sm"
                                aria-hidden="true"
                              />
                              {label('cancel')}
                            </button>
                            <button className={saveClass}>
                              <i
                                className="bi-check2 icon-sm"
                                aria-hidden="true"
                              />
                              {label('save')}
                            </button>
                          </div>
                        </fieldset>
                      </form>
                    ) : (
                      <dl
                        className={`grid gap-4 ${section.key === 'skills' ? '' : 'sm:grid-cols-2'}`}
                      >
                        {(section.key === 'personal'
                          ? ([
                              { key: 'name' },
                              { key: 'email' },
                              { key: 'phone' },
                              { key: 'cityCountry' },
                              { key: 'linkedin_url' },
                            ] as Field[])
                          : section.fields
                        ).map((field) => (
                          <div key={field.key}>
                            <dt className="text-muted text-xs">
                              {label(
                                section.key === 'personal' &&
                                  field.key === 'name'
                                  ? 'personName'
                                  : field.key
                              )}
                            </dt>
                            <dd className="text-fg1 mt-1 text-sm break-words">
                              {field.type === 'tags' ? (
                                <div className="flex flex-wrap gap-1">
                                  {tags(
                                    profile[field.key as keyof ProfileData]
                                  ).map((tag) => (
                                    <span
                                      key={tag}
                                      className="bg-bg3 text-fg2 rounded px-2 py-0.5 text-xs"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {!tags(
                                    profile[field.key as keyof ProfileData]
                                  ).length && '—'}
                                </div>
                              ) : (
                                summary(viewProfile[field.key], field)
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </Card>
                </div>
              );
            })}
          </>
        )}
        {entry && modalSection && (
          <Modal
            label={label(`${entry.existing ? 'edit' : 'add'}_${entry.section}`)}
            busy={busy}
            onClose={() => setEntry(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveEntry();
              }}
              className="bg-secondary mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg p-6"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-fg1 text-xl font-bold">
                  {label(`${entry.existing ? 'edit' : 'add'}_${entry.section}`)}
                </h2>
                <button
                  type="button"
                  aria-label={label('close')}
                  disabled={busy}
                  className={ghostClass}
                  onClick={() => setEntry(null)}
                  title={label('close')}
                >
                  <i className="bi-x-lg" aria-hidden="true" />
                </button>
              </div>
              {error && (
                <div role="alert" className="text-red mb-4">
                  {error}
                  {stale && (
                    <button
                      type="button"
                      className={ghostClass}
                      onClick={() => void load()}
                    >
                      <i
                        className="bi-arrow-clockwise icon-sm"
                        aria-hidden="true"
                      />
                      {label('reload')}
                    </button>
                  )}
                </div>
              )}
              <fieldset disabled={busy}>
                <Fields
                  fields={modalSection.fields}
                  value={entry.value}
                  entry
                  onChange={(key, value) =>
                    setEntry((previous) =>
                      previous
                        ? {
                            ...previous,
                            value: { ...previous.value, [key]: value },
                          }
                        : null
                    )
                  }
                />
                <div className="mt-4">
                  <AiCheckbox
                    label={label('aiMayUseEntry')}
                    checked={entry.allowed}
                    disabled={profile?.ai_permissions[entry.section] === false}
                    onChange={(checked) =>
                      setEntry({ ...entry, allowed: checked })
                    }
                  />
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className={ghostClass}
                    onClick={() => setEntry(null)}
                  >
                    <i className="bi-x-lg icon-sm" aria-hidden="true" />
                    {label('cancel')}
                  </button>
                  <button className={saveClass}>
                    <i className="bi-check2 icon-sm" aria-hidden="true" />
                    {label('save')}
                  </button>
                </div>
              </fieldset>
            </form>
          </Modal>
        )}
        {deleting && profile && (
          <Modal
            label={label('deleteEntry')}
            busy={busy}
            onClose={() => setDeleting(null)}
          >
            <div className="bg-secondary mx-4 w-full max-w-md rounded-lg p-6">
              <h2 className="text-fg1 text-xl font-bold">
                {label('deleteEntry')}
              </h2>
              <p className="text-muted my-4">
                {t('accounts.deleteEntryBody', {
                  name: itemTitle(deleting.section, deleting.item),
                })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  className={ghostClass}
                  disabled={busy}
                  onClick={() => setDeleting(null)}
                >
                  <i className="bi-x-lg icon-sm" aria-hidden="true" />
                  {label('cancel')}
                </button>
                <button
                  className="text-red hover:bg-bg2 hover:text-red-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await save({
                        [deleting.section]: (
                          profile[deleting.section] ?? []
                        ).filter((item) => item.id !== deleting.item.id),
                      })
                    )
                      setDeleting(null);
                  }}
                >
                  <i className="bi-trash icon-sm" aria-hidden="true" />
                  {label('delete')}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}
