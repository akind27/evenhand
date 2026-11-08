# Evenhand — visual direction (binding for every screen)

Decided 2026-11-08 by Claude under Akind's delegation, through Impeccable's direction roll (seed key `39dd3aea`, mode operate, assigned candidate 4 of 7: passport security printing). Challenger considered: boarding pass + gate board (strong for the dashboard, weaker product truth). Akind did not see a decision page — he asked Claude to decide.

## The idea in one line

Evenhand replaces the passport on the counter, so the handover record looks and behaves like a security document: as trustworthy as the passport the renter keeps.

## Direction contract (copy verbatim as the first child of `<body>` in `src/app/layout.tsx`, as an HTML comment that survives the production build)

```
THESIS: The handover record is a security document both sides hold; we refuse the fintech-card dashboard and the blue-dome holiday cliché.
OWN-WORLD: Cool security-paper ground, deep intaglio-blue ink, fine sea-green and violet guilloche rosettes behind records, visa-stamp status marks in violet, green, vermilion and ochre, a machine-readable strip of real fingerprints.
STORY: The shop photographs, the renter checks the same record on their own phone, PayPal stamps the hold; at return a stamp settles it, and both trust why.
FIRST VIEWPORT: Shop: the active handover as a document page, item and deposit large, one thumb-sized primary action at the bottom. Renter: the record page with the deposit line and the hold stamp.
FORM: passport security printing, candidate 4 of 7, seed key 39dd3aea.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
```

## Scene that decides light or dark

A rental counter on an island at noon: glare on whitewash, a phone held one-handed, a queue waiting. → **Light ground, dark ink, very high contrast.** No dark mode in the hackathon build.

## Palette (tokens in `src/app/globals.css` as CSS custom properties, used through Tailwind 4 `@theme`)

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F2F6F4` | page ground (cool security paper, not cream) |
| `--paper-panel` | `#E5EEEA` | document panels |
| `--ink` | `#14233B` | text, primary buttons (filled), icons |
| `--ink-soft` | `#3B4A61` | secondary text (must stay ≥ 7:1 on `--paper`; verify) |
| `--rule` | `#9DB2AC` | hairlines, field dividers |
| `--guilloche-green` | `#2C8A7C` | guilloche lines (used at low opacity) |
| `--guilloche-violet` | `#6E52A0` | guilloche lines, focus ring |
| `--stamp-hold` | `#5A3D94` | "HELD" stamp (violet ink) |
| `--stamp-released` | `#1D734A` | "RELEASED", "NO NEW DAMAGE" |
| `--stamp-charged` | `#B83A26` | "CHARGED €X", new damage boxes |
| `--stamp-review` | `#9A6512` | "NEEDS A HUMAN LOOK", "DISPUTED", "DEMO MODE" |

Strategy: **restrained** (neutrals + ink); colour appears only as stamp ink and guilloche, never as decorative fills. Status is never colour alone — every stamp has words.

## Type

- **Atkinson Hyperlegible Next** (400, 600, 700) — all UI text. Reason: designed for maximum legibility, which the sun-glare counter needs.
- **Martian Mono** (400, 500) — machine data only: amounts in records, fingerprints (SHA-256), ids, timestamps, the machine-readable strip.
- Load both with `next/font/google` (self-hosted at build, no runtime requests to Google).
- Field labels are small caps, letter-spaced, **bilingual like a passport**: English plus the renter's language on renter screens (e.g. `DEPOSIT / ΕΓΓΥΗΣΗ`), English plus Greek on shop screens. Values are large below them.
- Tabular figures for every number.

## Signature elements

