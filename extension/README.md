# Job Tracker Browser Extension

A browser extension for detecting job postings and saving them to your Job Tracker application.

## Features

- **Job Detection**: Automatically detects job posting pages across major job boards
- **One-Click Save**: Save job listings directly to your Job Tracker application
- **Autofill**: Automatically fill job application forms with your profile data
- **Duplicate Detection**: Prevents saving the same job twice
- **User-Friendly Errors**: Clear error messages with recovery suggestions

## Supported Job Sites

The extension uses a weighted scoring system to detect job postings on the following platforms:

| Platform | Detection Method |
|----------|------------------|
| LinkedIn Jobs | Domain matching |
| Indeed | Domain matching |
| Greenhouse | Domain matching |
| Lever | Domain matching |
| Workday | Domain matching |
| Glassdoor | Domain matching |
| Any site with JSON-LD | Schema detection |

### Detection Signals

The extension uses multiple signals to identify job postings:

1. **JSON-LD JobPosting Schema** (weight: 50) - Standard structured data for job postings
2. **Known Job Domains** (weight: 30) - Recognized job board URLs
3. **Job-Related Headings** (weight: 10 each, max 20) - Sections like "Requirements", "Responsibilities", "Qualifications"
4. **Apply Button** (weight: 10) - Presence of an apply button

A score of 30 or higher triggers job detection.

## Autofill Supported Fields

The autofill feature can automatically populate the following form fields:

| Field | Matching Patterns |
|-------|-------------------|
| First Name | `first`, `fname` |
| Last Name | `last`, `surname`, `lname` |
| Email | `type="email"`, `email` |
| Phone | `type="tel"`, `phone`, `mobile`, `cell` |
| Location | `location`, `city`, `address` |
| LinkedIn URL | `linkedin`, `linkedin_url` |

**Note**: Autofill only fills empty, visible text fields. Already-filled fields are skipped.

## Installation

### Development Build

1. Clone the repository and navigate to the extension directory:
   ```bash
   cd extension
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Build the extension:
   ```bash
   yarn build
   ```

4. Load the extension in your browser:
   - **Chrome**: Go to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", and select the `extension/dist` directory
   - **Firefox**: Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select any file in the `extension/dist` directory

### Development Mode

For development with hot-reloading:
```bash
yarn dev
```

## Configuration

### Setting Up the Extension

1. Click the extension icon in your browser toolbar
2. Click the **Settings** button (gear icon)
3. Enter your configuration:
   - **Server URL**: The URL of your Job Tracker backend (e.g., `http://localhost:8000` or `https://your-server.com`)
   - **API Key**: Your API key from the Job Tracker application

### Getting Your API Key

1. Log in to your Job Tracker web application
2. Navigate to **Settings** (usually in the user menu or profile section)
3. Find the **API Keys** section
4. Generate or copy your API key

### Setting Up Your Profile for Autofill

For autofill to work, you need to have your profile data saved in the Job Tracker application:

1. Log in to your Job Tracker web application
2. Navigate to your **Profile** settings
3. Fill in your personal information:
   - First name
   - Last name
   - Email address
   - Phone number
   - Location
   - LinkedIn URL

## Usage

### Saving a Job Posting

1. Navigate to a job posting on a supported job site
2. Click the Job Tracker extension icon
3. If a job is detected, you'll see the job details with a **Save** button
4. Click **Save** to add the job to your leads

### Using Autofill

1. Navigate to a job application form
2. Click the Job Tracker extension icon
3. Click the **Autofill** button
4. Your profile data will be automatically filled into matching form fields

### Updating an Existing Lead

If you visit a job posting URL that's already saved:

1. The extension will show "Already Saved" status
2. If the page content may have changed, you'll see an **Update** button
3. Click **Update** to refresh the job data

## Known Limitations

### Detection Limitations

- **Dynamic Content**: Pages that load job content via JavaScript may not be detected immediately. Refreshing the page usually helps.
- **Non-Standard Pages**: Custom job posting pages without structured data may not be detected.
- **Threshold**: Some legitimate job pages may score below 30 and not be detected.

### Autofill Limitations

- **Iframes**: Forms embedded in iframes cannot be autofilled (browser security restriction).
- **Shadow DOM**: Forms using Shadow DOM encapsulation cannot be autofilled.
- **Custom Inputs**: Non-standard input types (e.g., rich text editors, custom dropdowns) cannot be autofilled.
- **Already Filled**: Fields with existing content are skipped to prevent overwriting.
- **Hidden Fields**: Hidden or invisible fields are skipped.
- **Disabled Fields**: Disabled or readonly fields cannot be filled.
- **Character Limits**: Values are truncated to fit maxlength constraints.
- **Single-Page Apps**: Some React/Vue apps may need manual validation triggering.

### General Limitations

- **Restricted URLs**: The extension cannot run on browser internal pages (`chrome://`, `about:`, etc.)
- **Authentication**: Requires valid API key from the Job Tracker backend
- **Network**: Requires network connectivity to the backend server
- **Content Size**: HTML content larger than 100KB is truncated

## Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| Configure the extension in settings first | Missing server URL or API key | Open settings and configure both fields |
| Invalid server URL | URL format is incorrect | Ensure URL starts with `http://` or `https://` |
| Invalid API key | API key is invalid or expired | Generate a new API key in Job Tracker settings |
| Could not connect to server | Network or server issue | Check network connection and server status |
| Request timed out | Server took too long to respond | Try again or check server load |
| No job posting found on this page | Detection score below threshold | Page may not be a job posting |
| Could not extract job data | Extraction failed | Try refreshing the page |
| This job is already in your leads | Duplicate URL detected | No action needed |

## Architecture

```
extension/
  src/
    background/     # Service worker for background tasks
    content/        # Content script for page detection and autofill
    popup/          # Extension popup UI
    options/        # Extension settings page
    lib/
      api.ts        # Backend API client
      autofill.ts   # Form autofill logic
      constants.ts  # Shared constants
      detection.ts  # Job detection algorithm
      errors.ts     # Error handling utilities
      storage.ts    # Chrome storage helpers
```

## Development

### Building

```bash
yarn build        # Production build
yarn dev          # Development build with watch mode
```

### Project Structure

- **Manifest V3**: Uses the latest Chrome extension manifest format
- **TypeScript**: Full type safety throughout
- **Vite**: Fast bundling and development experience
- **webextension-polyfill**: Cross-browser compatibility

### API Integration

The extension communicates with the Job Tracker backend via:

- `POST /api/job-leads` - Save a new job lead
- `GET /api/job-leads` - List/search existing leads
- `GET /api/profile` - Fetch user profile for autofill

All requests use API key authentication via the `X-API-Key` header.

## Troubleshooting

### Extension Not Detecting Jobs

1. Refresh the page
2. Check if the site is in the supported list
3. Open browser console and look for detection messages
4. Ensure content script is loaded (check `chrome://extensions/` for errors)

### Autofill Not Working

1. Ensure your profile is filled in the Job Tracker app
2. Check if the form fields match the supported patterns
3. Verify the form is not in an iframe or shadow DOM
4. Try refreshing the page before using autofill

### Connection Errors

1. Verify the server URL is correct and accessible
2. Check if the API key is valid
3. Ensure the backend server is running
4. Check for CORS issues in the browser console

## License

MIT License - See the main project repository for details.
