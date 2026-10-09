---
title: Use the browser extension
sidebar_position: 6
description: Install and configure the Tarnished browser extension.
---

Use this guide to install and configure the Tarnished browser extension.

## Install the extension

Use the Chrome or Firefox ZIP from
[the v0.3.8 release](https://github.com/markoonakic/tarnished/releases/tag/v0.3.8).
There is no browser-store install path.

1. Download and extract the ZIP for your browser.
2. Load it manually:
   - **Chrome:** open `chrome://extensions/`, enable **Developer mode**, select
     **Load unpacked**, then choose the extracted directory.
   - **Firefox:** open `about:debugging#/runtime/this-firefox`, select
     **Load Temporary Add-on**, then choose `manifest.json` in the extracted
     directory. A temporary add-on is removed when Firefox restarts.

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
- iframe autofill depends on frame access and script injection; not every embedded form can be filled
- no autofill for shadow-DOM or non-standard custom inputs
- page content truncation for very large pages

The extension scans only direct same-origin child frames, not nested frames.
Job detection and matching fields depend on site markup; support is not universal.

## Related pages

- [Configure API keys](./configure-api-keys.md)
- [Auth and API keys](../explanation/auth-and-api-keys.md)
