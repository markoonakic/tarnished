import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { observeRead } from '@/lib/queryClient';
import { useToast } from '@/hooks/useToast';
import { getProfile, updateProfile } from '@/lib/profile';
import type { UserProfile } from '@/lib/types';
import Loading from '../Loading';
import { CardHeader } from '../Card';

export default function SettingsProfile({
  section = false,
}: {
  section?: boolean;
}) {
  useTranslation();
  const toast = useToast();
  const { error: showError } = toast;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (error) {
      showError(t('Failed to load profile'));
      return { error };
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(
    () => observeRead(loadProfile, { staleTime: Infinity }),
    [loadProfile]
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || saving) return;

    setSaving(true);
    try {
      await updateProfile({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        linkedin_url: profile.linkedin_url,
        city: profile.city,
        country: profile.country,
      });
      toast.success(t('Profile saved successfully'));
    } catch {
      showError(t('Failed to save profile'));
    } finally {
      setSaving(false);
    }
  }

  function handleInputChange(field: keyof UserProfile, value: string) {
    if (!profile) return;
    setProfile({ ...profile, [field]: value || null });
  }

  if (loading) {
    return (
      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <Loading message={t('Loading profile...')} />
      </div>
    );
  }

  return (
    <>
      {!profile ? (
        <div
          role="alert"
          className="bg-secondary text-red-bright rounded-lg p-4 md:p-6"
        >
          {t('Failed to load profile.')}
          <button className="text-accent ml-3 underline" onClick={loadProfile}>
            {t('Retry')}
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSave}
          className="bg-secondary rounded-lg p-4 md:p-6"
        >
          {section ? (
            <CardHeader
              title={t('kit.personalDetails')}
              icon="bi-person"
              actions={
                <span className="text-fg4 flex items-center gap-1.5 text-xs">
                  <i className="bi bi-lock" aria-hidden="true" />
                  {t('kit.notUsedByAi')}
                </span>
              }
            />
          ) : (
            <>
              <h1 className="text-fg1 mb-4 text-2xl font-bold">
                {t('Profile')}
              </h1>
              <p className="text-muted mb-4 text-sm">
                {t(
                  'Your personal information for autofill and communications.'
                )}
              </p>
            </>
          )}

          <fieldset
            disabled={saving}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {/* First Name */}
            <div>
              <label
                htmlFor="first-name"
                className="text-muted mb-1.5 block text-sm"
              >
                {t('First Name')}
              </label>
              <input
                id="first-name"
                type="text"
                value={profile?.first_name || ''}
                onChange={(e) =>
                  handleInputChange('first_name', e.target.value)
                }
                placeholder={t('John')}
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            {/* Last Name */}
            <div>
              <label
                htmlFor="last-name"
                className="text-muted mb-1.5 block text-sm"
              >
                {t('Last Name')}
              </label>
              <input
                id="last-name"
                type="text"
                value={profile?.last_name || ''}
                onChange={(e) => handleInputChange('last_name', e.target.value)}
                placeholder={t('Doe')}
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="profile-email"
                className="text-muted mb-1.5 block text-sm"
              >
                {t('Email')}
              </label>
              <input
                id="profile-email"
                type="email"
                value={profile?.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder={t('john@example.com')}
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor="phone"
                className="text-muted mb-1.5 block text-sm"
              >
                {t('Phone')}
              </label>
              <input
                id="phone"
                type="tel"
                value={profile?.phone || ''}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            {/* City */}
            <div>
              <label htmlFor="city" className="text-muted mb-1.5 block text-sm">
                {t('City')}
              </label>
              <input
                id="city"
                type="text"
                value={profile?.city || ''}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder={t('San Francisco')}
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            {/* Country */}
            <div>
              <label
                htmlFor="country"
                className="text-muted mb-1.5 block text-sm"
              >
                {t('Country')}
              </label>
              <input
                id="country"
                type="text"
                value={profile?.country || ''}
                onChange={(e) => handleInputChange('country', e.target.value)}
                placeholder={t('United States')}
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            {/* LinkedIn URL */}
            <div className="sm:col-span-2">
              <label
                htmlFor="linkedin-url"
                className="text-muted mb-1.5 block text-sm"
              >
                {t('LinkedIn URL')}
              </label>
              <input
                id="linkedin-url"
                type="url"
                value={profile?.linkedin_url || ''}
                onChange={(e) =>
                  handleInputChange('linkedin_url', e.target.value)
                }
                placeholder="https://linkedin.com/in/johndoe"
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>
          </fieldset>

          {/* Save button */}
          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-accent text-bg0 hover:bg-accent-bright flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <i className="bi-arrow-repeat icon-sm animate-spin" />
                  {t('Saving...')}
                </>
              ) : (
                <>
                  <i className="bi-check-lg icon-sm" />
                  {t('Save')}
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
