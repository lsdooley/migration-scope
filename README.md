# MigrationScope

A proof-of-concept web application that estimates the scope, effort, duration,
staffing, delivery risk, confidence, and migration-wave suitability of moving
one existing application to AWS. It imports current-state evidence from a
ServiceNow/CMDB export and asks only the small number of planning questions
the source data cannot answer.

> **POC defaults — not calibrated.** Every coefficient in this app is a
> placeholder assumption, not a validated model. Treat all outputs as a
> planning discussion aid, never as a funding or delivery commitment.

## Product principles

1. **Deterministic first.** Every core output comes from transparent
   formulas, lookup tables, and versioned rules — never from a model call.
2. **AI is optional and subordinate.** An AI narrative panel (off by default)
   can explain results in prose; it cannot change a fact, coefficient, score,
   or estimate. Every AI-generated sentence is labeled
   *"AI-assisted explanation — calculations unchanged."*
3. **Unknown is not zero.** Blank/unknown data creates a confidence penalty
   and, where relevant, discovery work. A verified zero never does.
4. **Everything traces.** Every number in the Results view links back to the
   source fact, formula, coefficient, work package, and rule that produced it
   via the Calculation trace tab.

## Quick start

```bash
npm install
npm run dev       # start the app at http://localhost:5173
npm test          # run the Vitest suite (unit + scenario tests)
npm run build     # type-check and produce a production build in dist/
```

No database or authentication is required, and the core app needs no backend
at all — it works fully offline/client-side. The only optional backend is a
small Lambda + API Gateway (`backend/narrative-lambda/`) behind the "Show AI
narrative" toggle; without it configured, that toggle transparently falls
back to deterministic templates. All application state lives in memory for
the lifetime of the browser tab — refreshing the page starts over by design
(no `localStorage` / `sessionStorage` is used).

## Using the app

1. Open **Applications** and click **Load synthetic data** to populate 12
   fictional ServiceNow/CMDB fixtures (`SYN-APP-001`–`012`), or **Import
   file** to bring in your own `.csv` / `.md` / `.markdown` export.
2. Select an application to open its **Application profile** — review
   imported facts, provenance badges, and any flagged conflicts. Optionally
   record corrections (kept as a separate overlay; the original import is
   never overwritten) and confirm the profile.
3. Open the **Estimate workspace**. Answer the three short steps (12
   questions on the normal path, never more than 15) and watch the live
   preview update. Only **Calculate estimate** commits a result.
4. Review the committed result's five tabs: Overview, Scope and effort, Risk
   and confidence, Team and schedule, and Calculation trace.
5. Use **Compare paths** to see 2–3 AWS migration paths side by side without
   re-entering any answers.
6. **Model configuration** lets you inspect or edit every coefficient, cap,
   threshold, and rule switch, export/import the model as JSON, and reset to
   POC defaults.

## Architecture

Pure calculation logic is fully separated from UI and from React state, and
none of it imports UI code or mutates its inputs:

```
src/
  model/               # pure, testable core
    types.ts              canonical domain types
    schemas.ts             Zod validation for imported rows + model config
    modelConfig.ts         POC-1.1 — every weight, cap, and threshold
    normalizer.ts           unit/label/severity normalization
    dataQuality.ts          Evidence Quality (completeness/freshness/…)
    featureDerivation.ts    derives calculation features from facts
    calculationEngine.ts    orchestrates every formula → EstimateResult
    rulesEngine.ts           versioned rules (R-101 … R-901)
  parsers/
    csvParser.ts            CSV ingestion, validation, sample generator
    markdownParser.ts       structured Markdown ingestion (YAML + tables)
  data/
    syntheticData.ts        12 synthetic ServiceNow fixtures
  narrative/
    narrativeProvider.ts    deterministic template fallback (always available)
    aiNarrativeClient.ts    calls the optional narrative Lambda (Claude Haiku); null on any failure
  exporters/
    exporters.ts            JSON/CSV export, spreadsheet-injection guard
  state/
    appState.tsx             in-memory React context (no persistence)
    useHashRoute.ts          minimal hash router — 7 real, bookmarkable routes
  components/               shared UI (Shell, results panel, form controls)
  views/                    the 7 routed views
```

Every core number a user sees was produced by a function in `src/model/` —
the UI only renders `EstimateResult` objects, it never computes anything
itself.

