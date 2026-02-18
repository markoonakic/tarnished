// Shared utilities and constants for the Tarnished extension

// API endpoint constants
export const API_ENDPOINTS = {
  JOB_LEADS: '/api/v1/job-leads',
  AUTH: '/api/v1/auth',
} as const;

// Message types for extension communication
export const MESSAGE_TYPES = {
  JOB_DETECTED: 'JOB_DETECTED',
  SAVE_JOB: 'SAVE_JOB',
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  // Detection messages
  GET_DETECTION: 'GET_DETECTION',
  DETECTION_RESULT: 'DETECTION_RESULT',
  GET_TAB_STATUS: 'GET_TAB_STATUS',
} as const;

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'tarnished_settings',
  AUTH_TOKEN: 'tarnished_auth_token',
  API_URL: 'tarnished_api_url',
} as const;

// Default settings
export const DEFAULT_SETTINGS = {
  apiUrl: '',
  autoDetect: true,
  notifications: true,
} as const;
