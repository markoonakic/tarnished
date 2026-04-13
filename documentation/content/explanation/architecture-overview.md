---
title: Architecture overview
sidebar_position: 1
description: High-level architecture of Tarnished and its primary clients.
---

Tarnished is a multi-surface self-hosted application made of one main backend and several clients.

## Primary components

### Backend

The backend is a FastAPI application.

It is responsible for:

- authentication
- database access
- file handling
- imports and exports
- analytics and dashboard data
- AI-backed extraction and insight generation
- serving the frontend static assets in production builds

### Frontend

The main web UI is a React-based frontend built separately and served as static assets by the backend in production.

### CLI

The Tarnished CLI is a separate Python package that talks to the backend over the HTTP API using API keys.

### Browser extension

The browser extension also talks to the backend over the API and focuses on:

- job detection
- job lead saving
- application creation/lookup
- profile-driven autofill

## Backend route layout

The FastAPI application wires together route groups for:

- auth
- applications
- application history
- profile
- rounds
- settings and API keys
- analytics and dashboard
- admin
- import and export
- job leads
- files
- user preferences and streaks
- AI settings and insights
- users

## Data and files

Tarnished keeps relational state in the configured database and file-backed state in the configured upload directory.

Depending on deployment mode, the database may be:

- SQLite
- PostgreSQL

## Production serving model

When the frontend static directory exists, the backend serves:

- `/assets` from the built frontend asset bundle
- the SPA shell for non-API routes

That means the packaged app can run as a single combined web service in common deployments.

## Related pages

- [Storage and backups](./storage-and-backups.md)
- [Auth and API keys](./auth-and-api-keys.md)
- [Transfer jobs](./transfer-jobs.md)
- [API overview](../reference/api-overview.md)