1. **Guilloche rosette** — an SVG generated in code (`src/components/doc/Guilloche.tsx`): overlapping hypotrochoid/epitrochoid curves in `--guilloche-green` and `--guilloche-violet` at 12–20% opacity, deterministic from a seed (the handover id), placed behind the document header of records, the QR share card and the landing hero. Curves only. **Never a meander, Greek key or any repeating angular border** (Akind's standing rule).
2. **Visa stamps** — `src/components/doc/Stamp.tsx`: a rectangular or round outline stamp, 2 px ink border, uppercase label, date and time in Martian Mono, slightly rotated (−4° to 4°, deterministic from the label), ink texture by a subtle SVG noise mask. States: HELD (violet), RELEASED (green), CHARGED €X (vermilion), DISPUTED and NEEDS A HUMAN LOOK (ochre), DEMO MODE (ochre, round).
3. **Machine-readable strip** — `src/components/doc/MachineStrip.tsx`: two Martian Mono lines at the foot of every record, like a passport MRZ, built only from real data: `EH<<HANDOVER<<<{id}<<<{itemRef}<<<<<<` and `{depositCents}EUR<{status}<{first 16 hex of the last event hash}<<<`. Uppercase, `<` fillers, never invented values.
4. **Photo windows** — photos sit in frames with corner ticks like the passport photo window; marks and findings are numbered circles and boxes drawn over the photo (existing marks in `--ink`, new damage in `--stamp-charged`).
5. **Stamp landing** — the one orchestrated motion: when a hold is authorized, released or charged, the stamp drops onto the record (scale 1.15 → 1, opacity 0 → 1, 180 ms, ease-out, a 1 px "press" shadow). `prefers-reduced-motion`: appears without motion.

## Layout rules (Operate)

- Mobile first (375 px). Single column; the primary action pinned to the bottom within thumb reach, full width, 56 px tall, filled `--ink` with `--paper` text. Secondary actions are outlined ink buttons. Minimum touch target 44 px.
- A screen is a **document page**: header (item, ref, status stamp), fields (label above value), photos, then actions. Generous space above section labels, tight below.
- Capture flow: the requested angle shown as a large silhouette label ("LEFT SIDE"), the camera button dominant, progress as four boxes `FRONT · BACK · LEFT · RIGHT` that fill with the photo thumbnail.
- AI labels are quiet, factual lines with a small "AI" mark, never sparkle icons or gradients.
- Desktop (judges on laptops): the shop and renter views sit side by side on wide screens when "Open renter view" is used; documents max 560 px wide, centred on the paper ground.
- The holds dashboard (AG Grid) uses the same palette and Martian Mono numerals; no default AG Grid theme colours.

## Copy voice

Plain, calm, neutral, short sentences; never accusing ("New mark found on the left side panel", never "You damaged"). The money line for renters comes first: "Your money stays in your account. PayPal only reserves it."

## Banned (this project)

Meander/Greek key or any angular repeating border; blue domes, flags, sunsets or other holiday clichés; gradient text; glassmorphism; neon on dark; sparkle "AI" icons; stock photos of smiling tourists; the PayPal logo outside PayPal's own buttons; cream/parchment grounds.

## Landing page (Persuade surface, same world)

Structure from Impeccable's surface roll (seed `6c51d97b`, persuade, assigned candidate 3 of 6: **the before/after comparison as the hero**). The first viewport proves the mechanism instead of describing it.

1. **First viewport.** Left (or top on mobile): eyebrow `DEPOSIT / ΕΓΓΥΗΣΗ — WITHOUT THE PASSPORT`, headline **"Keep your passport. Keep the peace."**, one line: "A PayPal hold instead of a passport on the counter, and a sealed photo record both sides trust. AI compares the photos; a person decides any charge." Primary button **Try the demo** (filled ink), secondary link **How it works**. Guilloche behind the text. Right (or below): the **comparison** — the demo scooter's left side, pickup photo and damaged-return photo stacked, with an accessible draggable divider (`<input type="range">` labelled "Compare pickup and return"). On the return side a vermilion box marks the scratch (relative box about `{ x: 0.60, y: 0.56, w: 0.24, h: 0.09 }` — adjust by eye on `public/demo/scooter-a/return-damaged/left.jpg`), with a caption "New since pickup: scratch on the rear side panel · Price list: Scratch on a body panel €20.00", the AI label, and "AI-generated demo photo". A CHARGED €20.00 stamp lands when the divider first reveals the box (reduced motion: shown at once).
2. **The passport on the counter.** Three short, sourced facts (link each source with `rel="noopener noreferrer"`): UK government advice for Greece: do not hand over your passport as a deposit; rental listings that accept "cash, card or passport"; travel guides on scooter rentals that keep a passport and then charge for old damage. No invented statistics.
3. **How it works.** Four document fields with stamps: Photograph (AI checks each photo) → Hold (PayPal reserves the deposit, no money moves) → Return (AI lists only new marks, matched to the shop's own price list) → Settle (clean: released at once; damage: the shop proposes, the renter accepts or disagrees).
4. **Both sides.** Two columns: For renters (keep your passport; same photos as the shop; nothing charged without your tap; your language) / For shops (no more arguments; a hold PayPal stands behind; proof for real damage; a minute at the counter).
5. **The sealed record.** A sample record strip: RECORD INTACT stamp, three timeline lines, a fingerprint, the machine strip — with "Every photo is fingerprinted and every step is sealed to the one before."
6. **Beyond scooters (next).** Libraries of things, schools lending instruments and laptops, camera and lens rentals, hosts lending bikes, neighbours lending tools — plainly marked as next steps, not current customers.
7. **Footer.** AI disclosure (Article 50), "PayPal sandbox only — no real money moves in this demo", demo-photo label, MIT licence, source code link placeholder `#source` (Akind adds the GitHub URL when the repo is public).

## Imagery

Only the Magnific demo photos (labelled "AI-generated demo photo" wherever shown). No other imagery is required for the app screens.
