# UI audit

Run the audit against a disposable account or a database copy. It creates a company, contact, lead, application, interview, note and reminder. It also changes the audit account's language. It does not send AI requests or save open form drafts.

Put credentials in a private JSON file outside the repository:

```json
{ "email": "audit@example.com", "password": "your password" }
```

The account must be approved. Use a temporary admin account to include Admin, or add `adminEmail` and `adminPassword` for a separate account **in a database copy**. Do not use real account credentials in a public report.

```sh
TARNISHED_URL=http://127.0.0.1:5620 \
TARNISHED_AUDIT_CREDENTIALS=/private/audit-credentials.json \
TARNISHED_AUDIT_OUTPUT=/tmp/tarnished-ui-audit \
PLAYWRIGHT_PATH=/path/to/node_modules/playwright \
CHROMIUM_PATH=/path/to/chromium \
node frontend/e2e/ui-audit.mjs
```

The report contains every visited state, the number of controls checked, violations, and hover screenshots. Exit code 0 means no violations. The default run uses English and Serbian at 1440px and 390px. `AUDIT_LANGUAGES`, `AUDIT_WIDTHS` and a JSON array in `AUDIT_PATHS` can limit a diagnostic run. A limited run is not a full pass.

For another run on the same disposable data, set `TARNISHED_AUDIT_FIXTURES` to the first run's `fixtures.json`. Delete the disposable account after use. Keep the credential file private and delete it separately.

The audit uses real pointer movement and computed browser styles. It checks only the active modal or menu when one is open; covered background controls are checked in their normal page state. Disabled controls still receive font, cursor and primitive checks, but do not receive an enabled-action hover check. CSS transition duration is set to zero so the check reads final hover colors. Forms are not submitted.
