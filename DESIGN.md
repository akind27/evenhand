---
name: Evenhand
description: A deposit without a passport, recorded as a security document both sides hold.
colors:
  paper: "#F2F6F4"
  paper-panel: "#E5EEEA"
  ink: "#14233B"
  ink-hover: "#22365A"
  ink-soft: "#3B4A61"
  rule: "#9DB2AC"
  guilloche-green: "#2C8A7C"
  guilloche-violet: "#6E52A0"
  stamp-hold: "#5A3D94"
  stamp-released: "#1D734A"
  stamp-charged: "#B83A26"
  stamp-review: "#9A6512"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "normal"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "Atkinson Hyperlegible Next, Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontFeature: "tnum"
  label:
    fontFamily: "Atkinson Hyperlegible Next, Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.12em"
  stamp:
    fontFamily: "Atkinson Hyperlegible Next, Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.1em"
  machine:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
    fontFeature: "tnum"
rounded:
  control: "2px"
  round: "9999px"
spacing:
  gutter: "16px"
  action-bar-pad: "12px"
  touch-min: "44px"
  primary-height: "56px"
  document-width: "560px"
  section-gap: "36px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-hover:
    backgroundColor: "{colors.paper-panel}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "56px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.paper-panel}"
    textColor: "{colors.ink-soft}"
  button-danger:
    textColor: "{colors.stamp-charged}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  action-bar:
    backgroundColor: "{colors.paper}"
    padding: "12px 16px"
  stamp:
    textColor: "{colors.stamp-hold}"
    typography: "{typography.stamp}"
    padding: "6px 12px"
  stamp-round:
    rounded: "{rounded.round}"
    size: "88px"
  doc-header:
    backgroundColor: "{colors.paper-panel}"
    padding: "20px 16px 16px"
  machine-strip:
    textColor: "{colors.ink-soft}"
    typography: "{typography.machine}"
---

# Design System: Evenhand

## Overview

**Creative North Star: "The Passport Page"**

Evenhand replaces the passport on the rental counter, so every handover record looks and behaves like a security document that both sides hold. The ground is cool security paper. The ink is a deep intaglio blue. Colour appears only as stamp ink and as fine guilloche curves behind the record header. A renter reads the same page the shop reads, and that is the point: neither side owns the evidence.

The scene that decides the look is a rental counter on an island at noon: glare on whitewash, one thumb on a phone, a queue waiting. So the system is light, high contrast and plain. There is no dark mode. Colour strategy is restrained: neutrals and ink, with stamp colours used as marks, never as fills. Status is never colour alone. Every stamp carries words.

The system refuses two things on purpose. It is not a fintech card dashboard (no soft gradient cards, no glass, no neon). It is not a holiday brochure (no blue domes, flags, sunsets). Greek flavour, where it appears, comes from the bilingual labels and the island setting, never from ornament.

**Key Characteristics:**
- A screen is a document page, at most 560 px wide, centred on cool paper.
- One primary action, pinned at the bottom, per state.
- Labels are small caps and bilingual, like a passport.
- Machine data (amounts, ids, fingerprints, times) is set in a monospace face; everything else is a hyperlegible sans.
- Flat. Depth comes from rules, frames and paper tone, not shadows.
- Honest AI: every AI result is labelled in a quiet line, and a person decides any charge.

## Colors

A cool, near-white green-grey ground, one deep blue ink, and four stamp inks. Nothing else.

