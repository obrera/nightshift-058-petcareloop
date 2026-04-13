# PetCareLoop

PetCareLoop is a collaborative household pet-care workspace for Nightshift Build 058. It provides real session-backed auth, invite-code onboarding, pet profiles, assigned care routines, a commentable care log timeline, medication inventory with low-stock alerts, and vet appointment planning with place lookup, all backed by SQLite.

Live URL: `https://petcareloop058.colmena.dev`

## Stack

- TypeScript across client, server, and shared contracts
- Hono API with SQLite via `better-sqlite3`
- React + Vite + Tailwind dark-mode-first frontend
- Single-process deploy shape where the server also serves the built frontend

## Core Capabilities

- Register, sign in, and persist sessions with real email/password auth
- Create a household or join one with a shared invite code
- Manage pet profiles with notes, identity, and routine coverage
- Assign feeding, walk, and medication routines to household members
- Log care completions with evidence text and add follow-up comments on the timeline
- Track medication inventory and surface low-stock alerts
- Plan vet appointments with Nominatim-backed place lookup and prep notes

## Local Run

```bash
npm install
npm run dev
```

Production build and run:

```bash
npm run build
npm start
```

The server listens on `http://localhost:3000` by default and stores SQLite data at `data/petcareloop.sqlite`.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm start`

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/app`
- `POST /api/household/create`
- `POST /api/household/join`
- `POST /api/pets`
- `PUT /api/pets/:id`
- `DELETE /api/pets/:id`
- `POST /api/routines`
- `PUT /api/routines/:id`
- `DELETE /api/routines/:id`
- `POST /api/routines/:id/complete`
- `POST /api/care-logs/:id/comments`
- `POST /api/medications`
- `PUT /api/medications/:id`
- `DELETE /api/medications/:id`
- `POST /api/appointments`
- `PUT /api/appointments/:id`
- `DELETE /api/appointments/:id`
- `GET /api/places/search`

## Challenge Reference

- Nightshift Build 058

## Model Metadata

- Agent: Codex
- Model: GPT-5 Codex
- Updated: 2026-04-13T00:00:00Z
