# Violet + BADU Blue — Quickstart Guide

> Canonical source for the "Quickstart" post in the Homey Community topic
> (ID 157109). Post as a reply in that topic (don't overwrite the original
> announcement post) and keep it in sync with this file — see
> [HOMEY.md § Community Quickstart Guide](../../HOMEY.md) for when to update it.
> German version: `quickstart-guide.de.md`.

This app brings your **PoolDigital Violet** or **BADU Blue** pool controller into
Homey over your local network — no cloud account, no PoolDigital login. Everything
below works the same for both; BADU Blue is Speck Pumpen's badge of the same
PoolDigital hardware.

## Requirements

- A Homey Pro (local platform)
- Your Violet/BADU Blue controller on the same network as Homey
- Recommended: give the controller a static IP so Homey doesn't lose it after a
  router reboot

## Setting it up

1. Install the app from the [Homey App Store](https://homey.app/de-de/app/de.neunbft.violet/Violet-Poolsteuerung/).
2. Add a **Pool** device and enter the controller's host or IP. Try `violet.local`
   first; if that doesn't resolve on your network, use the controller's IP address
   instead.
3. The device shows up with tiles for whatever equipment your controller actually
   reports — no empty tiles for gear you don't have.
4. Reading values (temperature, pH, pump state, etc.) works immediately, without
   any password.

That's it for monitoring. Two optional features go further — both are off until
you switch them on:

## Optional: the water-balance safety net

Enable **Compute LSI** in the device settings and enter your calcium hardness,
total alkalinity and cyanuric acid (from your test kit or PoolLab). The app then
continuously works out whether your water is **corrosive**, **balanced** or
**scaling**, using live pH and temperature — not just the day you last tested.

Why it matters: corrosive water attacks copper and iron parts (especially the
heater), and scaling water deposits limescale on tiles and plumbing. You get a
Homey alarm and a Flow trigger the moment the balance drifts out of range, so you
can act before either type of damage sets in.

## Optional: getting advice on your water balance

Once the safety net above tells you *that* something is off, this feature tells
you *what to do about it*. It turns the LSI into concrete, quantified
suggestions — dosing amounts and a fill-water startup plan — without ever
touching the controller itself: the advisor only advises, it never doses
anything on its own.

**What you need:** **Compute LSI** enabled with your chemistry values entered
(see above), plus your **pool volume** in the device settings if you want
amounts in grams or millilitres. Without a pool volume you still get the
direction of the recommendation, just not a quantity.

**Reading your fill water:** for a startup plan for freshly filled water,
enter the values from your water utility's annual water analysis
(*Trinkwasseranalyse* — every German utility publishes one, usually on their
website): the **total hardness** in °dH (*Gesamthärte*), the **acid capacity**
K_S4,3 in mmol/L (*Säurekapazität*), and the **pH**. The app converts these
into pool-chemistry units itself, assuming 75% of the hardness is calcium (the
rest magnesium) — a typical split for German tap water that you can adjust in
the settings if your utility publishes the exact figure.

**Two new Flow actions:**

- **"Get water-balance advice"** looks at your current chemistry and tells you
  which lever — pH, alkalinity or calcium hardness — moves the LSI the most,
  with a dose amount if the pool volume is set. Tokens: the advice text, the
  top lever, the current LSI, and the LSI you'd reach after following the top
  recommendation.
- **"Analyze fill water"** looks at the tap-water values you entered and
  works out the LSI of that water plus a step-by-step startup plan. Tokens:
  the fill water's LSI, the equilibrium pH it will settle at, and the plan
  text.

**Timeline notification:** when the LSI drifts into a corrosive or scaling
band, you automatically get a Homey timeline entry with the top driver and a
dose amount — no Flow needed. Turn this off with **Timeline notification on
band change** if you'd rather only check on demand.

**Why fresh fill water needs a moment:** tap water straight from the pipe
carries more dissolved CO₂ than it will once it settles. As that CO₂ escapes
into the air, the pH climbs on its own — no chemical needed. If your fill
water's alkalinity is low (under roughly 80 ppm), that swing is much bigger,
because there's too little buffering to hold the pH steady. That's why the
startup plan always fixes alkalinity first, then lets the water circulate for
a day or two to finish outgassing, and only then sets the pH — doing it in the
other order means chasing a moving target.

**Keep in mind:** all dose amounts are estimates ("≈"), based on the
calcium-share assumption above and the product concentrations named in the
dropdowns (e.g. sulfuric acid at 14.9%) — your actual product may differ
slightly. And if your Violet already doses pH itself, the advice leaves pH to
the controller and focuses on alkalinity and calcium hardness instead.

## Optional: controlling the pool from Homey

Enable **Control (write)** in the device settings to command the pump, lights, DMX
scenes and PV-surplus mode from Homey tiles and Flow. This needs a
username/password for the controller — use a dedicated, least-privilege account,
since the Violet's local API is plain HTTP (no encryption) on your LAN. Reading
values never needs a password, only writing commands does.

## Showing/hiding equipment tiles

Every equipment group (heater, solar, cover, backwash, water refill, overflow
tank, dosing, …) has an **Auto / Always show / Hide** setting. Auto — the
default — shows a tile only when your controller actually reports that hardware,
so your device view stays focused on what you actually have installed.

## Flow automation

Everything the app reads or does is available in Flow: triggers for LSI warnings,
dosing problems, backwash faults and overflow-tank faults; actions to set the
pump/light/DMX/PV-surplus mode and to update your water-chemistry values. Alarms
also show up automatically in the device's alarm tiles.

## Getting alarm push notifications from the Violet

The Violet can push its own alarms straight to Homey (separate from the app's
built-in LSI/dosing alarms above), firing an **"An alarm was received"** Flow
trigger.

To set it up:

1. In the Violet's own notification settings, set the receiver to your Homey's IP
   address, using the **Alarm listener port** shown in the device settings
   (default `22222`).
2. The Violet's normal web interface can't change *its own* receiving port — that
   needs an undocumented page. Open
   `http://<violet-ip>/modifyParameter.htm?NOTIFY_http_baseport` in a browser,
   enter the same port number there, and save. (The device settings screen in
   Homey also shows this as a hint right next to the port field.)

Note: this channel has no encryption or authentication on the Violet's side, so
keep it LAN-only — never forward that port to the internet. It only ever feeds
Homey a notification; it can't be used to control the pool.

## Troubleshooting / FAQ

- **`violet.local` doesn't resolve** — the Violet doesn't advertise itself via
  mDNS on every network. Use its IP address instead (and consider giving it a
  static one).
- **Some tiles are missing** — that's expected if your controller doesn't report
  that equipment; check the feature-group settings above if you expected to see
  one.
- **pH/ORP/chlorine show `-` right after startup** — the app only trusts those
  readings once the pump has circulated water for a bit (configurable "pump
  warm-up" setting), since a stagnant sensor isn't representative.
- **BADU Blue vs. Violet** — identical hardware, identical setup; everything in
  this guide applies to both.
- Found a bug or have a feature idea? Reply in this topic.
