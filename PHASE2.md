# Phase 2: Intelligence & Deliverability

## 1. Context-Aware Drafting
- Rating-checked prompts in `src/engine/drafter.ts` (2★ recovery, 3★ habits, 4–5★ efficiency).
- Draft body validated with Zod (`src/validation/draft.schemas.ts`) — ≤125 words, no images.
- Gemini API response validated with Zod (`src/validation/gemini.schemas.ts`).

## 2. Deliverability
- Random **5–15 min** delay between sends with **minute-by-minute** job progress (`sleepWithProgress`).
- **2% bounce** lock on Send + UI banner (`/api/deliverability`, control panel).
- Subject line: `upcoming fsa inspection` (lowercase, non-salesy).

## 3. Workflow
- **4-touch cap** → status `nurture`, excluded from send/draft batches.
- Run `npm run typecheck` before deploy (included in Render build).
