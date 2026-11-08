# Evenhand

Keep your passport. Keep the peace.

Some island rental shops keep a tourist's passport as the deposit. Evenhand replaces it with a PayPal hold and a sealed photo record that the shop and the renter both see. AI compares the photos. A person decides any charge.

- Live demo: <!-- LIVE_URL -->
- Licence: MIT (see `LICENSE`)
- Built for the PayPal AI Hackathon 2026. PayPal sandbox only. No real money moves.

## The 3-minute judge path

This works with no keys at all when you run it locally (keyless demo mode, clearly badged "Demo mode"). A demo shop gets the sample photos in every mode, also with real sandbox and Claude keys.

1. Open the app and press **Try the demo**. You get a fresh demo shop.
2. Press **New handover** and fill in the item.
3. Use the **sample photos** for the four sides.
4. Review the condition record, pick the deposit, then **share**.
5. Press **Open renter view** to open the renter's side in a new tab of the same browser. Confirm the record there.
6. In the renter tab, **simulate the hold**. In demo mode PayPal is a fake gateway.
7. Back in the shop tab, start the return and add the **damaged** sample set.
8. Add or confirm findings (the demo set has a new scratch and a missing mirror) and press **Send to renter**.
9. In the renter tab, press **Accept**, then tap again to confirm.
10. Open the **sealed record**: the timeline, the fingerprints, the "Record intact" stamp and the machine-readable strip.
11. Open the **holds dashboard** to see the settled handover.

The renter's phone is bound at confirmation; a second device can only read. "Open renter view" in the same browser is the confirming device, so one-laptop judging works. If a shop hands its own tablet to the renter at the counter, that tablet becomes the bound device. We recommend that the renter confirms on their own phone.

**About the AI answers for the sample photos.** They are recorded answers. `scripts/record-demo-answers.ts` produces them once, with a real Anthropic key, and writes `src/lib/demo/recorded/scooter-a.json` (bundled with the app). Until that script has been run, the file is empty: in keyless mode the AI steps then say the check could not run, and a person compares the photos. With a key set, the sample photos get the recorded answers once they exist (labelled "Recorded AI answer for the sample photos (claude-opus-5-5)"), so the judge path is free and repeatable; real camera photos always go to Claude.

## How PayPal is used

- **Authorize**: the renter approves a hold with an Orders v2 `AUTHORIZE` order. The money is reserved, not moved.
- **Void**: on a clean return the shop taps **Release** and the authorization is voided. There is no automatic release: release always needs the shop's tap. After a reauthorization the original (parent) authorization is voided, as PayPal requires.
- **Partial capture**: when the renter accepts a charge (two taps), only the agreed amount is captured, with `final_capture`, and the rest is released.
- **Reauthorize**: PayPal honors a hold for 3 days. Once a hold passes 3 days, the shop page renews it automatically when it refreshes (no tap). An authorization is valid for 29 days. This is tested with fakes only; it has not been run on the sandbox yet.
- **Lost hold**: if a hold expired, was voided or was captured outside the app, both screens say so and offer no Release or Accept.
- Sandbox only. The app refuses any `PAYPAL_ENV` other than `sandbox`, and the PayPal base URL is fixed to the sandbox in code.

## How AI is used

Model: `claude-opus-5-5` through the Anthropic API. The record stores the model that actually answered, as the API reports it.

- **Photo check**: is each photo usable and the right side? It asks for a retake if a person is in the picture. The shop can keep a rejected photo only after two failed tries, and never one that shows a person.
- **Condition record**: the marks already on the item at pickup.
- **Comparison**: new marks at return, matched to the shop's own price list, each with a confidence.
- **Explanation**: a short plain explanation in the renter's language, labelled "AI-written explanation".

The AI never moves money and never sets a price. A person confirms every charge. See `docs/AI-ACT-INVENTORY.md`.

Cost guards: at most 200 paid AI requests per network address per hour, 40 live AI calls per shop per day, and a daily limit (`AI_DAILY_CALL_LIMIT`). Every one of these counters lives in the memory of one server instance, so each running instance counts for itself. With several instances, the real total can be higher than the number shown. Recorded answers and a retake of the same photo cost nothing and do not count.

## Run it locally

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:4321.

### Keyless demo mode

Run it with no `.env.local`. PayPal is faked, AI answers are replayed for the sample photos (once they have been recorded, see above), and photos are stored in `.data/`. Keyless demo mode is for local runs only: on Vercel the app refuses fake payments and local storage and says which keys to set.

### Sandbox mode

1. Copy `.env.example` to `.env.local`.
2. Fill in the values you have:
   - `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`: a PayPal sandbox REST app. The browser button gets the same client id from `/api/mode`, so there is no public PayPal variable.
   - `ANTHROPIC_API_KEY`: turns on the live AI.
   - `BLOB_READ_WRITE_TOKEN`: stores photos in Vercel Blob instead of local files.
   - `PUBLIC_BASE_URL`: optional. Without it, the renter and record links use the address of the site the shop is using.
   - `AI_DAILY_CALL_LIMIT`: optional.
3. Leave a value empty to keep that part in demo mode. Never commit `.env.local`.

A hosted site (Vercel) needs the PayPal sandbox keys and `BLOB_READ_WRITE_TOKEN`. `ANTHROPIC_API_KEY` stays optional.

### Sandbox test buyer

<!-- SANDBOX_BUYER: add the sandbox buyer login here before submitting. -->

### Scripts

- `npx tsx scripts/sandbox-check.ts`: a manual check of the PayPal sandbox (hold, then partial capture). Needs the sandbox keys.
- `npx tsx scripts/record-demo-answers.ts`: runs the real AI on the three sample sets (photo checks, condition record, both comparisons) and writes `src/lib/demo/recorded/scooter-a.json`. It makes real API calls and costs money. Run it once with `ANTHROPIC_API_KEY` set. Until then that file is `{}`.

## Tests

```bash
npm test             # unit and integration tests
npm run typecheck
npm run coverage
npm run e2e          # Playwright
```

## Security

Every page gets a Content-Security-Policy with a new nonce per request, plus the usual headers (no sniffing, no framing, strict transport, camera only for this site). See `src/proxy.ts` and `src/lib/security-headers.ts`.

## AI disclosure

This app uses artificial intelligence (Anthropic's Claude) to compare photos and write explanations. Every AI result is labelled. A person decides any charge. The demo scooter photos are AI-generated or AI-edited and are labelled "AI-generated demo photo".

## Licence

MIT. See `LICENSE`.
