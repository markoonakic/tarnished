import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { getProfile, updateProfile } from '@/lib/profile';
import type { UserProfile } from '@/lib/types';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsProfile() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = await getProfile();
      setProfile(data);
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

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
      toast.success('Profile saved successfully');
    } catch {
      toast.error('Failed to save profile');
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
      <>
        <div className="md:hidden">
          <SettingsBackLink />
        </div>
        <div className="bg-secondary rounded-lg p-4 md:p-6">
          <Loading message="Loading profile..." />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <form
        onSubmit={handleSave}
        className="bg-secondary rounded-lg p-4 md:p-6"
      >
        <h2 className="text-fg1 mb-4 text-xl font-bold">Profile</h2>
        <p className="text-muted mb-4 text-sm">
          Your personal information for autofill and communications.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* First Name */}
          <div>
            <label
              htmlFor="first-name"
              className="text-muted mb-1.5 block text-sm"
            >
              First Name
            </label>
            <input
              id="first-name"
              type="text"
              value={profile?.first_name || ''}
              onChange={(e) => handleInputChange('first_name', e.target.value)}
              placeholder="John"
              className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
            />
          </div>

          {/* Last Name */}
          <div>
            <label
              htmlFor="last-name"
              className="text-muted mb-1.5 block text-sm"
            >
              Last Name
            </label>
            <input
              id="last-name"
              type="text"
              value={profile?.last_name || ''}
              onChange={(e) => handleInputChange('last_name', e.target.value)}
              placeholder="Doe"
              className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
            />
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="profile-email"
              className="text-muted mb-1.5 block text-sm"
            >
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              value={profile?.email || ''}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="john@example.com"
              className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="text-muted mb-1.5 block text-sm">
              Phone
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
              City
            </label>
            <input
              id="city"
              type="text"
              value={profile?.city || ''}
              onChange={(e) => handleInputChange('city', e.target.value)}
              placeholder="San Francisco"
              className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
            />
          </div>

          {/* Country */}
          <div>
            <label
              htmlFor="country"
              className="text-muted mb-1.5 block text-sm"
            >
              Country
            </label>
            <input
              id="country"
              type="text"
              value={profile?.country || ''}
              onChange={(e) => handleInputChange('country', e.target.value)}
              placeholder="United States"
              className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
            />
          </div>

          {/* LinkedIn URL */}
          <div className="sm:col-span-2">
            <label
              htmlFor="linkedin-url"
              className="text-muted mb-1.5 block text-sm"
            >
              LinkedIn URL
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
        </div>

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
                Saving...
              </>
            ) : (
              <>
                <i className="bi-check-lg icon-sm" />
                Save
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}
