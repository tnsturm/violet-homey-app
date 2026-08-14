# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately via GitHub's **[Private vulnerability reporting](https://github.com/tnsturm/violet-homey-app/security/advisories/new)**
(Security → Report a vulnerability). This keeps the report confidential until a fix is
available and gives us a shared place to coordinate.

If you cannot use that channel, post a non-technical "please contact me about a security
matter" note in the [Homey Community topic](https://community.homey.app/t/157109) — do
**not** include details there — and we will arrange a private channel.

Helpful in a report: affected app version, Homey firmware, controller firmware, what an
attacker can achieve, and reproduction steps.

## What to expect

This is a single-maintainer, non-commercial project. Realistic targets, not an SLA:

| Stage | Target |
|---|---|
| Acknowledgement of your report | within 7 days |
| Initial assessment (valid / not, severity) | within 14 days |
| Fix released for a confirmed critical issue | as soon as practical; you will get an ETA |

Coordinated disclosure: we ask for up to **90 days** before public details, or until a
fixed version is on the Homey App Store — whichever comes first. Credit is given unless
you prefer otherwise.

## Supported versions

Security fixes are made against the **latest version published on the Homey App Store**.
Older versions are not patched — Homey updates apps automatically, so the current release
is the supported one.

## Scope

**In scope** — this app's code: the Violet HTTP client, credential handling and the write
(control) path, the inbound NOTIFY alarm listener, device settings and pairing, and the
LSI computation where a wrong result could mislead a user into damaging chemistry.

**Out of scope** — the Violet / BADU Blue controller firmware and its web interface
(report those to PoolDigital), the Homey platform itself (report to
[Athom](https://homey.app)), and the known design limitations listed below.

## Known limitations (by design, not vulnerabilities)

These follow from the controller's own capabilities and are documented rather than fixed:

- **The Violet's local API is plain HTTP** — it offers neither TLS nor a modern auth
  scheme. When write control is enabled, the controller credentials traverse the LAN in
  cleartext. Mitigations: write access is **off by default**, reads need no credentials
  at all, and the app stores credentials only in Homey's per-device store.
- **NOTIFY alarms are unauthenticated** — the controller cannot sign or authenticate its
  alarm pushes, so any LAN host could forge one. The listener therefore accepts alarms as
  *display and automation data only*; it can never actuate the pool. Keep the port
  LAN-only and never port-forward it.

Both assume a trusted or segmented home network. See the security notes in
[README.md](README.md) for the operational guidance.

## Security practices in this project

- Per-milestone threat models under [`docs/superpowers/security/`](docs/superpowers/security/)
  for every change that adds an attack surface (write paths, network listeners,
  credential handling).
- Automated security review on write-path and listener changes before merge.
- Commit hooks that block accidental secret commits and malformed manifest JSON.
- No runtime dependencies — the app ships no third-party code at runtime.

## Regulatory status

This app is free, MIT-licensed, non-commercial software. See
[README.md § Project status](README.md#project-status--regulatory) for details.