### Primary
- **Intaglio Ink** (#14233B): all text, filled primary buttons, borders of controls, icons, corner ticks, existing-mark overlays. The one voice of the system.
- **Intaglio Ink, Pressed** (#22365A): hover state of the filled primary button and of a chosen decision button.

### Secondary
- **Sea-Green Guilloche** (#2C8A7C): guilloche curves only, at 12 to 30 percent opacity.
- **Violet Guilloche** (#6E52A0): guilloche curves and the keyboard focus ring (3 px).

### Tertiary (stamp inks)
- **Hold Violet** (#5A3D94): the HELD stamp, the "Deposit held" chip, active rows in the holds grid.
- **Released Green** (#1D734A): RELEASED and NO NEW DAMAGE stamps.
- **Vermilion** (#B83A26): CHARGED stamps, new-damage boxes on photos, the danger button, urgent time left, error lines.
- **Review Ochre** (#9A6512): DISPUTED, NEEDS A HUMAN LOOK and DEMO MODE stamps.

### Neutral
- **Cool Security Paper** (#F2F6F4): page ground, input fill, action bar fill, label backgrounds over photos. Never cream or parchment.
- **Panel Green-Grey** (#E5EEEA): document header, photo window mat, hover fill, disabled primary.
- **Soft Ink** (#3B4A61): secondary text, input borders, field labels, the machine strip. It stays at 7:1 or better on paper.
- **Fine Rule** (#9DB2AC): hairlines, the border above the action bar, dividers, disabled borders.

### Named Rules
**The Stamp-Ink-Only Rule.** Colour is stamp ink or guilloche. It is never a decorative fill, a gradient, or a background wash. The one rarity that makes a stamp readable is that nothing else on the page is coloured.

**The Words-With-Colour Rule.** A status colour always travels with words ("HELD", "RELEASED", "CHARGED €20.00"). A colour-blind or sun-blinded reader loses nothing.

**The Cool Paper Rule.** The ground is cool and slightly green. No cream, parchment, sepia or warm off-white anywhere.

## Typography

**Display and body font:** Atkinson Hyperlegible Next (weights 400, 600, 700), with Noto Sans as the Greek fallback, then system sans.
**Machine font:** Martian Mono (weights 400, 500), for machine data only.

**Character:** Atkinson was designed for maximum letter distinction, which suits glare and quick glances. Martian Mono sits beside it like the printed serial number on a document. Atkinson has no Greek letters, so the font stack lists Noto Sans second: Latin text stays in Atkinson, Greek falls through to Noto Sans. Both fonts load through `next/font/google`, self-hosted at build, with no runtime request to Google.

### Hierarchy
- **Display** (700, `text-4xl` on phones, 5xl at `sm`, 6xl at `lg`, line-height 1.05, max 16ch, balanced): the landing headline only.
- **Headline** (700, 1.5rem, line-height 1.25, balanced): the document title in the header (the item name).
- **Title** (700, 1.125rem to 1.5rem): money values and section figures. Deposit amounts are large, below their label.
- **Body** (400, 1.0625rem, line-height 1.5, tabular figures on everything): all running text. Keep prose near 65ch.
- **Label** (600, 0.75rem, letter-spacing 0.12em, uppercase, Soft Ink): the passport field label above every value.
- **Stamp** (700, 1rem, letter-spacing 0.1em, uppercase; round stamps 0.8125rem; date line in mono 0.625rem): visa stamps.
- **Machine** (Martian Mono 400 or 500, 0.6875rem to 1.125rem): ids, references, fingerprints, timestamps, amounts in records, the machine strip.

### Named Rules
**The Machine-Data-Only Rule.** Martian Mono is for values a machine would produce: amounts, ids, hashes, times, references. It is not for headings, buttons, prose, or the word "Not set" (that stays sans in Soft Ink).

**The Tabular Rule.** Every number uses tabular figures (set on `body`). The `mono` utility is a Tailwind `@utility`, so a later `font: inherit` on an input cannot override it.

## Layout

Mobile first at 375 px. One column. A screen is a **document page**: header (item, reference, status stamp), then fields (label above value), then photos, then the pinned action bar.

- **Document width.** `.doc-page` is at most 560 px wide, centred on the paper ground, with 16 px side padding and 8 rem bottom padding so content clears the action bar.
- **One primary action per state.** It lives in the bottom action bar: fixed to the bottom, full width of the 560 px column, 56 px tall, filled ink with paper text. The bar has 12 px padding plus the device safe-area inset, a paper fill and a 1 px Fine Rule top border. Secondary actions are outlined ink buttons (44 px) stacked in the same bar, or placed inline above it. Two filled buttons never share a state. While a form (a new handover, a manual finding) is open, the bar holds that form's own submit and a Cancel.
- **Touch.** Every control is at least 44 px tall. The range slider, tap-to-place box and divider handle are 44 px or larger.
- **Rhythm.** Section labels have 2.25 rem space above and 0.5 rem below: generous above, tight below. Hairlines (`rule-top`) separate sections.
- **Capture flow.** The requested angle appears as a large silhouette label ("LEFT SIDE"), the camera button is dominant, and progress is four boxes (FRONT, BACK, LEFT, RIGHT) that fill with thumbnails. After four photos the block collapses to the thumbnails plus a "Retake a side" secondary.
- **Desktop.** The same 560 px document sits centred. The landing page is the only wide layout, with the comparison beside the headline from `lg`. Side-by-side shop and renter views are not built (the security policy blocks framing).
- **Holds dashboard.** A sortable table (AG Grid) with a 2 px ink wrapper, 48 px rows and header, and column minimum widths set so money values fit at 1280 px.

## Elevation & Depth

Flat by default. There are no card shadows. Depth is shown by tonal layering (paper on panel), 2 px ink borders on controls and stamps, hairline rules, and the framed photo window. The only shadows in the system are two functional ones: a 1 px "press" drop shadow under a stamp as it lands (`drop-shadow(0 1px 0 rgb(20 35 59 / 0.25))`), and a 1 px ink halo around the before/after divider line so it reads over any photo. No glass, no blur, no glow.

### Named Rules
**The Flat-Paper Rule.** A surface is flat at rest. If you want something to stand out, give it a rule, a frame, or a stamp, not a shadow.

## Shapes

Square and exact, like printed security paper. Controls, inputs, the grid and photo mats use a 2 px radius (`rounded.control`). Stamps are 2 px bordered rectangles; the round stamp is a true circle (9999 px, equal width and height, 5.5 rem, or 7.5 rem for long words). The only other round shapes are numbered circles on photos (22 px) and the divider handle (44 px).

Borders are 2 px ink on controls and 1 px Fine Rule on hairlines. Photo windows use corner ticks (see Components), not a full rounded frame.

## Components

Official-looking, calm, exact. Every component keeps a 44 px touch floor.

### Buttons
- **Shape:** 2 px radius, 2 px ink border, 44 px minimum height, 1 rem semibold label.
- **Default (secondary):** transparent fill, ink text and border. Hover fills Panel Green-Grey. A button on art (`btn-on-art`) takes a paper fill so the label reads over guilloche or a photo.
- **Primary:** `btn btn-primary`: 56 px tall, full width, ink fill, paper text, 1.125 rem. Hover is Intaglio Ink, Pressed. Disabled turns Panel fill, Fine Rule border, Soft Ink text.
- **Chosen state:** `aria-pressed="true"` fills the button with ink, so a deposit amount or a sample set shows its selection on the button itself. A confirmed finding does not rely on this alone; it also shows words.
- **Danger:** `btn-danger`: vermilion border and text. Used sparingly.
- **Focus:** 3 px violet outline, 2 px offset, on every focusable element.

### Inputs / Fields
- **Style:** 44 px minimum height, 2 px Soft Ink border, 2 px radius, paper fill, inherited font.
- **Focus:** the global violet 3 px ring.
- **Error:** a bordered line in vermilion with `role="alert"` (`ErrorLine`): a 2 px vermilion border, vermilion text, calm wording.

### Field label (bilingual)
Small caps label above a large value. On shop screens: English, then Greek in the same line, for example `DEPOSIT / ΕΓΓΥΗΣΗ`. The Greek part is hidden from screen readers there (it is decoration for the shopkeeper). On renter screens: English, then the renter's language (en, el, de, it, fr) in a span with the right `lang`, read aloud. Greek uppercase is made by `greekUpper`: it removes the tonos (the acute accent) and keeps the dialytika (diaeresis), so ΠΡΟΪΟΝ, never ΠΡΟΪΌΝ. Do not rely on CSS `text-transform: uppercase` for Greek.

### Document header
Panel fill, 2 px ink bottom border, a guilloche rosette seeded from the handover id behind it. Holds the item (headline), reference (mono) and a status stamp slot at the right. The status is shown once: if the header stamp says HELD, the "Deposit held" chip is dropped.

### Guilloche rosette
An SVG generated in code, deterministic from a seed string (FNV hash, mulberry32 random). Each rosette is overlapping hypotrochoid curves (720 points per curve, big radius 100) alternating Sea-Green and Violet. Default four curves at 0.35 stroke and 12 to 20 percent opacity. Landing hero: nine curves, 0.2 stroke, up to 30 percent, fit `meet` so the whole rosette stays inside its box, softened to 50 percent opacity on large screens so it never fights body text. Decorative only (`aria-hidden`). Curves only: no border, no repeating angular motif.

### Visa stamps
A 2 px outlined rectangle (or a circle for DEMO MODE) in a stamp ink, uppercase, bold, letter-spaced, with an optional date and time line in Martian Mono (for example `08 NOV 2026, 12:15 GMT+2`, local time). Kinds: HELD (Hold Violet), RELEASED (Released Green), CHARGED €X (Vermilion), DISPUTED and NEEDS A HUMAN LOOK (Review Ochre), DEMO MODE (Review Ochre, round). Rotation is deterministic from the label, between -4 and +4 degrees. The ink texture is a fractal-noise SVG mask on the border only, so the words keep full contrast. Exposed as `role="img"` with a full aria-label. Long labels wrap only at spaces and hyphens (`DEMO-<wbr>MODUS`); a round stamp never shrinks or turns oval.
- **Stamp landing.** The one orchestrated motion. When a hold is authorized, a release happens, a charge is made, or the hero divider uncovers the box, the stamp drops onto the page: scale 1.15 to 1, opacity 0 to 1, 180 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, ending with the 1 px press shadow. It plays once per first appearance, not on every reopen of a settled record.
- **Reduced motion.** Under `prefers-reduced-motion: reduce` the animation is off and the stamp simply appears.

### Machine-readable strip
Two uppercase Martian Mono lines at the foot of every record, like a passport machine-readable zone, between 1 px Fine Rule lines, in Soft Ink:
`EH<<HANDOVER<<<{id}<<<{itemRef}<<<…` and `{depositCents}EUR<{status}<{first 16 hex of the last event hash}<<<`.
Values come only from the record; odd characters become the `<` filler; lines are padded to at least 44 characters. Font size is the smaller of 0.6875rem and the width that fits a whole line (container query), so the line is never clipped on a phone. Screen readers get one full description, not the filler.

### Photo window
A photo on a Panel mat (6 px padding, 4:3) with four L-shaped corner ticks, 14 px, 2 px ink, like the photo window of a passport. Marks and findings are drawn over the photo: existing marks as numbered ink circles (22 px, paper 80 percent fill) or boxes, new damage as vermilion boxes with the number on a paper tab above the box. Overlays are `aria-hidden`; the facts are in text beside the photo. A box that covers 90 percent or more of the photo is not drawn.

### Before/after divider
`BeforeAfter` is the reusable proof component: a pickup photo and a return photo of the same item in one photo window, with a draggable divider and a real `<input type="range">` laid over the photo (visible label "Compare pickup and return", keyboard arrow keys, readable `aria-valuetext`). The divider is a 2 px paper line with a 1 px ink halo and a 44 px round handle. Side labels (PICKUP, RETURN) hide when the divider comes within 15 percent of their edge. A vermilion box with an optional number marks the new mark on the return side. Under it: the help line, a note "AI-generated demo photo" whenever either photo is a bundled sample, and any children (caption, AI label). It is used full width for the landing hero, each finding card, the renter's return result and the shop's compare-yourself list. The landing hero starts at 50 percent so the box and the CHARGED stamp are in the first view; the stamp shows only while the divider leaves the box uncovered, and its caption starts "Example:".

### Status chip and AI label
- **Status chip:** a 2 px bordered, uppercase, bold, letter-spaced word in the matching stamp ink. Words carry the meaning.
- **AI label:** a quiet line with a small boxed "AI" mark in mono, then the sentence. No sparkles, no gradient.

### Holds grid
AG Grid with `themeQuartz` parameters read from the CSS tokens: paper ground, ink text, Fine Rule borders, Panel header (bold), Panel row hover, violet accent, 2 px ink wrapper, no wrapper radius, 2 px cell radius, 16 px text, 48 px rows. Money, refs and times use the mono cell style. The status cell shows a small 12 px outlined square in the stamp ink plus the status words. Urgent time left turns vermilion and medium weight.

## Do's and Don'ts

### Do:
- **Do** put one filled 56 px primary in the bottom action bar for each state, and make everything else an outlined 44 px button.
- **Do** show the renter's money line first: "Your money stays in your account. PayPal only reserves it." It sits directly under the deposit amount.
- **Do** label every AI result. Use "AI-assisted — a person decides any charge." beside AI output, "AI-written explanation" above the renter's explanation, and "AI-generated demo photo" under any bundled sample.
- **Do** be honest when the AI did not run. Show "The AI check could not run. Any marks below were written down by the shop." (renter) or "The AI comparison could not run. Compare the photos yourself." and give the shop a way to add marks by hand. Never show an empty AI-marked paragraph or "No marks found" for a failed check.
- **Do** say plainly when an answer is a recording: "Recorded AI answer for the sample photos ({model})", in the renter's language.
- **Do** write calm, short, never accusing sentences: "New mark found on the left side panel", never "You damaged".
- **Do** write labels in two languages: English plus Greek on shop screens, English plus the renter's language on renter screens, with the right `lang` attribute. Shop-typed text on a renter page gets `lang="en"`.
- **Do** write Greek uppercase without the tonos and with the diaeresis kept, using `greekUpper`.
- **Do** keep custom component classes in `@layer components`.
- **Do** keep the machine strip from real data only, and keep Martian Mono for machine data only.
- **Do** keep text on paper at WCAG AA or better; Soft Ink must stay at 7:1 on Cool Security Paper.
- **Do** keep every control at least 44 px, keep a 3 px violet focus ring, support keyboard use, and make the stamp landing and any motion disappear under `prefers-reduced-motion`.
- **Do** keep stamps and overlays paired with words; keep decorative SVG `aria-hidden`.

### Don't:
- **Don't** use a meander, a Greek key, or any repeating angular border, anywhere in UI, art, prompt or asset. This is a standing rule. Greek flavour comes from laurel or olive, plain gold lines, waves, columns or marble, if it is wanted at all.
- **Don't** use holiday clichés: blue domes, flags, sunsets, postcard whitewash scenes, stock photos of smiling tourists.
- **Don't** use fintech-card dashboard styling: soft gradient cards, shadowed tiles, glassmorphism, neon on dark.
- **Don't** use gradient text, a decorative gradient fill, or sparkle "AI" icons.
- **Don't** show the PayPal logo anywhere except inside PayPal's own buttons.
- **Don't** use cream, parchment or any warm off-white ground. Don't add a dark mode.
- **Don't** convey status by colour alone, and don't fill large areas with a stamp colour.
- **Don't** put custom component classes outside `@layer components` (see the next paragraph).
- **Don't** put two filled primary buttons in one state, or move the primary away from the bottom bar.
- **Don't** invent numbers, customers, quotes or machine-strip values.
- **Don't** photograph or show passports, faces or identity documents.

### The cascade-layer rule
Tailwind 4 puts its utilities in a cascade layer, and unlayered CSS always beats a layer. Custom component classes (`.doc-page`, `.field-label`, `.section-label`, `.rule-top`, `.btn*`, `.action-bar`, `.input`, `.tick`, `.stamp*`) therefore live in `@layer components { … }`, below the utilities, so a Tailwind utility such as `border-l-2` or `min-h-14` on the same element wins. Outside the layer stay only: `:root` tokens, `html`, `body`, `:focus-visible`, the `stamp-land` keyframes and class, and the reduced-motion block. `mono` is a Tailwind `@utility`, not a plain class. Never reintroduce an unlayered component class; the first review found photo-window ticks that never drew for exactly this reason.

## Copy voice

Plain, calm, neutral, short sentences. It explains and does not lecture. It never accuses the renter. Concrete lines already in the product:
- Money first: "Your money stays in your account. PayPal only reserves it."
- AI label: "AI-assisted — a person decides any charge." On renter screens the same idea is translated ("aiAssisted" in the i18n file), in en, el, de, it and fr.
- "AI-written explanation" above the renter's explanation (EU AI Act Article 50).
- Could-not-run lines: "The AI check could not run. Any marks below were written down by the shop." and "The AI comparison could not run. Compare the photos yourself."
- Recorded-answer note: "Recorded AI answer for the sample photos ({model})".
- Demo: "Demo mode. No real PayPal account or money is used."
- Footer: PayPal sandbox only, AI-generated demo photos, MIT licence.
