# Violet Homey App — M3 Write Control: Threat Model & Security Requirements

- **Date:** 2026-06-30
- **Status:** Draft — feeds M3 brainstorming/spec (not yet implemented)
- **Method:** STRIDE threat model → traceable security requirements (`security-requirement-extraction` skill)
- **Scope:** Milestone **M3 — Full control (write)**: `setFunctionManually` → setable capabilities + Flow actions, BasicAuth, safety guards
- **References:** M0 design spec §1, §13 (`docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md`); driver.js (credential capture); security audit 2026-06-30

> This document exists so the security-relevant decisions for the write path are made **before** code, per CLAUDE.md §5. Carry every requirement below into the M3 plan as a verifiable step.

---

## 1. Assets & confirmed facts

| Asset | Why it matters |
|---|---|
| **Write credentials** (controller user/password) | Grant full control of the pool controller. Stored in the device store — hidden from the settings UI, but **not encrypted at rest** (Homey documents no such guarantee; corrected 2026-07-13, was wrongly listed as "encrypted"); **transmitted in cleartext** on every write (see channel). |
| **Physical pool equipment** (pump, chlorine/pH-minus acid dosing, setpoints, heater) | A wrong/over-range write is a **real-world safety hazard** — over-dosing acid or chlorine, or stopping circulation. This app's whole purpose is a chemistry *safety net*; the write path must not become the hazard. |
| **Homey ↔ Violet LAN channel** | Plain HTTP, no TLS (controller limitation — confirmed, not a choice). |

**Write request (confirmed from live API):**
```
GET http://<host>/setFunctionManually?<TARGET>,<ARGS>
Authorization: Basic <base64(user:pass)>
```

## 2. Trust boundaries

```
[Homey UI / Flow]──①──►[PoolDevice write logic]──②──►(LAN, plain HTTP)──③──►[Violet controller]
        triggers              builds request            cleartext creds         executes action
```

- **① UI/Flow → write logic:** anyone with access to the Homey (household member, guest, compromised account) can trigger a write Flow or set a capability. Authorization & safety interlocks live here.
- **② write logic → LAN:** untrusted segment. Credentials and commands are sniffable/spoofable.
- **③ LAN → controller:** the app cannot cryptographically authenticate the controller over plain HTTP.

## 3. Threats (STRIDE)

| ID | STRIDE | Threat | Impact | Likelihood | Mitigating reqs |
|---|---|---|---|---|---|
| **T-M3-S1** | Spoofing | Attacker spoofs the Violet (ARP/DNS) so writes hit a rogue host that harvests the BasicAuth header | Credential theft → full controller takeover | Low–Med (needs LAN foothold) | SR-01, SR-08 |
| **T-M3-T1** | Tampering | Unvalidated Flow/capability input concatenated into `setFunctionManually?<TARGET>,<ARGS>` triggers an unintended or unsafe controller function (argument/function injection) | Unsafe physical action | Medium | SR-04, SR-05, SR-06 |
| **T-M3-T2** | Tampering | LAN MITM alters a write in flight (e.g. setpoint → extreme) | Unsafe physical action | Low–Med | SR-03 (accepted+mitigated), SR-08 |
| **T-M3-I1** | Info disclosure | Plain-HTTP credentials sniffed on the LAN | Credential theft | Med (any LAN sniffer) | SR-01, SR-03 |
| **T-M3-I2** | Info disclosure | Credentials leak via app logs, Insights, error text, or crash traces | Credential theft | Medium | SR-02, SR-09 |
| **T-M3-E1** | Elevation / unsafe control | Household member, guest, or a compromised/mis-built Flow triggers a dangerous write (pump off; dosing to max) | Physical safety / equipment damage | Medium | SR-05, SR-07 |
| **T-M3-R1** | Repudiation | No record of which Flow/user changed equipment when diagnosing an incident | Slower incident analysis | Low | SR-10 |
| — | DoS | Flooding writes to exhaust the controller | Out of scope (home LAN; documented) | — | — |

## 4. Security requirements

Each is traceable (→ threat), testable, and prioritized. `req_type` ∈ {Functional, Non-functional, Constraint}. ASVS = OWASP ASVS control family.

