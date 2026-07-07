# M4 Publish-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npx homey app validate --level=publish` PASS and get the Violet app certification-ready for the Homey App Store (final store name, description, README, icons, product images, mDNS discovery with manual fallback, version 0.4.0).

**Architecture:** No device-logic changes — the app already reads and controls the controller. M4 is store metadata, real vendor assets (icon SVG flatten, JPG→PNG landscape images, a newly designed driver icon SVG), an additive mDNS-discovery pairing path that keeps manual host entry as fallback, and a version/changelog bump. All manifest edits go to `.homeycompose/**` (never the generated root `app.json`).

**Tech Stack:** Homey Apps SDK v3, Homey Compose, Node v25 (only Node is available — no ImageMagick/Inkscape/Python/sharp/jimp installed; use pure-JS npm packages installed in the scratchpad, never as repo dependencies).

## Global Constraints

- App ID `de.neunbft.violet` — **immutable after publish, keep exactly**. `sdk: 3`, `platforms: ["local"]`, `compatibility: ">=12.2.0"`, `category: ["appliances"]`, `brandColor: "#6A4C93"`, `permissions: []` — all unchanged.
- Store name: en `Violet and BADU Blue Pool Control`, de `Violet & BADU Blue Poolsteuerung` (verbatim).
- Local device name `Pool` stays unchanged.
- **Never edit the generated root `app.json`** — edit `.homeycompose/**` (enforced by the `compose-guard` hook). The root `app.json` regenerates on `homey app build|run|validate|version`.
- **JSON authoring:** build/patch manifest + changelog JSON **programmatically** (`node` + `JSON.stringify`), German inner quotes as `„…"` (U+201E/U+201C), verify with `JSON.parse` before commit. The `json-guard` PostToolUse hook blocks invalid manifest/changelog JSON.
- **README:** plain text only — no markdown, no URLs, no changelog, no feature-list bullets, no contributor credits (`references/publishing.md`).
- **documenting-code skill:** any `.js` you create/modify gets the file header + decision-point comments with §-refs; JSDoc only on pure `/lib` exports. Discovery handlers in `device.js` are glue → header/decision comments, no JSDoc.
- **Security:** credentials only in the device store; no cleartext credential in repo (verified 2026-07-07). Write-password rotation is an **operational pre-publish step**, not code.
- `node --test` must stay green (76 tests as of M3). Final gate: `npx homey app validate --level=publish` PASS.
- Assets live in `~/Downloads/`: `touchicon_VIOLET.svg`, `VIOLET_Base-Module_Poolsteuerung_800x800.jpg`, `VIOLET_Relais-Erweiterung_800x800.jpg`. Scratchpad dir: `C:\Users\TORSTE~1\AppData\Local\Temp\claude\C--Users-TorstenSturm-source-repos-VioletApp\848de09e-1fc3-4743-bfc2-dc2a3d2827b5\scratchpad`.

---

## File Structure

- `.homeycompose/app.json` — MODIFY: `name`, `description` (en+de). Nothing else.
- `README.txt` — MODIFY: new English store text.
- `README.de.txt` — CREATE: German store text.
- `assets/icon.svg` — REPLACE: flattened `touchicon_VIOLET.svg` (text→paths, font removed).
- `assets/images/{small,large,xlarge}.png` — CREATE: 250×175 / 500×350 / 1000×700 from Base-Module JPG.
- `drivers/pool/assets/images/{small,large,xlarge}.png` — CREATE: same sizes, same source JPG.
- `drivers/pool/assets/icon.svg` — CREATE: newly designed stylized driver icon (Relay-Extension look, VIOLET wordmark as paths).
- `.homeycompose/discovery/violet.json` — CREATE (contingent on live investigation): mDNS-SD strategy.
- `drivers/pool/driver.compose.json` — MODIFY (contingent): add `"discovery": "violet"` + a discovery pair step.
- `drivers/pool/driver.js` — MODIFY (contingent): `onPairListDevices` returns discovered devices.
- `drivers/pool/device.js` — MODIFY (contingent): `onDiscoveryResult` / `onDiscoveryAvailable` / `onDiscoveryAddressChanged` keep the `host` setting in sync.
- `.homeycompose/app.json` version + `.homeychangelog.json` — MODIFY via `homey app version minor` + programmatic changelog patch.
- `docs/dashboard/dashboard.html` — MODIFY: finalize M4 entry.
- `docs/dashboard/versions.md` — MODIFY at actual upload only (0.4.1), not in this plan.

