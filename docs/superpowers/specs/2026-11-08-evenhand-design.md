# Evenhand — a deposit without the passport

**Date:** 2026-11-08 · **For:** PayPal AI Hackathon 2026 (deadline Thu 12 Nov 2026, 12:00 Pacific = 22:00 Greek time)
**Decided by:** Claude, under Akind's explicit delegation on 2026-11-08 ("you know better… I trust you"). Every choice below is Claude's call unless marked *Akind*.

---

## 1. Why

On Greek islands (and in Thailand, Bali, across southern Europe) scooter, bike and quad rentals often keep the renter's **passport** as the deposit. Listings say "cash, card or passport". The UK government tells travellers not to hand over a passport. In Thailand there is a well-documented pattern: the shop keeps the passport, then on return claims damage that was already there, and the passport comes back only after payment.

The problem hurts both sides:

- **The renter** loses control of an identity document and can be charged for damage they did not cause.
- **The shop** gets real damage that renters deny, with no proof either way.

**Akind's success definition:** *both sides are satisfied — either that there was no damage, or that any damage is proven with the app.*

## 2. What Evenhand is

A neutral witness at the counter.

1. At pickup the shop photographs the item through the app. AI checks each photo is usable and records the existing marks. The renter sees exactly the same record on their own phone, confirms it, and approves a **PayPal hold** for the deposit (money is reserved, not taken).
2. At return the shop photographs the same angles again. AI compares before and after and lists only **new** damage, each with a before/after crop, a plain explanation in the renter's language, and the matching line from the **shop's own price list**.
3. No new damage → the hold is released on the spot. New damage → the renter accepts (PayPal captures only that amount, the rest is released) or disputes (the hold stays, both get a sealed evidence pack, a person decides).

The AI never moves money. Release can be automatic only on a clean result; every charge needs the renter's tap or a human decision.

## 3. Who

- **Primary (the demo story):** island rental shops (scooters, e-bikes, quads, kayaks, SUP boards) and their renters.
- **Same flow, shown in the video as "next":** libraries of things, schools lending instruments and laptops, camera and lens rental shops, Airbnb hosts lending bikes, neighbours lending tools.

## 4. Goals, non-goals, anti-goals

**Goals**
- Replace the passport (and cash) on the counter with a PayPal hold.
- Make the return argument-free: one shared, tamper-evident record both sides trust.
- A complete product experience a judge can try end to end in under 3 minutes, on a phone or a laptop.
- Score on all five judging criteria: real PayPal money flow (authorize / void / partial capture), real AI work (vision checks, comparison, explanation), a coherent design, a clear real-world problem, and a strong demo.

**Non-goals (for the hackathon)**
- Not insurance, not a booking system, not fleet management.
- No identity documents, faces or passports are ever photographed or stored.
- No live money: PayPal sandbox only.

**Anti-goals (failure even if it works)**
- The renter feels the app is a new tool for the shop to squeeze money. It must look and behave neutrally: both sides always see the same evidence, the AI shows its confidence, and prices come only from a list the renter saw before signing.
- The AI invents a price or charges by itself.
- A false "new damage" on a clean return because of light or angle changes.

## 5. The flow

### 5.1 Shop setup (once)
- Shop name, currency (EUR), item types with a default deposit (e.g. 125cc scooter €150, e-bike €100) and a **damage price list** (e.g. mirror €30, scratch on side panel €20, dent €60, broken light €40, missing helmet €45).
- Demo shops come pre-filled; a judge can change anything.

### 5.2 Pickup
1. **Shop:** "New handover" → choose item type and enter the plate or item number.
2. **Guided photos:** front, back, left, right, plus up to 4 close-ups. Live camera only (no gallery upload); on desktop and in demo mode a "use sample photo" button stands in for the camera.
3. **AI photo check** (per photo, seconds): is the whole item in frame, is it sharp, is it the requested angle, is it the same item as the other photos? If not, it asks for a retake in plain words.
4. **AI condition record:** list of existing marks with location and a small crop ("existing scratch, rear left panel"). The shop can add or remove marks.
5. **AI deposit suggestion:** from the shop's own deposit rules plus what the photos show (e.g. "125cc scooter → €150 per your rules"). The shop confirms or edits. The AI only picks a rule; it never invents an amount.
6. **QR code** on screen.
7. **Renter** scans the QR → sees the item, all photos and the existing marks, the deposit, the price list and the rules in their own language → taps "This is the condition I received" → approves the **PayPal hold** (PayPal button, or card in sandbox).
8. Both get the **handover record link** at once (and can save it as a PDF). The record is sealed: every photo has a fingerprint (SHA-256) and every step is an append-only event.

