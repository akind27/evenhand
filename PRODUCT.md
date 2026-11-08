# Product

<!-- impeccable:product-schema 1 -->

> Written 2026-11-08 by Claude under Akind's explicit delegation ("you know better… I trust you, do it as you know"). Facts marked *(inferred)* are Claude's calls from the agreed brief, not Akind's words.

## Platform

web

## Stack

Delegated: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4, deployed on Vercel. Chosen because the judges must be able to open a hosted demo on any phone or laptop, and one codebase serves the pages and the API.

## Users

- **Rental shops at the counter** — island scooter, e-bike, quad and kayak rentals (Greece first; the same pattern exists in Thailand, Bali and southern Europe). Today they keep the renter's passport or cash as the deposit. They use the app on a phone or tablet at a busy counter, often outdoors in strong sun, with a queue waiting. Job: hand over a vehicle fast, and on return settle any damage without an argument.
- **Renters** — tourists on their own phone, in their own language, often slightly wary of the shop. Job: keep their passport, see exactly what condition they received, and get the deposit back without being charged for damage they did not cause.
- **Later audiences (shown as "next", not built):** libraries of things, schools lending instruments or laptops, camera and lens rental shops, Airbnb hosts lending bikes, neighbours lending tools.
- **Hackathon judges** — PayPal AI Hackathon 2026; they try the hosted demo for a few minutes, often on a laptop, playing both roles.

## Product Purpose

Evenhand replaces the passport (or cash) left on the counter with a PayPal hold, and acts as a neutral witness for the condition of the item. Success, in Akind's words: both sides are satisfied — either that there was no damage, or that any damage is proven with the app.

## Positioning

A deposit and a shared, sealed condition record in one flow: AI checks every photo, records existing marks at pickup, and at return lists only new damage matched to the shop's own price list; the PayPal hold is voided on a clean return or partly captured only after the shop proposes and the renter accepts. Neighbours each do one piece (AI damage detection for cars and property, card holds on rental marketplaces, inventory apps for libraries); none found combines them for small items on PayPal.

## Operating Context

- Pickup and return happen face to face at a counter; the renter joins by scanning a QR code on the shop's screen.
- Photos are taken live with the phone camera (sample photos only in labelled demo mode).
- PayPal sandbox only (authorize, void, partial capture, reauthorize). Honor period 3 days, authorization valid 29 days.
- AI: Claude (`claude-opus-5-5`) via the Anthropic API.
- Demo mode works without keys (fake PayPal, recorded AI answers), clearly badged.

## Capabilities and Constraints

- Shop: guided photos (front, back, left, right + up to 4 close-ups), AI photo check, AI condition record, deposit from the shop's own rules, QR share, guided return photos, AI comparison, confirm/dismiss findings, propose a charge (freezes it), release, holds dashboard.
- Renter: condition record, rules and price list in their language (en, el, de, it, fr), PayPal hold, live status, accept or dispute the proposed charge, sealed record link.
- The AI never moves money; a person confirms every charge; low-confidence findings say "needs a human look".
- No identity documents, faces or passports are ever photographed or stored.
- Money in euro cents; currency EUR.
- Every AI result is labelled ("AI-assisted — a person decides any charge"); renter explanations are labelled "AI-written explanation" (EU AI Act Article 50).

## Brand Commitments

- Name: **Evenhand** *(inferred — chosen by Claude: "even-handed", fair to both sides; trademark not yet checked)*.
- Voice: plain, calm, neutral; never accusing the renter; short sentences; explains, does not lecture *(inferred from Akind's plain-language rule and the neutrality goal)*.
- Greek setting is the story's home, but **never use a meander / Greek-key pattern or any similar repeating angular border** (Akind's standing rule). Greek flavour may come only from laurel/olive, plain lines, waves, light, whitewash and sea — and only if the visual world calls for it.
- All imagery comes from Akind's Magnific account; AI-generated or AI-edited images are labelled.
- No third-party trademarks (no PayPal logo misuse beyond its official buttons; no scooter brand names).

## Evidence on Hand

- Demo photos of one white scooter in three sets: `public/demo/scooter-a/{pickup,return-clean,return-damaged}/{front,back,left,right}.jpg` (Magnific, AI-generated and AI-edited — the damaged set has a scratch on the left rear panel and a missing right mirror).
- Background facts with sources (see the design spec): UK government advice not to hand over a passport as a deposit in Greece; rental listings accepting "cash, card or passport"; documented Thai scooter-rental scams around passports and pre-existing damage.
- No customers, testimonials, pilots, pricing or partner shops exist. None may be invented.

## Product Principles

1. **Neutral first.** Both sides always see the same evidence at the same time; the design must never feel like the shop's weapon.
2. **The person decides, the AI assists.** Every AI output shows its confidence and its label; money moves only after a human tap.
3. **Fast at the counter.** One thumb, bright sun, a queue waiting: the pickup must take about a minute.
4. **Proof over promises.** Fingerprinted photos and a sealed timeline are shown, not just claimed.
5. **Calm money.** "Your money stays in your account" is the first thing a renter understands.

## Accessibility & Inclusion

WCAG 2.2 AA *(inferred)*: high contrast for outdoor use, 44 px touch targets, text that survives 200% zoom, no information by colour alone (damage status always has text), full keyboard use on desktop, five renter languages.
