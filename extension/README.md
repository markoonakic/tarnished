# Tarnished Browser Extension

Detect job postings, save job leads, and fill application forms with your Tarnished profile.

This guide describes version **0.3.6**. Use the extension with a matching Tarnished backend.

**Documentation:** https://markoonakic.github.io/tarnished/

See the [extension guide](../documentation/content/how-to/use-the-browser-extension.md) for installation and configuration.

## Features

- Detect job pages from structured data, known job sites, headings, and apply buttons.
- Save a job URL and available page text without AI.
- Request AI extraction and conversion as a separate, explicit action.
- Open existing leads and applications instead of saving duplicates.
- Fill empty, visible application fields from your profile.

## Build and Install

Use Yarn 4.12.0 and Python 3. Yarn can be run through Corepack with `corepack yarn`.

```bash
cd extension
yarn install
yarn build:all
```

The build produces `tarnished-chrome.zip` and `tarnished-firefox.zip`.

For Chrome:

```bash
python3 -m zipfile -e tarnished-chrome.zip /tmp/tarnished-chrome
```

Open `chrome://extensions/`, enable **Developer mode**, select **Load unpacked**, and choose the extracted directory.

For Firefox:

```bash
python3 -m zipfile -e tarnished-firefox.zip /tmp/tarnished-firefox
```

Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `manifest.json` from the extracted directory. Temporary add-ons are removed when Firefox closes.

Each package has a browser-specific Manifest V3 background declaration:

- Chrome uses a module service worker.
- Firefox uses a module event page and Gecko settings.

`src/manifest.json` and `dist/manifest.json` contain both declarations. Use the browser-specific packages for installation.

## Configure

1. Open the extension popup and select **Settings**.
2. Enter the URL of your Tarnished instance. Use an HTTP or HTTPS URL without credentials, a query string, or a fragment.
3. In Tarnished, open **Settings → API Keys** and create a key with the **Extension** preset.
4. Copy the key into the extension and select **Save**.

If the app URL redirects, use its final URL. API requests do not follow redirects because they carry your API key.

For autofill, complete your first name, last name, email, phone, city, country, and LinkedIn URL in your Tarnished profile.

## Use

### Save a Job

1. Open a job posting and select the Tarnished extension.
2. Select **Save without AI** to save its URL and available page text. This does not start extraction or contact a model provider. A URL-only save is allowed when page text is unavailable.
3. Select **View in App** to review or edit the lead. Complete the company and title to convert it without AI, or request extraction in the app.

**Save + AI + Convert** saves the lead, requests AI extraction, and converts it when its fields are ready. Extraction can incur provider charges. If extraction or conversion fails, the lead stays saved and can be opened in the app. No automatic AI retry is made.

If a save times out, check Job Leads before saving again. The server may have completed the request.

An exact-URL duplicate opens the existing lead. It does not replace source text or start extraction. **Convert to Application** refreshes the saved fields first and uses the server's initial status and the browser's time zone.

### Autofill

Open an application form and select **Autofill** in the popup. The settings dropdown also lets you enable autofill on page load.

Supported fields include first name, last name, full name, email, phone, city, country, and LinkedIn URL. Matching uses autocomplete attributes, labels, placeholders, names, and IDs. Existing values, hidden fields, and disabled or readonly fields are left unchanged. Values respect each field's maximum length.

Review the form before submitting it. Custom form controls and some React/Vue validation flows can need manual input.

## Job Detection

The extension combines these signals:

| Signal                         |            Points |
| ------------------------------ | ----------------: |
| JSON-LD JobPosting data        |                50 |
| Known job site or job URL path |                30 |
| Job-related headings           | 10 each, up to 20 |
| Apply button                   |                10 |

A score of 30 or more marks the page as a job page. Known sites include LinkedIn Jobs, Indeed, Greenhouse, Lever, Workday, and Glassdoor. JobPosting data can be detected on any site.

## Limitations

- Detection can miss dynamic or non-standard pages and can match some job search or company career pages.
- Browser internal pages such as `chrome://` and `about:` cannot be scanned.
- Autofill supports direct same-origin child frames, not cross-origin or nested frames. A per-page token identifies injected scanners. It is not secret from the host page or its same-origin scripts.
- Shadow DOM fields and custom controls are not supported.
- The popup reports main-frame fills and frame contact attempts separately; it cannot confirm asynchronous frame fills.
- Page text is limited to 100,000 JavaScript characters for transport. The server retains at most 50,000 useful characters and reports truncation or content warnings.
- Firefox packages have packaging tests but are not covered by automated browser tests.

## Troubleshooting

| Problem                | Action                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| Missing settings       | Set the app URL and API key in extension settings.                       |
| Invalid app URL        | Use the final HTTP or HTTPS URL without credentials, query, or fragment. |
| Invalid or revoked key | Create a new Extension preset key in Tarnished settings.                 |
| Missing API scope      | Use the Extension preset or add the scope named in the error.            |
| Connection failure     | Check the network, server, TLS configuration, and app URL.               |
| Save timeout           | Check Job Leads before saving again.                                     |
| Extraction failure     | Open the saved lead and review its state before retrying AI work.        |
| Job not detected       | Refresh the page or open the posting's direct URL.                       |
| Autofill does not work | Check your profile and the field/frame limitations above.                |

Warnings and errors appear in the extension console. Debug logging can be enabled there with:

```javascript
(globalThis.browser ?? globalThis.chrome).storage.local.set({
  tarnished_debug: true,
});
```

Reload the extension after changing the debug setting.

## Development

```bash
yarn build             # Build dist/
yarn dev               # Rebuild dist/ when files change
yarn build:chrome      # Build and package Chrome
yarn build:firefox     # Build and package Firefox
yarn typecheck
yarn test:run
yarn test:packaging
yarn format:check
```

Watch mode rebuilds the bundle. Reload the extension or reinstall its temporary add-on after a change. Repackage it if you use a browser-specific extracted build.

The source is split into `background/`, `content/`, `popup/`, `options/`, and shared `lib/` modules. API calls use a shared transport and the `X-API-Key` header. Top-level pages and iframe scanners use the same autofill code. Vite makes content scripts self-contained; the packaging script writes each browser's manifest without changing the build.

## License

MIT. Each packaged ZIP includes the LICENSE file.