### 5.3 Return
1. **Shop:** opens the active handover → "Return" → guided photos of the same angles (the pickup photo is shown as a faint guide).
2. **AI comparison:** for each angle, before vs after. Output: a list of **new** damage only, each with location, a before/after crop, severity, confidence, and the best-matching price-list line. Lighting, dirt, shadows, reflections, angle differences and marks already recorded at pickup are ignored by instruction and by a second "is this really new?" check.
3. **Result screen, shown on both phones:**
   - **Clean:** "No new damage found" → the shop taps Release (or it releases automatically after the shop confirms the return photos) → PayPal **void** → both see "Deposit released, €0 charged".
   - **New damage:** each item with before/after crops and price. Low-confidence findings are marked "needs a human look" and are **not** included in the total unless the shop confirms them.
4. **Shop proposes:** once every finding is confirmed or dismissed, the shop taps "Send to renter for approval". This freezes the findings and the amount, so nothing can change while the renter decides. (Added 2026-11-08 after the service review.)
5. **Renter decides:** "Accept €20" → PayPal **capture €20 (final)**, rest released. Or "I disagree" → hold stays, both receive the evidence pack, the case is marked for a person (the shop owner or, in the real product, a PayPal dispute with the evidence attached).

### 5.4 Shop dashboard
- Active holds, time left on each PayPal authorization (honor period 3 days, valid 29 days, reauthorize when needed), returns waiting, disputes, totals released vs charged.
- Built with **AG Grid Community** (a data table library; also makes the entry eligible for the AG Grid sponsor prize).

## 6. The AI's jobs and its guardrails

| Job | Input | Output | Guardrail |
|---|---|---|---|
| Photo check | one photo + requested angle | usable yes/no + reason in plain words | Never blocks the flow forever: after 2 retakes the shop can override, and the override is logged |
| Condition record | pickup photos | existing marks with location + crop box | Shop and renter can see and edit before signing |
| Deposit pick | photos + shop deposit rules | which rule applies | Must pick an existing rule; cannot output a free amount |
| Return comparison | before/after pairs + recorded marks + price list | new damage list with confidence + matched price line | Two-pass: find, then verify "new and real"; findings below the confidence bar never enter the total by themselves |
| Explanation | findings | plain explanation in the renter's language | Labelled "AI-written explanation"; numbers come from code, not from the model's text |

- Model: the latest Claude vision model, chosen at build time after checking the current Claude API reference. Structured (JSON) output validated with a schema; anything that fails validation is treated as "needs a human look".
- Every AI result is stored with the model name, time, and the photo fingerprints it saw.

## 7. PayPal integration

- **Orders v2 with `intent: AUTHORIZE`** at pickup: the renter approves; the server authorizes and stores the authorization ID. Money is reserved, not moved.
- **Void** the authorization on a clean return.
- **Capture** with an `amount` and `final_capture: true` for accepted damage. PayPal's docs show an optional `amount` and a `final_capture` flag that allows several captures, which implies partial capture. **Verify in the sandbox on day one** that a capture below the authorized amount works and that the remainder is released.
- **Reauthorize** when a rental runs past the 3-day honor period (authorization valid 29 days).
- Optional if time allows: webhooks for authorization voided / captured, to update the record from PayPal's side.
- Sandbox only. A sandbox buyer login and PayPal's published test card go in the README so judges can approve a hold.

## 8. Trust and evidence

