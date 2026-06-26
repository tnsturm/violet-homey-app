# Violet Homey App — Inbound HTTP Alarm Notifications (Design Spec)

- **Date:** 2026-06-26
- **Status:** Approved design (pending written-spec review)
- **Project:** Homey Pro app for the PoolDigital "Violet" pool controller
- **This spec covers:** Milestone **M4** — Inbound HTTP alarm notifications: receiving the Violet's outbound HTTP "NOTIFY" alarm requests on Homey and exposing them as a device Flow trigger. Feature-independent of M1–M3 (buildable any time after M0); sequenced in the roadmap as **M4**, before publish-readiness (now **M5**).

---

## 1. Context & goals

The Violet controller can push **alarms/warnings** to an external system via an outbound HTTP request (the controller's *NOTIFY* feature). The user currently catches these on Homey via the third-party **Micro Web Server** app (listening on port 5080) plus an Advanced Flow ("VioletPoolDataGET") that re-broadcasts them. This feature replaces that relay: the **Violet app itself** listens for the request and raises a native Homey **Flow trigger** on the Pool device, removing both external dependencies.

This is an **alarm/event** feature only. It does **not** push or refresh measurement values (polling via `getReadings?ALL` remains the source of readings).

### Confirmed external facts (from the Violet manual + live testing)

The Violet sends, on each alarm, an HTTP request to a configurable receiver:

```
GET http://<receiver-ip>:<port>/<path>?ERRORCODE=<4-digit>&SUBJECT=<short description>
```

- Both **GET and POST** work; the user has chosen **GET** (simpler). The app must accept either, but the contract is GET with query parameters.
- Query parameters (manual p.153):
  - `ERRORCODE` — a four-digit error code.
  - `SUBJECT` — a short human-readable description of the fault (already localized by the controller).
- Receiver address, **path**, and **port** are configured separately on the Violet; the port via `modifyParameter.htm?NOTIFY_http_baseport` (default 80, freely settable — the user uses 5080 today).
- Transport is **plain HTTP only**, **no authentication**. This is a controller limitation, not a choice.
- The full list of four-digit error codes is in the manual (p.155). It is **not** needed for this feature: `SUBJECT` already carries the description, and the optional Flow filter is free-text (see §5).

---

## 2. Chosen approach

**Embedded HTTP server inside the app** (Node `http.createServer`), bound to a configurable LAN port. This is the only approach that matches the Violet's existing notification config (custom port, plain HTTP, custom path, GET) without forcing the user onto Homey's fixed web-server port. Feasibility is proven by the Micro Web Server app, which runs exactly this kind of embedded LAN listener on a Homey app.

Approaches considered and rejected:
- **Homey app Web API public endpoint** (`api.js`, `"public": true`): served only on Homey's fixed web port (80/443), not a custom port; plain-HTTP-on-80 locally is uncertain; unauthenticated public endpoint. Rejected — less control, worse fit.
- **Homey local webhook / status quo relay** (Micro Web Server + Advanced Flow): the current setup being replaced; needs fixed query params or HTTPS+auth and an extra app + flow.

---

## 3. Architecture

```
Violet  ──HTTP GET ?ERRORCODE&SUBJECT──►  PoolDevice's HTTP listener (port 22222, configurable)
                                                │
                                          parseAlarm(req)  → { errorcode, subject }
                                                │
                                          device._fireAlarm(...)
                                                │
                                          DeviceTriggerCard "alarm_received"
                                          tokens: errorcode, subject   (optional code filter)
```

- The **Pool device owns the listener**, mirroring the existing `_startPolling()` lifecycle (start in `onInit`, restart on settings change, close in `onUninit`). This keeps the feature consistent with the current device-centric design and the existing settings UI.
- `lib/NotifyServer.js` (new) wraps the server with a **module-level singleton guard**: only one bind per port. A pure `parseAlarm(method, url, body)` helper does the parsing and is unit-tested without Homey.
- **Single-Violet assumption:** one Pool device per installation (the realistic case). The alarm payload carries no device identifier, so if multiple Pool devices existed the singleton server would fire the trigger on each. Documented limitation, not engineered around.

---

## 4. Components

| File | Responsibility |
|---|---|
| `lib/NotifyServer.js` *(new)* | `createNotifyServer({ port, onAlarm })` → start/stop; singleton bind guard; `EADDRINUSE` surfaced to caller. Pure `parseAlarm(method, url, body)` → `{ errorcode, subject } \| null`. No Homey dependency. |
| `drivers/pool/device.js` | `_startNotifyServer()` (mirrors `_startPolling`): reads `notifyPort` setting, binds, restarts on change, closes in `onUninit`. `_fireAlarm({ errorcode, subject })` fires the trigger card. |
| `.homeycompose/flow/triggers/alarm_received.json` *(new)* | Trigger card definition: title, `errorcode`+`subject` tokens, optional `errorcode` filter arg. |
| `drivers/pool/driver.js` / `device.js` | Register via `this.homey.flow.getDeviceTriggerCard('alarm_received')` + run listener for the filter. |
| `app.json` settings (`.homeycompose`) | New `notifyPort` device setting. |

---

## 5. Flow trigger card

- **Card:** "Ein Alarm wurde empfangen" (EN: "An alarm was received"), scoped to the Pool device via `getDeviceTriggerCard`.
- **Tokens:** `errorcode` (string, 4-digit), `subject` (string, controller's description text).
- **Optional argument** `errorcode` (free text): empty ⇒ trigger on every alarm; filled ⇒ trigger only when the incoming code matches exactly. Implemented with a `registerRunListener` comparing `args.errorcode` against `state.errorcode`. A dropdown populated from the manual's code list is a possible later enhancement; not in scope now.

---

## 6. Configuration

- New device setting **`notifyPort`** (number), **default `22222`**, range e.g. 1024–65535.
  - Default rationale: a fixed listening port should sit **below 32768** to avoid Linux's ephemeral source-port range (32768–60999), where a fixed listener can intermittently hit `EADDRINUSE`. `22222` is free of Homey's ports (80/443), the Micro Web Server's (5080/5081), and common services. Fully user-changeable.
- **Path is not enforced:** the listener accepts any path and reads only the query string, so the Violet's "Pfad zur Empfänger-API" can be anything.
- On `notifyPort` change → rebind (same pattern as `pollIntervalSeconds` → `_startPolling`).

---

## 7. Error handling & security

- **LAN-only, no HTTPS/auth** — accepted by design (the Violet supports neither; the listener is not reachable from the internet, same as Micro Web Server).
- **Port conflict (`EADDRINUSE`)**, e.g. if the Micro Web Server still holds 5080: catch, `this.error(...)`, mark a clear log line; never crash the device. Migration: free the old port or pick another and update the Violet's `NOTIFY_http_baseport`.
- **Malformed request** (missing `ERRORCODE`): respond `400`, do not fire the trigger, never throw.
- **Valid alarm:** respond `200 OK` with a short body so the Violet sees success.
- Server closed cleanly in `onUninit`; listener errors routed to `this.error`.

---

## 8. Testing

- **Unit (`test/NotifyServer.test.js`, new):** `parseAlarm` for
  - GET `?ERRORCODE=1234&SUBJECT=Hello%20World` → `{ errorcode: '1234', subject: 'Hello World' }` (URL-decoding),
  - POST body form/query variant,
  - missing `ERRORCODE` → `null`,
  - extra/unknown params ignored.
- Consistent with the existing Jest suite (`test/*.test.js`). Device-lifecycle wiring verified manually on hardware (bind, fire trigger, port change), matching how M0 freshness was validated live.

---

## 9. Out of scope

- No measurement push/refresh from notifications (polling stays authoritative).
- No error-code→text mapping table or dropdown (free-text filter only).
- No multi-device alarm routing beyond "fire on all Pool devices".
- No outbound write/control (that is M3).
