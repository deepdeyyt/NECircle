# NECircle — Product Requirements Document

## Original Problem Statement
Build a full-stack web app called "NECircle" — a QR-code based contact tag system.
People buy a pre-printed sticker with a unique QR code (for their car windshield),
scan it once to activate/claim it with their info, and afterward anyone who scans
it sees a simple contact page. Screens: (1) Operator admin dashboard behind login
with stats, batch QR generation, tag inventory grid, and ZIP download of scannable
QR PNGs. (2) Public claim form at `/p/{tag_id}` for unassigned tags. (3) Public
contact page at `/p/{tag_id}` (same URL) with Call + WhatsApp buttons for active
tags. Bilingual (English + Bengali) microcopy on public pages, mobile-first,
warm terracotta/paper palette.

## User Choices (locked)
- **Brand**: "NECircle" — tagline "Connecting the Northeast"
- **Design**: Warm/terracotta palette (`#FBF7F1` paper, `#B5502F` clay, `#0F6E56` teal, `#2A2521` ink); Cabinet Grotesk display + Manrope body + Noto Sans Bengali
- **Phone validation**: Indian mobile only (10 digits starting 6–9; accepts `+91` / leading `0`)
- **QR scope**: ZIP contains QR PNGs for **unassigned** tags only

## User Personas
- **Operator (me)** – single admin, logs into `/admin`, generates batches, sends QR ZIP to the printer, monitors activation.
- **Tag owner (customer)** – buys a sticker, scans it once, fills a 3-field form.
- **Stranger/scanner** – scans a sticker on a parked car, taps Call or WhatsApp. No app, no signup.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB). All routes under `/api`. JWT (HS256) auth for admin only, tokens in localStorage + httpOnly cookie fallback. `qrcode` library generates real scannable PNGs bundled in-memory into a ZIP stream.
- **Frontend**: React 19 + React Router 7, Tailwind + shadcn/ui primitives (Button, Input, Label, Select, Textarea), `sonner` toasts, `lucide-react` icons. Warm palette wired via `tailwind.config.js` (`paper`, `clay`, `teal`, `ink`).
- **Data model** — collection `tags`: `{ id: "00001", status: "unassigned"|"active", created_at, profile: null | { name, phone, type, note, claimed_at } }`; collection `users`: seeded admin.

## Completed (2026-02-24)
- Backend routes: `/api/auth/{login,logout,me}`, `/api/tags/{id}` (public), `/api/tags/{id}/claim` (public), `/api/admin/{stats,tags,tags/batch,tags/qr-zip}`.
- Admin dashboard `/admin` with 3 stat cards, batch generator (1–1000), inventory grid with All/Unclaimed/Activated filter, QR ZIP download.
- Public `/p/{id}` with claim form (bilingual, business/vehicle toggle, inline validation, error clearing) and post-claim contact view rendered without navigation.
- Landing `/` + login `/login`.
- Admin seeded from env vars on startup; auth playbook followed (bcrypt + PyJWT + cookies).
- All 24 backend + frontend test cases passed via testing subagent (iteration 1).

## Backlog (prioritized)
- **P1 – Owner edit flow**: allow the tag owner to update name/phone/note after claiming (e.g. one-time edit link sent to their WhatsApp).
- **P1 – Sticker preview**: on-dashboard preview of the printed sticker artwork (QR + purple/yellow "NECircle" branding matching the sample), plus a print-ready PDF export.
- **P2 – Scan analytics**: count scans per tag (respect anonymity — no IPs/UAs stored) so operators can see which stickers are working.
- **P2 – Order form**: a public order page for buyers to request N stickers with shipping address.
- **P2 – SMS confirmation on claim** (Twilio) so the owner has proof of activation.
- **P3 – Multi-language toggle** beyond EN/BN (Hindi, Assamese).