---

### Task 1: Store metadata (name + description)

**Files:**
- Modify: `.homeycompose/app.json` (`name`, `description`)

**Interfaces:**
- Produces: final `name`/`description` used by validate + store listing.

- [ ] **Step 1: Patch the compose manifest programmatically**

Run this Node one-liner (from repo root) — avoids hand-typing JSON delimiters:

```bash
node -e '
const fs=require("fs"),p=".homeycompose/app.json";
const m=JSON.parse(fs.readFileSync(p,"utf8"));
m.name={en:"Violet and BADU Blue Pool Control",de:"Violet & BADU Blue Poolsteuerung"};
m.description={
  en:"Monitor and control a PoolDigital Violet or BADU Blue pool controller over your local network — pH, ORP, chlorine, temperatures, pump, dosing and more, with an optional live Langelier (LSI) water-balance safety net.",
  de:"Überwacht und steuert einen PoolDigital-Violet- oder BADU-Blue-Poolregler im lokalen Netz — pH, Redox, Chlor, Temperaturen, Pumpe, Dosierung u. v. m., mit optionalem Live-Langelier-Index (LSI) als Wasserbalance-Sicherheitsnetz."
};
fs.writeFileSync(p,JSON.stringify(m,null,2)+"\n");
JSON.parse(fs.readFileSync(p,"utf8"));
console.log("ok",m.name.en,"/",m.name.de);
'
```

Expected: `ok Violet and BADU Blue Pool Control / Violet & BADU Blue Poolsteuerung`

- [ ] **Step 2: Regenerate + validate (debug level, keeps working during M4)**

Run: `npx homey app validate --level=debug`
Expected: `✓ App validated successfully against level 'debug'`. This regenerates the root `app.json`; confirm its `name`/`description` now match the compose source (they are pulled through on build).

- [ ] **Step 3: Confirm version sync**

Run: `node -e "const c=require('./.homeycompose/app.json').version,r=require('./app.json').version;console.log(c,r,c===r?'SYNC':'DIVERGED')"`
Expected: `0.3.1 0.3.1 SYNC` (version untouched here; bumped in Task 7).

- [ ] **Step 4: Commit**

```bash
git add .homeycompose/app.json app.json
git commit -m "feat(M4): store name + description (Violet & BADU Blue)"
```

---

### Task 2: README (en) + README.de (de)

**Files:**
- Modify: `README.txt`
- Create: `README.de.txt`

**Interfaces:**
- Produces: plain-text store long descriptions in two locales.

- [ ] **Step 1: Write `README.txt`** (exact content — plain text, no URLs/markdown/bullets)

```
Violet and BADU Blue Pool Control

Brings your PoolDigital Violet or BADU Blue pool controller into Homey over the
local network. See live water chemistry and temperatures, pump and equipment
state, and dosing status, and control the filter pump, light and PV-surplus mode.
An optional Langelier (LSI) water-balance safety net warns you before the water
turns corrosive or scaling. Readings feed Homey Insights and Flow.
```

- [ ] **Step 2: Write `README.de.txt`** (exact content)

```
Violet & BADU Blue Poolsteuerung

Bindet deinen PoolDigital-Violet- oder BADU-Blue-Poolregler ueber das lokale
Netzwerk in Homey ein. Zeigt Wasserchemie und Temperaturen, Pumpen- und
Anlagenstatus sowie Dosierung in Echtzeit und steuert Filterpumpe, Licht und
PV-Ueberschuss-Modus. Ein optionales Langelier-Index-Sicherheitsnetz (LSI) warnt,
bevor das Wasser korrosiv oder kalkabscheidend wird. Alle Werte fliessen in Homey
Insights und Flow.
```

Note: README is plain text; keep it ASCII-safe (`ue`/`ae` acceptable in a .txt, or real umlauts — but no smart quotes). The store renders it verbatim.

- [ ] **Step 3: Verify no URLs/markdown**

Run: `grep -nE "https?://|\\[.*\\]\\(|^#|\\*\\*" README.txt README.de.txt || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add README.txt README.de.txt
git commit -m "docs(M4): store README (en + de)"
```

---

### Task 3: App icon SVG — flatten text to paths

**Files:**
- Replace: `assets/icon.svg` (from `~/Downloads/touchicon_VIOLET.svg`)
- Scratchpad: `<scratchpad>/flatten-icon.mjs`

