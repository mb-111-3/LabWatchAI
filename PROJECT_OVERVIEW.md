# LabWatch AI — Project Overview

Intelligent Cross-Platform Computer Lab Access Control, Monitoring & Endpoint Management System.
This document describes what has been built so far, how it's organized, and how to run it.

---

## 1. What this build actually is

This is a **working end-to-end slice** of the full LabWatch AI concept, built to demonstrate the
system's data flow and admin/student experience. It intentionally does **not** include a real
Windows/Linux endpoint agent (that requires elevated OS-level privileges — USB blocking, process
killing, hardware polling — which is a separate, larger effort). Instead:

- The **student-facing login gate** is real and fully functional — it's the actual kiosk screen a
  student/guest would see before using a lab PC.
- The **admin dashboard** is real and fully functional — live-updating over WebSocket, backed by a
  real Go REST API.
- The **computer inventory** (12 PCs across 3 labs) is static seed data representing real hardware
  that would exist in a lab — this is not "fake" in the sense of fabricated activity, it's just
  the inventory list that would normally come from an admin registering machines.
- **Everything else — sessions, attendance, alerts, USB events, resource usage — is 100% derived
  from real actions** (a real login, a real logout, a real heartbeat). Nothing is randomly
  simulated or pre-seeded. Tabs like "USB Activity" and "Alerts" are correctly empty until a real
  endpoint agent exists to generate that data — they say so explicitly in the UI rather than
  faking numbers.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Backend | Go + Gin (REST API) + gorilla/websocket (live push) |
| Frontend | React + TypeScript + Vite |
| UI | MUI (Material UI) v6, dark theme |
| Charts | Apache ECharts (via echarts-for-react) |
| Routing | react-router-dom |
| HTTP client | axios |
| State store (backend) | In-memory, mutex-guarded (`Store` struct) — no external DB required to run this slice |

Full target stack (PostgreSQL, Redis, Python/FastAPI AI service, Docker, Nginx, JWT auth) is
documented separately but not yet wired in — this build uses an in-memory store and no auth layer
so it can run with zero setup for a demo.

---

## 3. Folder structure

```
LabWatchAI/
├── PROJECT_OVERVIEW.md          ← this file
├── server/                      ← Go backend
│   ├── go.mod / go.sum
│   ├── main.go                  ← entrypoint: wires routes, starts Gin + WebSocket hub
│   ├── models.go                ← all data types (Computer, Session, Alert, USBEvent, requests)
│   ├── store.go                 ← in-memory data store + computer inventory seeding
│   ├── handlers.go              ← every REST endpoint's logic
│   ├── hub.go                   ← WebSocket connection hub + broadcast helper
│   └── labwatch-server.exe      ← compiled binary (run this, or `go run .`)
│
└── dashboard/                   ← React frontend
    └── src/
        ├── main.tsx             ← React root
        ├── App.tsx              ← router: "/" = student login, "/admin" = admin dashboard
        ├── theme.ts             ← MUI dark theme config
        ├── api/
        │   └── client.ts        ← axios instance + WebSocket connect helper (with watchdog/reconnect)
        ├── types/
        │   └── index.ts         ← shared TypeScript types matching the Go JSON models
        ├── components/
        │   ├── StatTile.tsx     ← small stat-card used on the Overview tab
        │   └── ComputerCard.tsx ← per-PC card shown on the Computers tab
        └── pages/
            ├── LoginGate.tsx    ← student/guest kiosk login + post-login "session active" screen
            └── AdminDashboard.tsx ← the full admin UI (6 tabs, see below)
```

---

## 4. Backend — how it's organized

### `models.go`
Defines every data shape used across the app:
- `Computer` — id, name, lab, OS, IP, status (`available`/`in-use`), current user, idle flag
- `Session` — one student/guest login record (login time, logout time, roll/class/batch)
- `Alert`, `USBEvent` — event log entries (currently always empty — no fabricated data)
- `LoginRequest`, `CommandRequest`, `HeartbeatRequest` — API request bodies

### `store.go`
A simple thread-safe in-memory store (`sync.RWMutex` guarded maps/slices). `Seed()` registers 12
computers (PC-01…PC-12, split across Lab A/B/C, alternating Windows 11 / Ubuntu 22.04) with real
sequential IPs. No fake users, sessions, or events are ever seeded.

### `handlers.go`
All REST endpoint logic:
- `loginHandler` — validates required fields (roll/class/batch mandatory for students), creates a
  real `Session`, marks the computer `in-use`
- `heartbeatHandler` — called periodically by the student's browser tab; updates only the real
  `isIdle` signal (derived from actual mouse/keyboard events client-side)
