# AI system inventory — Evenhand

Dated 2026-11-08. Regulation (EU) 2024/1689 (the EU AI Act), as amended by Regulation (EU) 2026/1744.

## What the system is

Evenhand is a web app for rental shops and their renters. It replaces the passport (or cash) that some shops keep as a deposit with a PayPal hold. It also keeps a shared, sealed photo record of the condition of the rented item, such as a scooter.

The AI part is a vision model. It looks at photos of an item and helps in four ways:

1. It checks that each photo is usable and shows the right side.
2. It writes down the marks that are already on the item at pickup.
3. At return, it compares the return photos with the pickup photos and lists new marks, matched to the shop's own price list.
4. It writes a short plain explanation of the findings in the renter's language.

## Model and provider

- Model: `claude-opus-5-5`, through the Anthropic API.
- Roles under the AI Act:
  - **Evenhand** (operated by its maker) is the **provider** of the Evenhand AI system, which it runs under its own name (Article 3(3)).
  - **Anthropic** is the **provider** of the general-purpose model (`claude-opus-5-5`). Evenhand does not train or fine-tune it.
  - **Rental shops** that use Evenhand are **deployers**.
- The model id the app asks for is written in one place in the code (`src/lib/ai/model.ts`).
- Every AI result is stored with the model that actually answered (as the API reports it; a server-side fallback can answer with another model), the time and the fingerprints (SHA-256) of the photos the model saw.
- Recorded answers: `scripts/record-demo-answers.ts` runs the real model once, with a real key, on the bundled sample photos and writes `src/lib/demo/recorded/scooter-a.json`. It was run on 8 Nov 2026; the replayed answers are labelled on screen as recorded answers from claude-opus-5-5.
- In keyless demo mode no model is called; only recorded answers are replayed. With a key set, a call whose photos are all bundled sample photos with a recorded answer is also replayed, so the judge path is free and repeatable. A replayed answer is stored and shown truthfully: model `claude-opus-5-5`, `recorded: true`, and on screen "Recorded AI answer for the sample photos (claude-opus-5-5)". Real camera photos always go to the live model.
- Cost guards limit live calls: 200 paid AI requests per network address per hour, 40 live calls per shop per day, and a daily limit. Every counter is kept in the memory of one server instance, so each running instance counts for itself. Over a limit the flow goes on as "needs a human look".

## Purpose and users

- Purpose: help a shop and a renter agree on the condition of a rented item, so that a deposit is returned or partly charged for a good reason.
- Users: rental shop staff (the deployers' staff) and renters (affected persons). Hackathon judges use a demo.
- The system looks at objects, not people. The app asks only for photos of the item and never asks for identity documents. The photo check asks for a retake when a person is the main subject.
- Limits of that: photos are stored when they are uploaded. The shop can keep a photo the check rejected only after two failed tries of that side, and never when the check found a person as the main subject (enforced in the domain rules, not only on screen). The return comparison runs only when every return photo passed its check or was kept this way. In keyless demo mode no live check runs and every photo passes. A photo uploaded by mistake follows the same retention as every other photo.

## Classification (2026-11-08)

**Limited risk (Article 50 transparency duties).**

Reasons:

- It assesses damage to objects, not people. It does not profile anyone.
- It is not in an Annex III area. It is not used for credit scoring, insurance pricing, hiring, education, essential services, biometrics, law enforcement, migration or justice.
- A human decides every charge. The AI result never moves money by itself. A person confirms each finding, the shop proposes the charge, and the renter accepts or disagrees.
- Article 5 prohibited practices do not apply: no manipulation, no social scoring, no biometric categorisation, no emotion recognition.

Deployer duties apply even though the model is bought from a vendor. They are recorded here.

## Article 50 measures built

| Where | Label |
| --- | --- |
| Shop: guided photo capture | "AI-assisted — a person decides any charge." |
| Shop: condition review | The same line |
| Shop: each AI finding (finding card) | The same line. A finding added by the shop says "Added by the shop." |
| Shop: sample photos | "AI-generated demo photo" under each sample photo |
| Renter screens | The AI line in the renter's language, and "AI-written explanation" above the explanation (en, el, de, it, fr) |
| Sealed record page | The AI line whenever any AI assessment contributed, even if every confirmed finding was added by the shop. "AI-generated demo photo" on sample photos |
| Landing page | The AI line next to the comparison, a sentence in the hero, and the AI disclosure in the footer. "AI-generated demo photo" on the comparison photos |
| How it works page | A list of what the AI does and does not do, the AI line, and the footer |
| Stored AI results | Model name, time and photo fingerprints kept with every result |
| Recorded sample answers | "Recorded AI answer for the sample photos (claude-opus-5-5)" next to the photo check, the condition record and the return review |

### Article 50(2): machine-readable marking

- **On screen:** every element that shows AI-written text carries `data-ai-generated="true"` and `data-ai-model="<model>"`, where the model is the one the event records (for logs from before the model was recorded, the configured `claude-opus-5-5`). This covers the renter's AI-written explanation, the AI item description (shop and renter screens), findings whose source is the AI (shop finding cards and the record page), and the record page's AI-derived timeline lines. The attributes come from one shared helper (`aiTextMark` in `src/lib/ai/model.ts`). The fixed fallback text shown when the AI failed is not marked, because the AI did not write it.
- **In the export:** every AI step in the event log carries the model that answered (`model` on the photo-check, condition and comparison events) and `recorded: true` when the answer was replayed. The evidence export (`/api/handovers/<id>/evidence`) also lists each AI assessment with its step, assessment id and model in `assessments`. Events written before this field existed show `model: null`.

The demo scooter photos are AI-generated or AI-edited and are labelled as such wherever they are shown. The AI-written explanation is plain text shown on screen. It is labelled where it appears.

## Human oversight

- The AI never moves money. Void (release) needs the shop's tap and capture needs the renter's two taps; there is no automatic release. The only call made without a tap is the reauthorization, which renews an existing hold when the shop page refreshes after the 3-day honor period; it moves no money. It is tested with fakes and has not yet been run on the sandbox.
- Findings below the confidence bar are marked "needs a human look" and do not enter a charge by themselves.
- The shop confirms or dismisses each finding and can add its own.
- The renter sees the same photos and findings, and accepts or disagrees. A disagreement goes to a person.
- The renter's phone is bound at confirmation; a second device can only read. Shop staff who have the renter link therefore cannot accept or disagree in the renter's name without it showing. A shop tablet handed to the renter at the counter becomes the bound device, so we recommend that the renter confirms on their own phone.
- Amounts come from the shop's price list in code, never from the model's text. The model can only point to an existing price line.
- When the AI fails or is over a limit (daily limit per server instance, or 40 calls per shop per day), the flow goes on and says "needs a human look".

## Data kept and retention

- Photos, the event timeline, AI results and the PayPal references for a handover.
- Renter name is optional. The app never asks for identity documents. Photos are taken of the item only, but a photo uploaded by mistake is stored like any other.
- Planned retention: real handovers 30 days after the handover closes; demo handovers 7 days.
- **Not yet automated.** There is no deletion job in this build. Until one exists, data stays until someone removes it.

## Open items

1. Build the retention job (30 days real, 7 days demo) and test it.
2. Run an evaluation of the AI on real-world photos (different light, different items), and record the accuracy and the cases it gets wrong.
3. Confirm the Article 4 AI literacy plan for any shop staff who use the app.
4. ~~Block the override when the check rejected a photo because a person is the main subject.~~ Done 2026-11-08: the domain refuses that override, and any override needs two failed tries first.
5. Re-check this classification before any real-world launch or any new use (for example lending of other kinds of items).
