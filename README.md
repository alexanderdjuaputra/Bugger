# BugBuster Pro — Service Management Module (Vercel + Firebase edition)

Two integrated websites for a pest-control company, sharing **one Firestore
database**:

- **Customer site** (`/`) — book a service, track the technician, pay, leave a 1–5 review.
- **Management console** (`/management/`) — receive bookings, assign technicians, submit & approve service reports, generate invoices, issue refunds, view a KPI dashboard.

This is the **Vercel + Firebase** edition: the entire app (both sites + the
API) is hosted on Vercel, and Firebase Firestore is used as the persistent
database, since Vercel's serverless functions don't keep files on disk
between requests the way a traditional server would.

**👉 If you're deploying this for the first time, read `PANDUAN_DEPLOY.md`
first** (in Bahasa Indonesia) — it has the exact, numbered steps for setting
up Firebase, getting credentials, pushing to GitHub, and deploying on Vercel.
This README covers the technical reference; the deploy guide covers the
click-by-click setup.

---

## Architecture

```
Browser ──> Vercel (static files: public/)         <- the two websites
        ──> Vercel (serverless function: api/index.js) <- the API
                       │
                       ▼
              Firebase Firestore           <- the one shared database
```

There is only **one live URL** (whatever Vercel gives your deployment).
Firebase is not a second website — it is the database both sites read from
and write to, accessed only by your server (via the Admin SDK), never
directly from the browser.

## Run it locally first

```bash
npm install
```

You need Firebase credentials even for local testing (see
`PANDUAN_DEPLOY.md` Langkah 1–3 for how to get them). The simplest local
setup: download your service account key from Firebase Console and save it
as `serviceAccountKey.json` in this project's root folder (already
gitignored — it will never be committed).

```bash
npm run seed     # confirms Firestore connectivity + seeds reference data
npm start        # http://localhost:3000/  and  http://localhost:3000/management/
```

## Automated tests

```bash
npm test
```

Runs 28 checks covering the full integration flow and every control layer,
against an in-memory Firestore-compatible stand-in
(`tests/firestoreMemoryShim.js`) rather than your real Firebase project —
this means `npm test` works with **no credentials at all**, anywhere,
instantly. It is not a substitute for the manual smoke test in
`PANDUAN_DEPLOY.md` Langkah 8 against your real deployed app.

## Deploying

See `PANDUAN_DEPLOY.md` for the full walkthrough. In short: push this to
GitHub, import into Vercel as an "Other" framework project, set three
environment variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`) from your Firebase service account key, and deploy.

---

## Credentials & keys (unchanged from the original spec)

| Purpose | Value |
|---|---|
| Management login | username `admin`, password `test` |
| Finance refund key | `refund` |
| Demo customer | `demo@bugbuster.test` / `demo123` |

## Service catalogue (seeded)

| Service | Price |
|---|---|
| Termites | Rp 500.000 |
| Cockroach | Rp 200.000 |
| Rats | Rp 400.000 |

---

## Controls implemented (labelled inline in `server-app.js`)

**Input controls** — required fields; booking date cannot be in the past;
phone must be numeric; technician cannot be double-booked (enforced via a
Firestore transaction on a deterministic `technician_date_slot` document ID).

**Processing controls** — completing a booking auto-generates the invoice
(inside the same transaction as the status change, so the two can never
disagree); a service report cannot be submitted without findings + at least
one chemical; a booking cannot be completed without an approved report;
status only moves forward one step at a time; duplicate feedback for the
same booking is rejected.

**Access controls** — management API requires an admin session token,
which is stored in a Firestore `sessions` collection (not local server
memory) so it remains valid across different serverless instances; refunds
additionally require the finance key `refund`.

**Output controls** — invoice amount always comes from the ServiceType
record, never from user input; a report is locked (`approved: true`) and
cannot be edited once approved.

---

## Why Firestore instead of SQLite (the previous local-hosting version)

The original prototype used SQLite, which works great for `npm start` on
your own machine but cannot work on Vercel: serverless functions get a
fresh, empty filesystem on every cold start, so a SQLite file would reset
constantly. Firestore is a separate, always-on cloud database that any
number of serverless function instances can connect to and see the same
data — which is exactly what "the two sites stay integrated" requires once
you're not running a single long-lived Node process anymore.

## Known limitation, stated plainly

`npm audit` reports 6 moderate-severity advisories, all originating deep
inside `firebase-admin`'s own dependency tree (`google-gax` → `gaxios` →
`uuid`), not in this project's code. They are not fixable from outside
without breaking the official Firebase SDK, and at the time of writing
there is no newer `firebase-admin` release that resolves them. This is
disclosed here rather than hidden — re-run `npm audit` after `npm install`
on your own machine to see the current state, since this may change as
Google ships updates.

## Project layout

```
bugbuster-pro/
├── api/
│   └── index.js          # Vercel serverless entry point (no app.listen)
├── lib/
│   ├── db.js              # Firestore credential resolution + connection
│   └── seed.js              # idempotent reference-data seeding
├── server-app.js              # ALL routes + business logic (Firestore-backed)
├── server.js                    # local dev launcher (adds app.listen)
├── scripts/seed.js                # CLI: `npm run seed`
├── public/
│   ├── index.html, styles.css, app.js   # customer website
│   └── management/                       # operations + admin console
├── tests/
│   ├── firestoreMemoryShim.js              # TEST-ONLY in-memory Firestore stand-in
│   └── test.js                               # 28-check integration + controls suite
├── vercel.json
├── firestore.rules
├── .env.example
├── PANDUAN_DEPLOY.md                          # Indonesian step-by-step deploy guide
└── docs/
    ├── ERD.md                                  # data model (now Firestore collections)
    └── QUALITY_MANAGEMENT.md                     # TQM, Six Sigma, testing, acceptance
```