**Interfaces:**
- Produces: `assets/icon.svg` — self-contained SVG, no `<text>`/`@font-face`, viewBox `0 0 144 144`, VIOLET wordmark as `<path>`.

Why: the delivered SVG uses `<text>`/`<tspan>` + embedded `@font-face` (Audiowide woff2), zero `<path>`. Homey's icon renderer (librsvg) does not reliably honor embedded fonts → flatten to paths.

- [ ] **Step 1: Install pure-JS font tooling in the scratchpad (NOT the repo)**

```bash
cd <scratchpad> && npm init -y >/dev/null 2>&1 && npm install wawoff2 opentype.js >/dev/null 2>&1 && echo "installed" && node -e "require('wawoff2');require('opentype.js');console.log('load ok')"
```
Expected: `installed` then `load ok`. If install/load fails, STOP and use the Fallback below.

- [ ] **Step 2: Flatten** — write `<scratchpad>/flatten-icon.mjs` that: reads `touchicon_VIOLET.svg`; extracts the base64 woff2 from `@font-face`; `wawoff2.decompress` → TTF buffer; `opentype.parse` it; for each `<text>`/`<tspan>` (its `x`,`y`,`font-size`,`fill`), `font.getPath(text, x, y, fontSize).toPathData()` and emit `<path d="..." fill="..."/>`; delete the `<style>`/`@font-face` and `<text>` nodes; keep the existing `<rect>`s; write `assets/icon.svg`. Then:

Run: `node <scratchpad>/flatten-icon.mjs`
Expected: prints the glyph count converted and `wrote assets/icon.svg`.

- [ ] **Step 3: Verify no font/text remain**

Run: `grep -cE "<text|@font-face|font-family" assets/icon.svg; grep -c "<path" assets/icon.svg`
Expected: first `0`, second `>= 1`. Also confirm `viewBox="0 0 144 144"` is present.

- [ ] **Step 4: Visual sanity check**

Send the file to yourself with the SendUserFile tool (`display:"render"`) OR open it; confirm the "VIOLET" wordmark and mark look correct and are visible on a `#6A4C93` background (temporarily wrap in a violet `<rect>` in a scratchpad copy to eyeball contrast — do not commit that copy).

- [ ] **Step 5: Commit**

```bash
git add assets/icon.svg
git commit -m "feat(M4): app icon (VIOLET) flattened to vector paths"
```

**Fallback (only if Step 1 fails):** hand-author `assets/icon.svg` reusing the vector "VIOLET" wordmark paths you build for the driver icon in Task 5, on a transparent 144×144 canvas with the same rounded-rect/accent motif. Document the substitution in the commit message. Get the user's OK on the look (same gate as Task 5).

---

### Task 4: App + driver product images (PNG)

**Files:**
- Create: `assets/images/{small,large,xlarge}.png`
- Create: `drivers/pool/assets/images/{small,large,xlarge}.png`
- Scratchpad: `<scratchpad>/make-images.mjs`

**Interfaces:**
- Produces: six PNGs at exact sizes (250×175, 500×350, 1000×700), both locations from the same Base-Module JPG.

- [ ] **Step 1: Install jimp (pure-JS, no native build) in the scratchpad**

```bash
cd <scratchpad> && npm install jimp >/dev/null 2>&1 && node -e "require('jimp');console.log('jimp ok')"
```
Expected: `jimp ok`.

- [ ] **Step 2: Write `<scratchpad>/make-images.mjs`** — for each size `[[250,175],[500,350],[1000,700]]`: read `VIOLET_Base-Module_Poolsteuerung_800x800.jpg`; create a white `WxH` canvas; `contain` the photo into it (preserves aspect, white letterbox — the module is wide so vertical white trims naturally); write PNG to both `assets/images/<name>.png` and `drivers/pool/assets/images/<name>.png` where name = small/large/xlarge.

```js
import {Jimp} from 'jimp';
const SRC='C:/Users/TorstenSturm/Downloads/VIOLET_Base-Module_Poolsteuerung_800x800.jpg';
const OUT=[['small',250,175],['large',500,350],['xlarge',1000,700]];
const dests=['assets/images','drivers/pool/assets/images'];
const REPO='C:/Users/TorstenSturm/source/repos/VioletApp';
for (const [name,w,h] of OUT){
  const img=await Jimp.read(SRC);
  const canvas=new Jimp({width:w,height:h,color:0xffffffff});
  img.contain({w,h});
  canvas.composite(img,(w-img.bitmap.width)/2,(h-img.bitmap.height)/2);
  for (const d of dests) await canvas.write(`${REPO}/${d}/${name}.png`);
  console.log('wrote',name,w+'x'+h);
}
```