## Calculation model (summary)

See `src/model/calculationEngine.ts` and `src/model/modelConfig.ts` for the
authoritative formulas and coefficients. In brief:

- **Evidence Quality** = weighted blend of Completeness, Freshness,
  Consistency, Source authority, and Human confirmation (0–100).
- **Business Impact** = weighted blend of Criticality, RTO/RPO severity, and
  customer/transaction exposure, scaled to 0–100. A missing RPO re-normalizes
  the remaining weights rather than being treated as zero.
- **Core Engineering** = (path baseline + technology remediation +
  integration load) × change-surface multiplier + dependency load.
- **Expected Effort** = Core Engineering + Resilience effort + Assurance
  effort + Discovery allowance, tracked through a deduplicated work-package
  ledger so no remediation is ever counted twice.
- **Risk** = Likelihood (Complexity + Delivery friction) × a Business-Impact
  consequence factor, banded Low/Moderate/High/Critical. Rules can raise a
  risk floor or force a gate; they never lower risk.
- **Confidence** = Evidence Quality, banded High/Medium/Low, driving a
  planning range (`RangeWidth`) around Expected Effort.
- **Rules engine** (`R-101`…`R-901`) fires versioned, idempotent rules that
  add named work packages, raise risk/gate the estimate, or flag data
  conflicts — every fired rule is visible in the trace with a plain-language
  explanation.

## Testing

`npm test` runs the full Vitest suite, including:

- All 20 required unit assertions from the build spec (business-impact
  monotonicity, unknown-vs-zero handling, capacity caps, work-package
  idempotence, spreadsheet-injection protection, model-config validation,
  etc.) — see `src/model/formulas.test.ts`, `rulesAndCaps.test.ts`,
  `modelConfig.test.ts`, and `src/parsers/parsers.test.ts`.
- Three end-to-end scenario assertions in `src/model/scenarios.test.ts`
  (low-impact isolated app, high-impact payments app, stale/failed-recovery
  app) confirming the three synthetic archetypes produce visibly different,
  explainable outcomes.

## Security and privacy notes

- Uploaded file content is **never executed** — CSV/Markdown parsing is pure
  text processing (Papa Parse / js-yaml), and every imported string is
  rendered as text, never interpreted as markup or code.
- File size is capped (configurable in Model configuration; 5MB by default
  for this POC).
- Exported CSV cells beginning with `=`, `+`, `-`, or `@` are prefixed with a
  leading `'` to prevent spreadsheet-formula injection when the export is
  opened in Excel/Sheets (`src/parsers/csvParser.ts#sanitizeCsvCell`).
- No credentials, API keys, or secrets are used in the frontend or committed to
  this repo. The optional narrative Lambda reads its Anthropic API key from AWS
  SSM Parameter Store (SecureString) at runtime — see `DEPLOYMENT.md`.

## Accessibility

Semantic landmarks and one `<h1>` per view; radio-card/checkbox-chip controls
built on native `<input>` elements for full keyboard support; visible focus
rings; a restrained `aria-live` region announces recalculated live-preview
summaries without spamming assistive tech; 44px minimum interactive targets
and 16px minimum body/input text; `prefers-reduced-motion` respected; tables
collapse into stacked cards below 640px instead of forcing horizontal
scroll; light/dark themes default to system preference and can be forced via
the theme toggle.

## POC limitations

- Coefficients are illustrative placeholders (see the "POC defaults — not
  calibrated" banner throughout the app) and have not been calibrated
  against real migration data.
- All 12 synthetic ServiceNow records are fictional scenario fixtures, not a
  statistically representative sample — they exist to exercise every
  archetype (isolated app, payments app, mainframe, COTS, unknown data,
  conflicting data, etc.), not to benchmark anything.
- State is in-memory only; there is no persistence, multi-user support, or
  real ServiceNow/CMDB/AWS connection.
- The AI narrative panel calls a real model (Claude Haiku, via a small
  Lambda + API Gateway backend — see `DEPLOYMENT.md`) when
  `VITE_NARRATIVE_API_URL` is configured; without it, or on any failure, it
  falls back to the deterministic templates in `narrativeProvider.ts`. Either
  way, the AI layer only explains already-calculated numbers — it cannot
  change a score, formula, or rule.
