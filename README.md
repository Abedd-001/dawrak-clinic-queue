# (Dawrak) — Real-time Clinic Queue System

A serverless, mobile-first queue management system for medical clinics, built with **vanilla JavaScript + Firebase** (Realtime Database, Auth, Hosting). Patients book a turn by scanning a QR code, follow their position live, and the waiting-room screen announces the current number — no app install, no backend server.

Two products from one codebase:

| Folder | Product |
|---|---|
| [`dawrak/`](dawrak) | Single-doctor clinic |
| [`mdorak/`](mdorak) | Multi-doctor clinic (doctor picker, per-doctor queues, one daily code for the whole clinic) |
| [`toolkit/`](toolkit) | `new-clinic.js` — CLI that make a new clinic and injects its Firebase config |
| [`tests/`](tests) | Security-rules generator, rules simulator (149 cases), and Playwright end-to-end tests |

## Three screens
- **Patient page** — book by QR + daily code, live position/ETA, cancel own ticket. Arabic / RTL, mobile-first.
- **Staff dashboard** — email/password login (never persisted), call next, mark done/no-show, add walk-in patients, WhatsApp button, per-clinic settings.
- **Waiting-room display** — no login; shows the current number, QR to book, today's code, and plays a chime when the number changes (with autoplay-policy fallback).

## Engineering highlights
- **Security by Realtime Database rules, not by trust in the client.** Anonymous visitors can only *create* a ticket; they cannot read other patients' data, edit tickets, or reuse counters.
  - Public queue (`{no, first name, status}`) is split from private patient data (`name, phone, age, …`, staff-read only).
  - Booking requires today's code, enforced in the rules (`codeOn === true && code matches`); staff pages auto-generate it.
  - Counter can only grow by exactly 1 for anonymous users; ticket numbers must be within the counter; anonymous cancel is limited to `waiting → cancelled`; unknown fields are rejected (`$other: false`).
- **Rules are generated** from one Python script (`tests/gen.py`) for both products, then verified by a custom **rules simulator** with 149 test cases.
- **End-to-end tests** run real browsers (Playwright) against a fake Firebase backend that applies the *actual* rules file.
- **Atomic numbering** with Firebase transactions so two simultaneous bookings never share a number.
- **Zero build step**: static HTML/CSS/JS, deployable to Firebase Hosting; each clinic is isolated in its own Firebase project.
- Client-side routing with the History API (`/doctor-id/`), SVG logo traced from the original design, version tag on every page.

## Run the tests
```bash
cd tests
python3 gen.py        # generates dawrak.rules.json / mdorak.rules.json
node test.js          # rules simulator — ALL 149 PASSED
```
(E2E tests need Playwright: `node e2e_mdorak.js <path-to-public>`.)

## Setup a clinic
1. Create a Firebase project, enable Realtime Database + Email/Password auth, add a staff user.
2. `node toolkit/new-clinic.js` — answer the prompts (Firebase config).
3. `firebase deploy` from the generated folder.

> The Firebase config in this repo is replaced by placeholders (`YOUR_PROJECT_ID`).

Built by **Abdulrahman Abed**.