Run: `mkdir -p assets/images drivers/pool/assets/images && node <scratchpad>/make-images.mjs`
Expected: three `wrote …` lines.

- [ ] **Step 3: Verify exact dimensions** (pure Node PNG IHDR read — no tool needed)

```bash
node -e '
const fs=require("fs");
for (const f of ["assets/images/small.png","assets/images/large.png","assets/images/xlarge.png","drivers/pool/assets/images/small.png","drivers/pool/assets/images/large.png","drivers/pool/assets/images/xlarge.png"]){
  const b=fs.readFileSync(f);const w=b.readUInt32BE(16),h=b.readUInt32BE(20);console.log(f,w+"x"+h);
}'
```
Expected: small `250x175`, large `500x350`, xlarge `1000x700` in both locations.

- [ ] **Step 4: Commit**

```bash
git add assets/images drivers/pool/assets/images
git commit -m "feat(M4): app + driver product images (Base Module, 3 sizes)"
```

---

### Task 5: Driver icon SVG — new stylized design (user approval gate)

**Files:**
- Create: `drivers/pool/assets/icon.svg`

**Interfaces:**
- Produces: `drivers/pool/assets/icon.svg` — simple, square, no fonts, visible on `#6A4C93`.

Design brief (from spec §3): stylized from the Relay-Extension look — black rounded module body, a violet accent line, a hint of green terminal blocks / an LED row, and the **VIOLET wordmark as vector paths** (no `<text>`/fonts). Recognizable at small sizes.

- [ ] **Step 1: Author a first draft** `drivers/pool/assets/icon.svg` (square viewBox, e.g. `0 0 512 512`; all shapes as `<rect>`/`<path>`; wordmark as `<path>`). No `<text>`, no `@font-face`.

- [ ] **Step 2: Verify it is font-free and valid**

Run: `grep -cE "<text|@font-face|font-family" drivers/pool/assets/icon.svg`
Expected: `0`. Confirm it parses (open / SendUserFile render).

- [ ] **Step 3: Show the user for approval**

Use SendUserFile (`display:"render"`) to show the icon on a violet backdrop; ask the user to approve or request changes. **Do not proceed to commit until approved.** Iterate on Steps 1–3 as needed.

- [ ] **Step 4: Commit** (after approval)

```bash
git add drivers/pool/assets/icon.svg
git commit -m "feat(M4): driver icon (stylized VIOLET module)"
```

- [ ] **Step 5: Intermediate publish-gate check**

Run: `npx homey app validate --level=publish`
Expected: the `drivers.pool: property images is required` error is GONE. If any icon/image error remains, fix it here before moving on.

---

### Task 6: mDNS discovery (live investigation → additive implementation OR documented fallback)

**Files (contingent on investigation):**
- Create: `.homeycompose/discovery/violet.json`
- Modify: `drivers/pool/driver.compose.json`, `drivers/pool/driver.js`, `drivers/pool/device.js`
- Scratchpad: `<scratchpad>/mdns-browse.mjs`

**Interfaces:**
- Consumes: `getSetting('host')` (existing manual-host model; polling/write read it).
- Produces: automatic device discovery on the LAN, with manual host entry retained as a pair step. Existing installed device (random-UUID `data.id`) keeps working via its stored host.

- [ ] **Step 1: Live investigation — what does the Violet advertise?** Install a pure-JS mDNS browser in the scratchpad and browse for a few seconds on the LAN where the real Violet (`violet`) lives:

```bash
cd <scratchpad> && npm install bonjour-service >/dev/null 2>&1 && cat > mdns-browse.mjs <<'EOF'
import {Bonjour} from 'bonjour-service';
const b=new Bonjour();
const seen=new Map();
for (const t of ['http','https','poollab','violet','workstation']) {
  b.find({type:t},s=>{const k=s.fqdn;if(!seen.has(k)){seen.set(k,1);
    console.log(JSON.stringify({type:t,name:s.name,host:s.host,port:s.port,addresses:s.addresses,txt:s.txt},null,0));}});
}
setTimeout(()=>{console.log('--- done, services:',seen.size);process.exit(0);},8000);
EOF
node mdns-browse.mjs
```
Record: which service `type` the Violet responds on, its `host`/`addresses`, and whether `txt` contains a **stable unique id** (serial/MAC). Also try `dns-sd`-style enumeration by adding more `type` guesses if nothing shows. If the machine running Claude is not on the Violet's LAN/subnet, run the equivalent browse where the Violet is reachable (the user's Homey network) and paste the output.

