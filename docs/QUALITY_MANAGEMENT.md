# BugBuster Pro — Quality Management for the Service Management Module

This document explains how quality is designed into, built into, and verified
for the Service Management Module, and maps each idea to where it actually
appears in the codebase.

---

## 1. Quality approach — TQM and a Six Sigma mindset

**Total Quality Management (TQM)** treats quality as everyone's job and a
continuous activity, not a final inspection step. Five TQM principles drive
this module:

1. **Customer focus.** The customer is the judge of quality. The customer site
   exposes exactly the outputs that matter to them — booking confirmation, live
   status tracker, the service report, the invoice, and a 1–5 review — and the
   feedback ratings feed straight back into the management dashboard's
   *technician performance* metric, closing the loop.
2. **Process, not blame.** Quality problems are designed out of the process. The
   booking state machine (`pending → confirmed → in progress → completed`) is
   enforced in code (`isValidTransition` in `server.js`), so a clerk can never
   put a record into an impossible state in the first place.
3. **Build quality in (prevention over detection).** Validation lives at the
   point of entry: past dates, non-numeric phones, missing fields, and
   double-bookings are rejected before any row is written.
4. **Continuous improvement (Kaizen).** The dashboard surfaces completion rate,
   revenue, and per-technician ratings so management can spot and remove
   recurring defects (e.g. a technician with low ratings or a service type with
   many cancellations).
5. **Total involvement.** Customers, dispatchers/operations, technicians,
   finance, and admins each have a defined, access-controlled role in the data
   they create and approve.

**Six Sigma mindset — designing quality in from the start.** Rather than
testing defects out at the end, defect-causing paths are made unreachable by
design. Examples already in the build:

- *One report per booking* and *one invoice per booking* are enforced by
  `UNIQUE` constraints, not by hoping the UI behaves.
- *Invoice always equals the booked service price* — the amount is read from the
  `ServiceType` row, never typed by a user, removing a whole class of pricing
  defects.
- *Reports lock on approval* (`approved = 1`), so an approved record can never
  drift from what was signed off.

This is the Six Sigma "define quality requirements, then engineer the process so
the defect cannot occur" stance — variation is removed at the source.

**Who is responsible for total quality.** Everyone, but with a clear owner.
Under TQM the **project manager / module lead** owns overall quality and is
accountable for the quality plan, while **each role owns the quality of its own
output**: developers own code correctness and tests, the operations lead owns
correct dispatch and reporting, finance owns billing/refund integrity, and the
client (BugBuster Pro management) owns acceptance. Quality is a shared
responsibility with a single accountable lead — not a separate QA department
bolted on at the end.

---

## 2. Structured walkthroughs

A **structured walkthrough** is a planned peer review where the author walks
the team through a design or a piece of code while reviewers look for defects,
unclear logic, and deviations from standards. It is a *detection* technique
that complements the *prevention* built into the design.

**How it is used for this module:**

- **Design walkthrough** before coding — the ERD and the control matrix (input,
  processing, access, output) are reviewed against the business flow in the
  brief to confirm every required control has a home.
- **Code walkthroughs** for the riskiest functions — `assignTechnician`
  (double-booking), the status state machine, and invoice generation — because
  a defect there has financial or scheduling impact.
- Reviewers work from a **checklist**: Are all inputs validated? Can the state
  machine be bypassed? Are access checks present on every management endpoint?
  Does the output match the source of truth (service price)?

**Who participates:**

- **Author / presenter** — the developer who wrote the design or code.
- **Moderator / chair** — keeps the session on defects, not solutions or style
  debates.
- **Reviewers** — one or two other developers plus a domain person from
  operations (who knows real dispatch rules).
- **Scribe** — records each defect and who will fix it.

The output is a defect list, not a redesign in the room; fixes are verified in a
quick follow-up rather than re-running the whole walkthrough.

---

## 3. Top-down and modular design

**Top-down design** decomposes the module from the whole down to the parts:

```
Service Management Module
├── Customer subsystem
│   ├── Register / Login
│   ├── Book service          (validation, price lookup)
│   ├── Track booking         (status tracker)
│   ├── Pay invoice
│   └── Leave feedback (1–5 + comment)
├── Operations subsystem
│   ├── Receive booking       (shared queue)
│   ├── Assign technician     (double-booking guard)
│   ├── Submit service report (findings + chemicals)
│   └── Update status         (state machine)
└── Admin / back-office subsystem
    ├── Generate invoice      (price = service price)
    ├── Review / approve report (lock)
    ├── Refund                (finance key)
    └── Dashboard             (KPIs, technician performance)
```

This mirrors a **structure chart**: each box is a single-purpose function that
takes defined inputs and returns defined outputs, and higher boxes call lower
ones.

**Modular design** keeps the system maintainable: the code is split into clear
layers — `database.js` (data + schema), `server.js` (business rules + the four
control layers), and the two `public/` front-ends (presentation). A change to a
business rule touches one place; a change to the look of the customer site
touches another and cannot break billing.

**Service-oriented architecture (SOA).** The two front-ends are deliberately
*not* coupled to each other — they are thin clients that both call the same set
of stateless REST services (`/api/...`). The "book service", "assign
technician", and "generate invoice" services are reusable endpoints. This is
the SOA idea in miniature: well-defined services with contracts, consumed by
multiple clients (and, later, the planned mobile app — it would call the exact
same API).

---

## 4. The testing process

Testing follows the textbook three-level process, plus stubs and test data.

### Program (unit) testing with test data
Each function is tested in isolation against prepared **test data**, including
deliberately *invalid* data to confirm controls reject it. Example targets:
date validation, phone validation, the status-transition function, and invoice
amount calculation.

### Link / integration testing
Functions are tested together along a path — e.g. *create booking → appears in
ops queue → assign → report → approve → complete → invoice → pay → feedback* —
to prove the modules hand data to each other correctly. This is the test that
proves the two websites are genuinely **integrated** through one database.

### Full system testing
The whole module is exercised end to end through the real HTTP API (both
front-ends against the live server and database), checking functional behaviour
and the controls together. The automated suite in `tests/test.js` does exactly
this and currently runs **25 assertions, all passing**.

### Stubs and test data
Where a real dependency is not needed for a given test, a **stub** stands in —
for example the test suite stubs the customer's payment method as `"app"` rather
than wiring a real payment gateway, and uses a freshly reset, seeded database
(`node database.js --reset`) as controlled **test data** so results are
repeatable.

### Example test cases for a critical function — *technician assignment*

| # | Test case | Input | Expected result |
|---|-----------|-------|-----------------|
| TC‑1 | Valid assignment | Confirmed booking, free technician, free slot | Technician set, status → `in progress`, schedule row created |
| TC‑2 | Double-booking blocked | Same technician already booked for that date + time slot | Rejected with HTTP 409 "already booked"; no schedule row added |
| TC‑3 | Unknown technician | `technician_id` that does not exist | Rejected with HTTP 400 "Unknown technician" |

(And for *booking creation*: a past date → rejected; a missing service type →
rejected; a valid future booking → created with status `confirmed` and visible
to operations. All three are covered in `tests/test.js`.)

---

## 5. Maintenance, auditing, and documentation

**Maintenance.** Planned maintenance is mostly *perfective* and *adaptive*:
adding service types or technicians is data-only (rows in `ServiceType` /
`Technician`), requiring no code change; rule changes (e.g. a new status) are
isolated to `server.js`. *Corrective* maintenance is supported by the automated
test suite — re-running `npm test` after any change is a regression check that
the controls still hold.

**Auditing.** Every important row is timestamped (`created_at` on Customer,
Booking, ServiceReport, Payment, Feedback) and key records are immutable once
finalised (approved reports are locked; one payment per booking). This gives an
audit trail: who was billed what, what chemicals were applied, and when each
step happened — important for a pest-control company's compliance records.
Refunds are gated behind a finance security key so money movements are
attributable to authorised staff.