- Live capture only in the real flow; sample photos only in clearly labelled demo mode.
- Every photo gets a SHA-256 fingerprint at upload; the record shows the fingerprints; an event chain (each event includes the previous event's hash) shows any later change.
- Both sides get the same record link immediately at pickup, before the ride starts.
- Price list and rules are part of the signed pickup record, so they cannot change after the fact.
- Retention: photos and records are deleted 30 days after the handover closes (demo data: 7 days).

## 9. Screens

- **Landing** (one page): the problem in one line, "Try the demo" (opens a fresh demo shop), "How it works", AI disclosure.
- **Shop (phone or tablet):** handovers list, new handover (guided capture), QR, return (guided capture), result, settings (deposit rules, price list), dashboard.
- **Renter (phone, via QR):** condition record, rules and price list, PayPal hold, live status, return result, accept / disagree, record link.
- **Record page:** read-only, shareable, printable.
- Language: English first; renter screens also in Greek, German, Italian and French (explanations generated by AI, fixed UI text translated in code).
- Design: Impeccable workflow (init, critique, polish). Mobile-first, large touch targets, works in bright sunlight (high contrast).

## 10. Architecture

- **Next.js (App Router) + TypeScript**, deployed on **Vercel**. One codebase serves pages and API routes.
- Adapters behind interfaces, each with a real and a fake implementation:
  - `PaymentsGateway` → PayPal REST (sandbox) | fake for tests and keyless demo.
  - `VisionAssessor` → Claude API | recorded answers for tests and keyless demo.
  - `EvidenceStore` → Vercel Blob (photos + append-only event files) | local folder for development.
- State changes are events appended to the handover; the current state is computed from the events (easy to audit, easy to test).
- Renter and shop screens refresh by polling every 2 seconds (simple and reliable for the demo).
- Each demo visitor gets an isolated demo shop (random ID in a cookie) so judges never collide.
- Cost guards: per-shop and global daily limits on AI calls; Akind sets a spending cap on the API key.

## 11. Data model (summary)

- `Shop { id, name, currency, depositRules[], priceList[] }`
- `Handover { id, shopId, itemType, itemRef, depositRuleId, depositAmount, priceListSnapshot, renterLanguage, events[] }`
- `Photo { id, handoverId, phase: pickup|return, angle, blobUrl, sha256, takenAt }`
- `Assessment { id, kind: photoCheck|condition|deposit|comparison, model, inputs (photo hashes), output (validated JSON), createdAt }`
- `PaymentRef { orderId, authorizationId, captureId?, status }`
- Events: `created, photoAdded, conditionRecorded, depositSet, renterConfirmed, holdAuthorized, returnStarted, comparisonDone, findingConfirmed, findingDismissed, released(void), charged(capture), disputed, closed`.

## 12. Safety, privacy and the EU AI Act

- **Article 50:** every AI-written text and AI result is labelled; the landing page and renter screens say plainly that AI compares the photos and a person decides any charge.
- **Classification note (2026-11-08):** limited-risk AI system. It assesses damage to objects, not people; it is not creditworthiness, insurance pricing, employment or any other Annex III area. Human oversight: no AI result moves money on its own. Recorded in `docs/AI-ACT-INVENTORY.md` with the date.
- **GDPR:** no identity documents, no faces (the photo check asks for a retake if a person is the main subject), renter name optional, retention limits above.
- **Money:** sandbox only; the code refuses to start with live PayPal credentials unless an explicit flag is set (not set in this project).
- Pre-deploy safety gate before every deploy and again on the live URL.

## 13. Demo and judging access

- Hosted URL on Vercel (after Akind's yes). "Try the demo" creates a fresh demo shop.
- Three sample photo sets (same scooter): pickup, clean return, damaged return (new scratch + broken mirror). Images from Akind's Magnific account (or real photos if Akind can take 8 pictures of any scooter); AI-edited images are labelled as such.
- A judge can play both roles on one laptop ("Open renter view") or use a phone via the QR.
- README: one-command local run, a keyless demo mode (fake PayPal + recorded AI answers, clearly labelled), and full sandbox mode with `.env.example`.
- Licence: MIT (shown in the repo's About section).

## 14. Video (under 3 minutes)

1. 0:00–0:20 The passport on the counter; the return argument.
2. 0:20–0:35 Evenhand in one sentence.
3. 0:35–1:40 Pickup on two phones: guided photos, AI condition record, QR, PayPal hold.
4. 1:40–2:30 Two returns: clean (released instantly) and damaged (before/after, price-list match, renter accepts, partial capture).
5. 2:30–2:50 Dashboard, other uses (libraries, schools, cameras), AI safeguards.
6. 2:50–3:00 Close.
Screen recordings from the real app, own or AI-generated music (no copyrighted music), English narration and captions.

## 15. Testing

- Unit tests for the event logic, money arithmetic (integer cents), price matching, confidence rules, PayPal and AI adapters (with fakes), schema validation.
- Integration tests for the API routes with fake adapters.
- End-to-end browser tests for pickup → clean return, and pickup → damaged return → accept.
- One manual sandbox run per day with real PayPal and Claude.
- Target 80% coverage on the core logic.

## 16. Out of scope (said in the video as "next")

- Real PayPal disputes with the evidence pack attached through the Disputes API.
- Multi-shop accounts, staff roles, offline mode, video walk-around capture.
- Live payments and the marketplace setup that lets many shops receive holds.

## 17. Needs Akind

1. Join the hackathon on Devpost.
2. PayPal developer account → sandbox app (client ID and secret) → put them in `.env.local` himself (from `.env.example`).
3. Claude API key in `.env.local` (a new key with a spending cap is best).
4. Yes before: creating cloud resources on his Vercel account (Blob store), the first deploy, and making the GitHub repo public.
5. Optional: 8 real photos of any scooter or bike (4 angles × 2, the second set with a small removable mark).
6. Upload the final video to YouTube and press Submit on Devpost.

## 18. Schedule (Greek time)

- **Sun 8 Nov:** design, plan, project setup, core logic with fakes.
- **Mon 9 Nov:** screens with fakes.
- **Tue 10 Nov:** real PayPal sandbox + Claude; demo photos; Impeccable pass.
- **Wed 11 Nov:** end-to-end tests, review, deploy (after Akind's yes), README, Devpost text, video recording.
- **Thu 12 Nov:** final video edit, Akind uploads and submits **by 18:00** (4 hours before the deadline).