- [ ] **Step 2: Decision.**
  - **If a discoverable service + stable id field exist → go to Step 3 (implement).**
  - **If NOT (only `.local` hostname A-record, no SD service, or no stable id) → go to Step 8 (documented fallback).** Athom accepts manual entry when discovery is genuinely impossible; M4 stays publish-valid.

- [ ] **Step 3: Create the discovery strategy** `.homeycompose/discovery/violet.json`. Fill `<SERVICE>` and the `id` template `<IDFIELD>` from Step 1's output:

```json
{
  "type": "mdns-sd",
  "mdns-sd": { "name": "<SERVICE>", "protocol": "tcp" },
  "id": "{{txt.<IDFIELD>}}"
}
```
If there is no usable TXT id but there IS a stable hostname, use `"id": "{{host}}"` instead. Record the choice in a decision comment in the driver compose (JSON has no comments → note it in the commit message + plan).

- [ ] **Step 4: Wire the driver** — in `drivers/pool/driver.compose.json` add `"discovery": "violet"` at top level and prepend a discovery pair step so both discovery and manual entry are offered:

```json
"pair": [
  { "id": "connect" },
  { "id": "list_devices", "template": "list_devices", "navigation": { "next": "add_devices" } },
  { "id": "add_devices", "template": "add_devices" }
]
```
Keep `connect` (manual host) as the fallback route; `list_devices` will show discovery results (next step).

- [ ] **Step 5: `driver.js` — return discovered devices.** Add `onPairListDevices` that reads the discovery strategy and maps results to devices whose `settings.host` is the discovered address and whose `data.id` is the discovery id (documenting-code header/decision comment referencing spec §4):

```js
async onPairListDevices() {
  const results = this.getDiscoveryStrategy().getDiscoveryResults();
  return Object.values(results).map(r => ({
    name: r.txt?.name || `Violet (${r.address})`,
    data: { id: r.id },
    settings: { host: r.address },
  }));
}
```
(If the app currently pairs purely via manual `connect.html` returning a device object, keep that path intact — this method only adds the discovery list.)

- [ ] **Step 6: `device.js` — discovery availability handlers.** Add the three handlers; they keep the existing `host` setting in sync so polling/write are unchanged (decision comment: spec §4, manual host stays the source of truth for existing devices):

```js
onDiscoveryResult(discoveryResult) {
  return discoveryResult.id === this.getData().id;
}
async onDiscoveryAvailable(discoveryResult) {
  if (discoveryResult.address && discoveryResult.address !== this.getSetting('host')) {
    await this.setSettings({ host: discoveryResult.address }).catch(this.error);
  }
  await this.setAvailable().catch(this.error);
}
async onDiscoveryAddressChanged(discoveryResult) {
  await this.setSettings({ host: discoveryResult.address }).catch(this.error);
}
```

- [ ] **Step 7: Validate + tests + (deferred) live pair.**

Run: `npx homey app validate --level=debug && node --test`
Expected: validate PASS, 76 tests PASS. Live pairing verification against the real Violet is deferred like the M3 write-verify (note it as an open live-test); the existing installed device is unaffected (its UUID id keeps its stored host). Then commit:

```bash
git add .homeycompose/discovery/violet.json drivers/pool/driver.compose.json drivers/pool/driver.js drivers/pool/device.js
git commit -m "feat(M4): mDNS discovery with manual host fallback"
```
Then SKIP Step 8.

- [ ] **Step 8: Documented fallback (only if Step 2 chose NO).** Do not add discovery code. Append a short subsection to the spec (`## Discovery outcome`) stating what the live browse found and why manual entry remains (with the raw `mdns-browse.mjs` output). This is the justification Athom expects. Commit:

```bash
git add docs/superpowers/specs/2026-07-07-m4-publish-readiness-design.md
git commit -m "docs(M4): mDNS not discoverable — manual entry justified (Athom)"
```

---

### Task 7: Version bump 0.4.0 + changelog

**Files:**
- Modify: `.homeycompose/app.json` (version, via CLI), `app.json` (regenerated), `.homeychangelog.json`

**Interfaces:**
- Produces: version `0.4.0` + en/de changelog entry describing M4.

- [ ] **Step 1: Bump (new milestone → minor)**