**Documentation.** The project ships with layered documentation:

- `README.md` — install, run, host, and credentials (a **procedure manual** for
  operators and graders).
- `docs/ERD.md` — the data model.
- This quality report — the quality plan and controls.
- Inline code comments label each control as `[INPUT] [PROCESSING] [ACCESS]
  [OUTPUT]` so a maintainer can find them instantly.

**FOLKLORE method.** Beyond formal manuals, real systems also carry undocumented
knowledge ("folklore") held by the people who run them. The FOLKLORE approach
captures that knowledge from its sources — interviewing **people** (the
dispatcher who knows which technician really covers which zone), reading
**tasks** (how a booking is actually handled day to day), inspecting
**documents** (existing service reports, invoices), and reviewing the running
**software** itself — and writes it down so it survives staff turnover. For this
module, folklore worth capturing includes dispatch heuristics (skill + zone
matching), typical chemical quantities per pest type, and how follow-up
recurring bookings are scheduled.

---

## 6. Acceptance criteria (measurable quality bar)

The module is accepted when **all** of the following hold:

1. **Input validity** — validation rejects 100% of malformed bookings (past
   date, missing date/address/service, non-numeric phone). *Verified by tests.*
2. **One report per completed job** — every `completed` booking yields exactly
   one `ServiceReport`, and no booking can be completed without an approved
   report. *Enforced by UNIQUE constraint + processing control.*
3. **Billing integrity** — every invoice amount equals the booked service price
   (Termites 500k, Cockroach 200k, Rats 400k); there is at most one invoice per
   booking. *Enforced + tested.*
4. **No orphaned foreign keys** — foreign keys are enforced at the database
   level, so no Booking/Report/Payment/Feedback can reference a missing parent.
5. **Access control** — the management site is unreachable without admin login;
   refunds are impossible without the finance key; customers see only their own
   bookings. *Verified by tests.*
6. **State integrity** — booking status can only move forward one step at a
   time; approved reports cannot be edited. *Verified by tests.*
7. **Integration** — a booking confirmed on the customer site appears in the
   management queue with no manual step. *Verified by tests.*

Current status: the automated suite asserts items 1–3 and 5–7 directly and
passes **28/28** (this edition added 3 checks specific to the Firestore
implementation, including a session-validity check across two separate
serverless instances). Item 4 ("no orphaned foreign keys") is no longer
guaranteed structurally by the database engine itself, since Firestore has
no foreign-key mechanism — it is instead guaranteed by explicit
existence-checks in the application code before every write that
references another document (see `docs/ERD.md`, "How each original SQL
guarantee is now enforced," for the full mapping).

---

## 7. Addendum — testing under the Vercel + Firebase deployment

The testing process in Section 4 above still applies in full. One addition
specific to this deployment target: because Vercel runs the application as
independent, short-lived serverless function instances rather than one
continuously running process, a category of defect exists that a
single-process test cannot catch — state that one instance creates (like an
admin login session) silently failing to be recognised by a *different*
instance handling a later request. The automated suite was extended to test
this directly: it creates two separate application instances against the
same underlying data store and confirms a session token issued by the first
is still honoured by the second. This is integration testing adapted to the
actual shape of the deployment target, not just the code.

What the automated suite cannot verify, and what remains a manual
acceptance step before go-live, is connectivity to the real, deployed
Firebase project and the real Vercel deployment itself — both depend on
credentials and infrastructure that exist outside this codebase. The
deployment guide (`PANDUAN_DEPLOY.md`, "Langkah 8") defines this as an
explicit manual smoke test: log in as the demo customer, create a booking,
confirm it appears in the management queue, and run it through to a paid,
reviewed completion. That single pass-through is the final acceptance gate
this document does not pretend an automated test can replace.
