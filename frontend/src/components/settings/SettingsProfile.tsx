import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { getProfile, updateProfile } from '@/lib/profile';
import type { UserProfile } from '@/lib/types';
import Loading from '../Loading';
import Dropdown, { type DropdownOption } from '../Dropdown';
import { SettingsBackLink } from './SettingsLayout';

// Common countries for the dropdown
const COUNTRY_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Select country...' },
  { value: 'United States', label: 'United States' },
  { value: 'Canada', label: 'Canada' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'Germany', label: 'Germany' },
  { value: 'France', label: 'France' },
  { value: 'Australia', label: 'Australia' },
  { value: 'India', label: 'India' },
  { value: 'Netherlands', label: 'Netherlands' },
  { value: 'Spain', label: 'Spain' },
  { value: 'Italy', label: 'Italy' },
  { value: 'Switzerland', label: 'Switzerland' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'Japan', label: 'Japan' },
  { value: 'Ireland', label: 'Ireland' },
  { value: 'Sweden', label: 'Sweden' },
  { value: 'Brazil', label: 'Brazil' },
  { value: 'Mexico', label: 'Mexico' },
  { value: 'Other', label: 'Other' },
];

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
        location: profile.location,
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
        <div className="bg-bg1 rounded-lg p-4 md:p-6">
          <Loading message="Loading profile..." />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Mobile back link */}
      <div className="md:hidden">
        <Link
          to="/settings"
          className="text-accent hover:text-accent-bright text-sm flex items-center gap-2 transition-all duration-200 ease-in-out cursor-pointer mb-6"
        >
          <i className="bi-chevron-left icon-sm" />
          Back to Settings
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-fg1 mb-2">Profile</h2>
        <p className="text-sm text-muted">
          Your personal information for autofill and communications
        </p>
      </div>

      {/* Form container */}
      <form onSubmit={handleSave} className="bg-bg1 rounded-lg p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* First Name */}
          <div>
            <label className="text-sm text-muted block mb-1.5">First Name</label>
            <input
              type="text"
              value={profile?.first_name || ''}
              onChange={(e) => handleInputChange('first_name', e.target.value)}
              placeholder="John"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-aqua-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Last Name</label>
            <input
              type="text"
              value={profile?.last_name || ''}
              onChange={(e) => handleInputChange('last_name', e.target.value)}
              placeholder="Doe"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-aqua-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Email</label>
            <input
              type="email"
              value={profile?.email || ''}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="john@example.com"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-aqua-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Phone</label>
            <input
              type="tel"
              value={profile?.phone || ''}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-aqua-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Location</label>
            <input
              type="text"
              value={profile?.location || ''}
              onChange={(e) => handleInputChange('location', e.target.value)}
              placeholder="San Francisco, CA"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-aqua-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* LinkedIn URL */}
          <div>
            <label className="text-sm text-muted block mb-1.5">LinkedIn URL</label>
            <input
              type="url"
              value={profile?.linkedin_url || ''}
              onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/johndoe"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-aqua-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* City */}
          <div>
            <label className="text-sm text-muted block mb-1.5">City</label>
            <input
              type="text"
              value={profile?.city || ''}
              onChange={(e) => handleInputChange('city', e.target.value)}
              placeholder="San Francisco"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-aqua-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Country */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Country</label>
            <Dropdown
              options={COUNTRY_OPTIONS}
              value={profile?.country || ''}
              onChange={(value) => handleInputChange('country', value)}
              placeholder="Select country..."
              size="sm"
              containerBackground="bg1"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-aqua text-bg0 hover:bg-aqua-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