Run: `npx homey app version minor`
Expected: version `0.3.1 → 0.4.0`; updates `.homeycompose/app.json`.

- [ ] **Step 2: Patch `.homeychangelog.json` programmatically** (choose wording to match the Task 6 outcome — the `discovery` clause below assumes Step 7 path; if the fallback path was taken, drop the discovery clause):

```bash
node -e '
const fs=require("fs"),p=".homeychangelog.json";
const c=JSON.parse(fs.readFileSync(p,"utf8"));
c["0.4.0"]={
  en:"Store release preparation: the app now also covers the BADU Blue controller (identical hardware to Violet), finds the device automatically on your network (manual host entry stays available as a fallback), and adds the final app name, icon and product images.",
  de:"Store-Vorbereitung: Die App deckt jetzt auch den BADU-Blue-Regler ab (baugleich mit der Violet), findet das Gerät automatisch im Netzwerk (manuelle Host-Eingabe bleibt als Alternative) und bringt den finalen App-Namen, das Icon und die Produktbilder mit."
};
fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");
JSON.parse(fs.readFileSync(p,"utf8"));
console.log("changelog 0.4.0 ok");
'
```
Expected: `changelog 0.4.0 ok`. (German inner quotes, if any needed, as `„…"`; none here.)

- [ ] **Step 3: Regenerate + verify sync + JSON valid**

Run: `npx homey app validate --level=debug && node -e "const c=require('./.homeycompose/app.json').version,r=require('./app.json').version;console.log(c,r,c===r?'SYNC':'DIVERGED')"`
Expected: validate PASS; `0.4.0 0.4.0 SYNC`.

- [ ] **Step 4: Commit**

```bash
git add .homeycompose/app.json app.json .homeychangelog.json
git commit -m "chore(M4): bump 0.4.0 + changelog (en+de)"
```

---

### Task 8: Final publish gate + security review + dashboard finalize

**Files:**
- Modify: `docs/dashboard/dashboard.html` (M4 entry)

- [ ] **Step 1: Final publish validation (the M4 gate)**

Run: `npx homey app validate --level=publish`
Expected: `✓ App validated successfully against level 'publish'`. If it fails, fix the reported item and re-run before continuing.

- [ ] **Step 2: Release-readiness pre-check**

Dispatch the `release-readiness` agent (read-only) to confirm: version sync, changelog 0.4.0 present (en+de), all app + driver images present at correct sizes, store metadata fields filled, and `validate --level=publish` PASS. Address anything it flags.

- [ ] **Step 3: Security review of the M4 diff**

Run `/security-review` on the branch diff against `main`. Expected: no Critical Issues (M4 adds only a passive mDNS read surface + metadata/assets; credentials untouched). Record the result.

- [ ] **Step 4: Finalize the dashboard M4 entry** — in `docs/dashboard/dashboard.html` `DASHBOARD_STATUS`: set M4 `status:"done"`, `finishedAt:"<today>"`, `commit:"<short-sha>"`, all `steps[].done=true`, `currentActivity:null`, append a closing `log` entry, bump top-level `updatedAt`. Edit only the M4 object + `updatedAt`.

- [ ] **Step 5: Commit**

```bash
git add docs/dashboard/dashboard.html
git commit -m "docs(M4): dashboard M4 → done"
```

- [ ] **Step 6: Pre-publish operational reminders (NOT done here — surface to the user)** Before the real Store upload (which becomes 0.4.1): (a) **rotate the Violet write-password** on the controller + re-enter it in the device settings; (b) **live-verify mDNS pairing** against the real Violet (or confirm the documented fallback); then `homey app publish` → Test release first (crash-report hunt), then Live/certification. Append the `versions.md` line only at that actual upload.

---

## Verification (success criteria — from spec §Verifikation)

1. `npx homey app validate --level=publish` → PASS (no `images` error).
2. `node --test` green (76 tests; +any discovery unit tests).
3. `.homeycompose/app.json` ↔ `app.json` version-synced; `.homeychangelog.json` valid JSON with 0.4.0 (en+de).
4. All required assets present at exact sizes (validator + release-readiness).
5. mDNS discovery implemented + live-verified OR documented fallback justification recorded.
6. `/security-review` on the M4 diff: no Critical Issues.
7. Dashboard M4 finalized (done, commit, all steps).

## Out of scope (YAGNI)

Inbound alarms (M5); the actual `homey app publish` / store go-live (after rotation + mDNS live-verify); any BADU-Blue device code (identical hardware/API).
