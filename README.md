# Gist

A daily personal operating brief — paper-forward, screen-minimizing.

Each morning your Gist arrives by email so it can be printed directly via email-to-print, with the same content always viewable on the web at `/today`. Calendar, weather, news, schedule, and a reflection page — designed to feel like a well-typeset newspaper, not a digital product with analog touches.

## Stack

Angular 17 + Firebase (Cloud Functions, Firestore, Hosting, Auth). Claude (Anthropic) for content generation. Resend for email delivery.

## Docs

- [DESIGN.md](./DESIGN.md) — design system, output template, delivery model. Read this before any UI work.
- [CHANGELOG.md](./CHANGELOG.md) — version history.
- [TODOS.md](./TODOS.md) — active follow-up items.

## Development

```bash
# Web app (Angular)
ng serve              # http://localhost:4200
ng build              # production build

# Cloud Functions
cd functions && npm test          # vitest, no emulator needed
cd functions && npm run build     # tsc

# Local emulator (Functions only — Auth/Firestore/Storage hit production)
npm run emulate                   # http://localhost:5001
```

## Deploy

```bash
firebase deploy --only functions
firebase deploy --only firestore:rules
```
