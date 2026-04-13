---
title: Use the browser extension
sidebar_position: 6
description: Install and configure the Tarnished browser extension.
---

Use this guide to install and configure the Tarnished browser extension.

## Install the extension

The current public install path is the packaged release ZIPs on GitHub Releases. Browser store publication is deferred for now.

1. Download the latest release assets from GitHub Releases.
2. Extract the ZIP for your browser.
3. Load it in the browser:
   - Chrome: load the unpacked extension directory
   - Firefox: load `manifest.json` from the extracted directory

## Configure the extension

1. Click the Tarnished extension icon.
2. Open the extension settings.
3. Enter:
   - the Tarnished app URL
   - an API key created in the Tarnished web app
4. Save the settings.

## What the extension can do

The extension currently focuses on:

- detecting job posting pages
- saving job leads
- checking for existing leads and applications
- converting or creating applications
- profile-driven autofill for job application forms

## Important limitations

Known limitations include:

- no access to browser-internal pages
- no autofill for iframe-protected forms
- no autofill for shadow-DOM or non-standard custom inputs
- HTML content truncation for very large pages

## Related pages

- [Configure API keys](./configure-api-keys.md)
- [Auth and API keys](../explanation/auth-and-api-keys.md)