- `logoutHandler` / `remoteCommandHandler` — end a session, free the computer
- `listComputersHandler`, `listSessionsHandler`, `listAlertsHandler`, `listUSBEventsHandler` — read endpoints
- `summaryHandler` — computes real counts (total, in-use, available, active sessions, alerts, USB events)
- `usageTrendHandler` — buckets real session login timestamps into the last 8 hours (a genuine chart, not fabricated)
- `assistantHandler` — rule-based natural-language Q&A stand-in for the planned LLM assistant;
  answers are computed from real store state (e.g. "which computers are available?")

### `hub.go`
WebSocket connection registry. `publish(hub, type, data)` broadcasts a JSON `{type, data}` message
to every connected browser tab whenever computer state, an alert, or a new session changes.

### `main.go`
Wires everything: creates the store, seeds it, starts the WebSocket hub, registers all `/api/...`
routes plus `/ws` and `/health`, starts the Gin server on `:8080`.

---

## 5. REST API reference

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/login` | Student/guest login — creates a session |
| POST | `/api/sessions/:id/heartbeat` | Periodic real idle-status ping from an active session |
| POST | `/api/sessions/:id/logout` | Ends a session, frees the computer |
| GET | `/api/computers` | List all computers |
| GET | `/api/computers/:id` | Get one computer |
| POST | `/api/computers/:id/command` | Admin action (ends the active session on that PC) |
| GET | `/api/sessions` | List all sessions (attendance) |
| GET | `/api/alerts` | List alerts (currently always empty) |
| GET | `/api/usb-events` | List USB events (currently always empty) |
| GET | `/api/stats/summary` | Dashboard summary counts |
| GET | `/api/stats/usage-trend` | Real login counts, last 8 hours |
| POST | `/api/assistant/query` | Natural-language Q&A (rule-based) |
| GET | `/ws` | WebSocket — live push of computer/alert/session updates |
| GET | `/health` | Health check |

---

## 6. Frontend — how it's organized

### `pages/LoginGate.tsx`
The student/guest kiosk screen (route `/`):
- Auto-detects/assigns "this computer" (no manual dropdown — persisted per-browser via localStorage)
- Student vs Guest toggle; students must fill Roll Number, Class, Batch — Guests just need a name
- Continue button is disabled until all required fields are valid
- On success, switches to a live "Session active" view: real elapsed-time counter, real idle
  detection (via actual mousemove/keydown listeners), a Log Off button that ends the real session

### `pages/AdminDashboard.tsx`
The admin screen (route `/admin`, reached directly — not linked from the student page, so the two
flows stay separate):
- **Overview** — stat tiles (Total/Available/Active Sessions/Alerts/USB Events, all real counts),
  a real login-trend line chart, a real available/in-use pie chart
- **Computers** — live grid grouped by lab, each card shows real status/current user/idle flag,
  with an admin action to end a session
- **Attendance** — table of real login sessions
- **Alerts** / **USB Activity** — tables that are honestly empty with an explanation, until a real
  agent exists
- **AI Assistant** — chat-style box hitting `/api/assistant/query`

Data flows in via a WebSocket connection (`api/client.ts`) with a watchdog that force-reconnects if
no message arrives for 8 seconds, plus a 5-second REST polling fallback, so the UI can't get stuck
on stale data.

### `components/`
- `StatTile.tsx` — reusable stat card (icon + number + label)
- `ComputerCard.tsx` — per-PC card used in the Computers tab

---

## 7. How to run

**Backend:**
```
cd server
./labwatch-server.exe
```
(or `go run .` to run from source)

**Frontend:**
```
cd dashboard
npm run dev
```

Then open:
- `http://localhost:5173` — student/guest login kiosk
- `http://localhost:5173/admin` — admin dashboard

Backend listens on `:8080`; the frontend expects it there (see `dashboard/src/api/client.ts`).

---

## 8. What's genuinely NOT built yet (be upfront about this with an examiner)

- **Real Windows/Linux endpoint agent** — no actual OS-level hooks for USB blocking, process
  monitoring, clipboard restriction, or hardware telemetry. This is why Alerts/USB Activity are
  empty and there's no CPU/RAM/disk display anymore — those numbers can't be honestly produced
  without a real agent.
- **Persistent database** — current store is in-memory; restarting the server wipes all data
  (computer IDs regenerate too, so a stale browser tab will need a refresh).
- **Authentication for the admin dashboard** — anyone can currently open `/admin` with no login.
- **Real LLM-backed AI assistant** — currently rule-based keyword matching, not an actual model call.
- **Python/FastAPI AI microservice, Redis, Docker/Nginx deployment** — part of the target stack, not yet implemented.
