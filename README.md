# Violet + BADU Blue — Pool Control for Homey

Bring your **PoolDigital Violet** or **BADU Blue** pool controller into Homey Pro over
your local network. See live water chemistry, temperatures, pump and equipment state
and dosing status; control the filter pump, lights, DMX scenes and PV‑surplus mode;
and let an optional **Langelier (LSI) water‑balance safety net** warn you *before* the
water turns corrosive or scale‑forming. Every reading feeds Homey **Insights** and **Flow**.

> **Violet and BADU Blue are the same hardware.** BADU Blue is Speck Pumpen's badge of
> the PoolDigital Violet controller — the app talks to both identically.

![SDK](https://img.shields.io/badge/Homey-SDK%203-6A4C93)
![Platform](https://img.shields.io/badge/platform-Homey%20Pro%20(local)-6A4C93)
![Compatibility](https://img.shields.io/badge/Homey-%E2%89%A512.2.0-6A4C93)

> ✅ **Status: Live on the Homey App Store**, certified by Athom. Feedback and issue
> reports are very welcome.
>
> **Install:** https://homey.app/de-de/app/de.neunbft.violet/Violet-Poolsteuerung/

* * *

## Supported controllers

| Manufacturer / brand | Controller | Connection |
|---|---|---|
| PoolDigital | **Violet** | Local LAN (HTTP) |
| Speck Pumpen | **BADU Blue** | Local LAN (HTTP) |

The app runs **fully local** — no cloud account, no PoolDigital login. It polls the
controller's on‑device JSON API on your network and (optionally) writes commands back
to it.

* * *

## Features

The Pool device adapts to *your* installation: capabilities appear only when the
controller actually reports the corresponding hardware (see **Feature groups** below),
so you don't get empty tiles for equipment you don't have.

### Readable values (sensors)

| Capability | What it shows |
|---|---|
| `measure_temperature` | Water temperature (selectable 1‑Wire sensor, auto by default) |
| `measure_ph` | pH |
| `measure_orp` | Redox / ORP (mV) |
| `measure_chlorine` | Free chlorine (mg/L), if a chlorine probe is detected |
| `measure_lsi` | Langelier Saturation Index (opt‑in, see below) |
| `pump_running` / `pump_speed_stage` / `runtime_pump` | Filter pump state, speed stage, runtime today |
| `heater_active` / `runtime_heater` | Heater on, heater runtime today |
| `solar_active` / `runtime_solar` | Solar absorber on, solar runtime today |
| `eco_active` | Eco mode |
| `cover_state` | Cover: open / closed / moving / stopped |
| `light_on` | Light on |
| `refill_active` / `overflow_refill_active` | Fresh‑water refill / overflow‑tank refill running |
| `measure_water_level` | Water level (%) |
| `dosing_active` / `measure_dosing_daily_ml` / `measure_dosing_days_left` | Dosing now, dosed today (mL), estimated days of chemical left |
| `backwash_active` | Filter backwash running |
| `measurements_fresh` | Whether readings are trusted (pump warm‑up gating, see below) |
| `controller_firmware` / `system_uptime` | Controller firmware & uptime |
| `measure_system_cpu_temperature` / `measure_system_memory` / `last_error_id` | Advanced diagnostics (opt‑in) |

### Alarms (tile indicators + Insights)

| Capability | Fires when |
|---|---|
| `alarm_water_balance` | LSI leaves the balanced band (corrosive or scaling) |
| `alarm_dosing_blocked` | A dosing channel hit its safety cap (chemistry no longer corrected) |
| `alarm_dosing_low` | A dosing canister dropped below the configured days‑left threshold |
| `alarm_omni_valve` | Backwash multiport (OMNI) valve reports a fault |
| `alarm_overflow_dryrun` | Overflow tank reports dry‑run (equipment risk) |
| `alarm_overflow_overfill` | Overflow tank reports overfill (flood risk) |

### Control (write access — opt‑in)

Disabled by default. Enable **Control (write)** in the device settings to expose
control tiles and let Flow command the controller.

| Capability | Control |
|---|---|
| `pump_control` | Pump: Auto / On / Off (tile ON auto‑reverts to Auto after a configurable duration) |
| `light_control` | Light: Auto / On / Off |
| `pvsurplus_control` | PV‑surplus mode on/off |

### Feature groups (show / hide)

Each equipment group — Eco, Heater, Solar, Backwash, Cover, Light, Water refill,
Overflow tank, Water level, PV surplus, Dosing (per detected channel) — has an
**Auto / Always show / Hide** setting. *Auto* shows the group only when the controller
reports it. This keeps the tile focused on the hardware you actually run.

* * *

## The LSI water‑balance safety net

The app's flagship feature. Beyond simply displaying pH and temperature, it can
continuously compute the **Langelier Saturation Index (LSI)** — the industry measure of
whether your water is *scale‑forming*, *corrosive*, or *balanced*.

**Why it matters.** Corrosive (under‑saturated) water leaches calcium from cement‑based
finishes and attacks metals — **copper, iron, heaters and heat exchangers** — causing
permanent damage. Scale‑forming (over‑saturated) water deposits calcium carbonate on
tiles, plumbing and heater elements. Preventing copper corrosion in the heat exchanger
is the reason this app exists.

**Live, not a snapshot.** The LSI is recomputed on every poll from your *live* pH and
water temperature, combined with the slow‑changing chemistry you enter once (calcium
hardness, total alkalinity, cyanuric acid). So you see the *current* balance and get
alerted to drift — not just a reading from the day you tested.

**The balanced band is deliberately asymmetric: −0.3 … +0.5** (0 ideal). A slightly
positive LSI is safer, because a thin protective scale layer shields surfaces whereas
corrosive water does irreversible harm. The app classifies each reading:

| LSI | Classification | Severity |
|---|---|---|
| `< −0.5` | Severe corrosive | Critical |
| `−0.5 … −0.3` | Corrosive | Warning |
| `−0.3 … +0.5` | Balanced | OK |
| `+0.5 … +1.0` | Scaling | Warning |
| `> +1.0` | Severe scaling | Critical |

It uses the Carrier closed‑form LSI with a pH‑dependent cyanuric‑acid correction (so
stabilised pools are handled correctly), and accepts calcium hardness / alkalinity in
ppm, °dH or °f.

**Honesty caveat (DIN 19643):** the LSI describes the calcium‑carbonate/CO₂ equilibrium
and corrosion risk for cement‑based materials and metals such as copper and iron. It is
**not** a valid predictor of **stainless‑steel** corrosion (which depends on alloy,
chloride, pH and temperature).

LSI is **opt‑in**: enable *Compute LSI* in the device settings and enter your chemistry
values. When disabled, the `measure_lsi` tile and water‑balance warnings are absent.

**Sources**

- **ANSI/PHTA/ICC‑11** (formerly APSP‑11), *American National Standard for Water Quality
  in Public Pools and Spas* — the −0.3…+0.5 balanced range and band scheme —
  <https://www.phta.org/>
- **DIN 19643** *Aufbereitung von Schwimm- und Badebeckenwasser* — the stainless‑steel caveat
- **W. F. Langelier (1936)** — the original index definition
- **Orenda Technologies**, *Understanding the LSI* — <https://blog.orendatech.com/langelier-saturation-index>
- **Lovibond**, *Balanced Water (Langelier Index)*

* * *

## Flow cards

### Triggers

| Trigger | Tokens |
|---|---|
| **LSI warning** (filterable: any / corrosive / scaling / critical) | `lsi`, `classification`, `direction`, `severity` |
| **Dosing blocked** | `channel`, `reason` |
| **Dosing chemical low** | `channel`, `days_left` |
| **Backwash valve fault** | `state` |
| **Overflow dry‑run** | — |
| **Overflow overfill** | — |

### Actions (require control enabled)

| Action | Parameters |
|---|---|
| **Set pump mode** | mode (Auto/On/Off), duration (min, 0 = permanent), speed stage |
| **Set light mode** | Auto / On / Off / Color step |
| **Set DMX scene** | scene 1–12, mode On/Auto/Off |
| **Set all lights & DMX scenes** | All on / All auto / All off |
| **Set PV surplus mode** | on/off, speed stage |
| **Set water chemistry** | calcium hardness, total alkalinity, CYA (feeds the LSI) |

* * *

## Installation

### Requirements

- Homey Pro (compatibility **≥ 12.2.0**), local platform
- A PoolDigital **Violet** or **BADU Blue** controller reachable on the same LAN
- Recommended: give the controller a **static IP** outside the DHCP range for reliability

### Setup in Homey

1. Install the app.
2. Add the **Pool** device. Enter the controller's host or IP (default `violet.local`).
   > The Violet does not advertise an mDNS service, so `violet.local` may not resolve on
   > every network — using the controller's IP is the most reliable choice.
3. The device appears with the tiles matching your detected equipment.
4. *(Optional)* Enable **Compute LSI** and enter your chemistry values.
5. *(Optional)* Enable **Control (write)** to command the pump/lights/PV mode.

### Key device settings

| Setting | Default | Notes |
|---|---|---|
| Violet host or IP | `violet.local` | Static IP recommended |
| Poll interval (seconds) | 60 | 60–900 |
| Pump warm‑up before trusting readings (s) | 120 | pH/ORP are only trusted after the pump has circulated |
| Water temperature sensor | Auto | Pick a specific 1‑Wire channel if auto‑selection is wrong |
| Compute LSI + chemistry values | off | Opt‑in flagship safety net |
| Enable control (write) | off | Opt‑in; see security note |

* * *

## Security note (write access)

Control (write) is **off by default**. When you enable it, the app authenticates writes
with a controller username/password you provide. The Violet's local API is **plain HTTP**,
so credentials travel the LAN in cleartext. Therefore:

- use a **least‑privilege** controller account for the app,
- keep the controller on a **trusted / segmented** network, and
- **rotate the write password** before sharing configs or logs.

Reads never need credentials.

* * *

## Alarm notifications (NOTIFY)

The app can receive the Violet's alarm pushes and fire the **"An alarm was received"** Flow
trigger. To set it up, configure the Violet's notification settings to send alarms to your
Homey's IP and the **Alarm listener port** from the device settings (any path, plain HTTP
GET).

**Setting the receiver port on the Violet:** the Violet's regular web interface lets you
configure the notification receiver, but **not its port** — the port can only be changed on
an undocumented parameter page (live-verified 2026-07-20, controller fw 1.2.1). Open

```
http://<violet-ip>/modifyParameter.htm?NOTIFY_http_baseport
```

in a browser (log in if prompted): the page shows an input form for
`NOTIFY_http_baseport` — enter the app's listener port (default **22222**) and save. The
controller's default is 80.

**Security note:** The Violet supports neither HTTPS nor authentication for NOTIFY, so any
device on your LAN could send such a request. However, the trigger is display and automation
data only — it can never control the pool. Keep the port **LAN‑only**; never port‑forward it.

* * *

## Roadmap

This release covers monitoring, the LSI safety net and basic control. Planned for coming
versions:

- **PoolLab / LabCOM import** — auto‑import chemistry values (calcium hardness, alkalinity, CYA) to feed the LSI instead of entering them by hand.
- **Water‑balance recommendations** — advisory guidance on reaching a good LSI band, including fresh‑water CO₂ out‑gassing effects.
- **Dosing & setpoints** — adjust target pH/ORP and dosing from Homey.
- **More sensors** — filter pressure and flow readings, plus an auto‑detection review.

Timing is not fixed; priorities will follow user feedback.

* * *

## How this app was built — entirely IDE‑free

This app was developed **without a traditional IDE** — start to finish in
[Claude Code](https://www.anthropic.com/claude-code) in the terminal, with GitHub for
version control. There is no hand‑written application code in the usual sense: the human
role was domain expertise (pool chemistry, the Violet API), hardware testing on a real
controller, and the design decisions; Claude did the implementation.

**How long did it take?** M0 through publishing — ~40 capabilities, the LSI engine, write
control, a full unit‑test suite, all bilingual — came together in about **two weeks of
part‑time evenings and weekends** (an estimated 30–40 hours). Built the traditional way solo,
while learning the Homey SDK, reverse‑engineering the controller's API, and getting the LSI
chemistry right and validated, I'd estimate **several months of spare‑time work (150–250
hours)**. The AI didn't replace the engineering judgement — it collapsed the learning curve
where it mattered most.

What made it work as an *engineering* process rather than vibe‑coding:

- **Milestone‑driven**, spec‑first workflow — each milestone brainstormed into a design
  doc, then a plan, then implemented **test‑first (TDD)**; all pure logic (LSI, freshness,
  feature detection) is unit‑tested.
- **Automated guardrails** — git hooks that block malformed manifest/changelog JSON and
  accidental secret commits, plus automated **security reviews** on write‑path changes.
- **Bilingual (en/de)** UI, Flow cards and changelog throughout.
- A live **progress dashboard** tracking every milestone.

The toolchain that makes Homey development possible from an agent in the terminal:

- **homey‑cli skill for Claude Code** — drive the Homey CLI, inspect devices and build
  flows from the terminal:
  <https://community.homey.app/t/homey-cli-skill-for-claude-code-drive-homey-build-flows-from-terminal-and-ai-agents/155229>
- **homey‑app skill** — <https://github.com/dvflw/homey-app-skill>
- **Superpowers** (workflow skills: brainstorming, writing‑plans, TDD, systematic
  debugging, code review) — <https://github.com/obra/Superpowers>

Inspiration and precedent: Andi Wirz's write‑up of building a published Homey app with
Claude without hand‑writing code —
<https://www.wirzfamily.ch/how-i-built-a-homey-app-with-claude-ai-without-writing-a-single-line-of-code-myself/>

Motivation, if you want the bigger picture:

- Anthropic's Boris Cherny — *Why Coding Is Solved, and What Comes Next*:
  <https://www.youtube.com/watch?v=SlGRN8jh2RI&t=802s>
- *Reflecting on a year of Claude Code*:
  <https://www.youtube.com/watch?v=Hth_tLaC2j8>

* * *

## Acknowledgements

- **PoolDigital** for the Violet controller and its local JSON API.
- Andi Wirz (`andiwirz`) for the Luxtronik Homey app that showed the way for
  agent‑built, well‑documented Homey apps.
- The Homey community skill authors (homey‑cli, homey‑app) and the Superpowers project.

## License

Released under the [MIT License](LICENSE) © 2026 Torsten Sturm.
