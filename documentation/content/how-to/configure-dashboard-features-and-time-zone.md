---
title: Configure dashboard features and time zone
sidebar_position: 3
description: Control which dashboard sections stay visible and choose how Tarnished determines your local day.
---

Use this guide when you want to tailor the dashboard and analytics surfaces without changing your underlying application data.

## Dashboard feature visibility

Open **Settings** → **Features** to control which optional sections stay visible.

The current toggles are:

- **Show Flame of Ambition** — shows or hides the streak widget on the dashboard
- **Show Needs Attention** — shows or hides the follow-up sections on the dashboard
- **Show Activity Heatmap** — shows or hides the heatmap on the dashboard and analytics page

These toggles only affect visibility.

They do **not** delete data, reset streaks, or change how analytics are calculated.

## How dashboard cards are counted

Some dashboard cards are based on the application date you saved on each application record.

For example:

- **Last 7 Days** counts applications whose `applied_at` date falls inside the current seven-day window
- **Last 30 Days** does the same for the current thirty-day window
- **Active Opportunities** counts applications whose current status is not `Rejected` or `Withdrawn`

This means that changing an application's applied date or status can change the dashboard immediately.

## Time zone source

Open **Settings** → **Features** → **Time Zone** to decide how Tarnished determines your local day.

You can choose one of two modes:

- **Use device time zone**
- **Set manually**

### Use device time zone

This is the default mode.

Tarnished reads the browser-reported IANA time zone, such as:

- `Europe/Belgrade`
- `America/New_York`
- `Asia/Tokyo`

This does **not** request GPS or location permissions.

It only uses the browser's time zone information for day-boundary calculations.

### Set manually

Choose this when you want Tarnished to use a specific time zone regardless of the current browser or device setting.

This is useful when:

- you travel between time zones
- you use remote desktops or VPN-heavy workflows
- you want streaks and dashboard day windows to stay anchored to a home time zone

## Why time zone matters

Tarnished uses your effective local day for features that depend on day boundaries, including:

- streak progression
- Flame of Ambition state
- day-based dashboard cards
- follow-up and no-response buckets
- analytics views that use rolling windows or calendar-day grouping

Because of that, a dashboard refresh after midnight in your selected time zone can legitimately move items between sections.

For example, an application that was six days old yesterday can become a seven-day-old follow-up today.

## Device mode vs manual mode

| Mode | What Tarnished uses | Best for |
| --- | --- | --- |
| Device | Browser-reported time zone | Most users on a single machine |
| Manual | Saved IANA time zone override | Travel, remote work, or fixed home-zone workflows |

## CLI note

The Tarnished CLI can read and update the same preference data through the `preferences` command group.

When the preference mode is set to **device**, the CLI uses the local machine time zone as request-time context for the day-sensitive commands that need it. It does not silently persist that machine time zone back into your stored preferences.

See [Use the CLI](./use-the-cli.md) for examples.

## Related pages

- [Create your first application](../get-started/create-your-first-application.md)
- [Use the CLI](./use-the-cli.md)
- [Architecture overview](../explanation/architecture-overview.md)
- [API overview](../reference/api-overview.md)