| ID | Title | Type | Priority | Threats | ASVS |
|---|---|---|---|---|---|
| **SR-01** | Credentials only in the `Authorization` header — **never** in URL/query | Constraint | High | S1, I1 | V6, V9 |
| **SR-02** | Credentials never logged or persisted to Insights/logs | Non-functional | **Critical** | I2 | V7, V8 |
| **SR-03** | Plain-HTTP cleartext-credential exposure is an explicit, documented accepted risk with mitigations | Constraint | Medium | I1, T2 | V9 |
| **SR-04** | Only allowlisted `TARGET`s may be sent | Functional | High | T1 | V5 |
| **SR-05** | All `ARGS` clamped to safe physical ranges per target | Functional | **Critical** | T1, E1 | V5 |
| **SR-06** | Request built by strict typed encoding, never string concat of untrusted text | Constraint | High | T1 | V5 |
| **SR-07** | Device-level "write enabled" interlock (default **off**) gates every write | Functional | High | E1 | V4 |
| **SR-08** | Write host pinned to the paired host; redirects & unexpected responses rejected | Functional | Medium | S1, T2 | V9 |
| **SR-09** | Write errors surface sanitized, non-sensitive messages | Non-functional | Medium | I2 | V7 |
| **SR-10** | Write actions logged (target + clamped args, **no creds**) | Functional | Low | R1 | V7 |

### Expanded — the two CRITICALs

**SR-02 — Credentials never logged**
*As a data owner, I need the app to never write controller credentials to logs, Insights, or error output, so that a LAN/log reader cannot recover them.*
- Acceptance criteria:
  - [ ] No code path passes the password, the `Authorization` header, or the base64 token to `this.log`/`this.error`/`console`.
  - [ ] On write failure, only HTTP status + the credential-free URL (host + target) are logged.
  - [ ] A unit/grep test asserts the credential string never appears in any log call argument.
- Test cases:
  - Test: a forced write failure logs status + sanitized URL, no `Basic …`, no password.
  - Test: building the request never embeds creds in the URL (SR-01 cross-check).

**SR-05 — Safe-range clamping (physical safety)**
*As a pool owner, I need every write argument validated against safe physical bounds before it leaves Homey, so that no Flow or input can drive equipment into a dangerous state.*
- Acceptance criteria:
  - [ ] Each writable target has explicit min/max (setpoints) or enumerated/capped values (dosing, pump mode) in a single source of truth.
  - [ ] Out-of-range or unknown values are **rejected** (write not sent) with a clear error — never silently coerced into a hazard.
  - [ ] Numeric args are finite-checked; enumerated args come from a fixed set.
- Test cases:
  - Test: setpoint above max / below min → rejected, no request sent.
  - Test: dosing arg above cap → rejected.
  - Test: NaN / non-finite / unknown target → rejected.

## 5. Traceability matrix (threat → requirements)

| Threat | Covered by |
|---|---|
| T-M3-S1 | SR-01, SR-08 |
| T-M3-T1 | SR-04, SR-05, SR-06 |
| T-M3-T2 | SR-03, SR-08 |
| T-M3-I1 | SR-01, SR-03 |
| T-M3-I2 | SR-02, SR-09 |
| T-M3-E1 | SR-05, SR-07 |
| T-M3-R1 | SR-10 |

Every High/Critical threat has ≥1 mitigating requirement; no orphan requirements.

## 6. Accepted risks / out of scope

- **No TLS on the controller** (SR-03): the Violet speaks plain HTTP only. Residual cleartext-credential and MITM exposure on the LAN is **accepted by design** and must be stated plainly in the store/readme. Mitigations: a least-privilege controller account for writes; user guidance to segment/trust the LAN; **rotate the write-password before publication** (already tracked — see security note, M0 spec §13).
- **DoS / rate limiting:** out of scope (home LAN, single controller).
- **No PII / GDPR scope:** pool telemetry is not personal data; the only secret is the device credential, covered above.

---

*Next: fold SR-01…SR-10 into the M3 plan as explicit verification steps (CLAUDE.md §4) and TDD cases for the pure write-builder/clamp logic, then re-run `/security-review` on the M3 diff before merge.*
