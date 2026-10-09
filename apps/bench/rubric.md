# Planet Creator tuning rubric

Use the captured canvas only. Interface chrome, contact-sheet labels, encoding size, and personal preference outside the stated ink grammar are not evidence. Score each visual category from 0 to 5, record the evidence that caused the score, and keep performance as a separate manifest gate.

## 1. Readability — 0 to 5

Judge the orbit poster, the yaw strip, and any monument surface together.

- **5 — immediate:** the globe silhouette, coast, major relief, activity landmarks, race stroke, and monument read at first glance; foreground, middle distance, and sky remain clearly separated at every sampled yaw.
- **4 — clear:** the hierarchy survives every view, with only a small collision or one weak landmark.
- **3 — usable:** the planet reads, but one important form needs inspection or loses separation in some views.
- **2 — confused:** several forms merge, the coast or relief is hard to follow, or the surface view loses its subject.
- **1 — mostly illegible:** only the globe or broad colour family reads reliably.
- **0 — failed:** the subject cannot be read, is substantially clipped, or a capture is blank/corrupt.

A high score requires both orbit and surface readability when a monument surface exists. Do not award points for labels that are not part of the renderer canvas.

## 2. Motion quality — 0 to 5

Use the deterministic time strip and, when present, the six-second 30 fps clip. Inspect the yaw strip only for view-dependent discontinuities.

- **5 — continuous and world-bound:** cadence is even; motion has no visible judder; geometry, objects, shadows, coast, haze, and runner do not pop; pigment grain and broken edges remain attached to the painted world rather than to the screen.
- **4 — clean:** one minor uneven beat or tiny discontinuity is visible but does not distract.
- **3 — acceptable:** motion reads correctly, with occasional mild judder, shimmer, or a small pop.
- **2 — distracting:** repeated uneven pacing, obvious pop-in, unstable silhouette, or screen-fixed grain competes with the subject.
- **1 — broken:** strong judder, large geometry/object changes, swimming edges, or viewport-locked noise dominates.
- **0 — unusable:** frames are missing, frozen unintentionally, blank, corrupt, or motion cannot be assessed.

“Screen-fixed grain” means noise or texture that stays in the same display pixels while the planet, camera, or runner moves beneath it. That is a defect even when a single frame looks attractive. “Pop-in” includes any one-frame appearance, disappearance, LOD jump, lighting jump, or hard reset not explained by an intentional cut. Judge judder from the spacing of visible motion over successive frames, not from file playback controls.

## 3. Data legibility — blind match, 0 to 5

This score is valid only from an opaque `--blind` package. Before looking at any key, assign every Tile to exactly one numbered Summary, use every Summary exactly once, and lock the complete assignment. Then the key holder compares it with `blind-key.json` and records the integer **exact match count M / N**. A match is all-or-nothing; similar weeks, partial clues, and a correct sport with the wrong week receive no fractional credit.

- **5:** M = N.
- **4:** M / N is at least 0.75 but less than 1.
- **3:** M / N is at least 0.50 but less than 0.75.
- **2:** M / N is at least 0.25 but less than 0.50.
- **1:** M is greater than 0 but M / N is less than 0.25.
- **0:** M = 0, or the mapping/key was viewed before the assignment was locked.

The purpose is not to identify a date from colour trivia. The picture should expose meaningful weekly differences: activity mix, volume, terrain, climate, race/monument status, and the resulting visual rhythm. Report both the score and the exact integer count; a percentage alone is insufficient. An identified, non-blind package may support comments but must say **Data legibility: NOT SCORED**.

## 4. Beauty under the ink laws — 0 to 5

These are the binding laws from the `apps/planet/ink-objects.js` header, not optional style suggestions:

1. Use **one limited palette**.
2. Use **flat washes with hard broken edges**.
3. Show **pigment pooling wherever a wash stops**.
4. Leave **paper along the lit edge**.
5. Use **no CG shading at all**: no specular, no smooth value ramps, no gradient fill, and no Gaussian blur.
6. A wash is a flat area of pigment ending in a crisp, slightly darker rim; wet-in-wet softness is never the default.

Score the result:

- **5 — authored ink:** all laws are visible and mutually reinforcing; the planet is distinctive, balanced, and beautiful at orbit and surface scale.
- **4 — convincing:** the grammar is intact with one small generic, muddy, or mechanically repeated area.
- **3 — sound:** recognisably the intended hand, but composition or paint handling is uneven.
- **2 — compromised:** one major law is repeatedly weakened, or the result feels partly like shaded CG with an ink filter.
- **1 — mostly CG/generic:** several laws are absent; smooth ramps, specular response, gradient fill, blur, or unrestricted colour dominate.
- **0 — outside the grammar:** the image is broken or no longer reads as this ink system.

A technically impressive effect that breaks a law lowers this score. Do not average a prohibited CG treatment away because another view is attractive.

## 5. Performance — manifest PASS or FAIL

Performance is measured, not guessed from playback. Copy the round’s `manifest.perf.pass` value and each week’s `perf.pass` value into the review. **PASS** requires every captured week to stay within every budget recorded in `manifest.perf.budget`; any failed week makes the round **FAIL**. Do not override a failure because the clip looked smooth, and do not invent a failure when the manifest passes.

## Decision rule

Recommend the candidate only when Readability, Motion quality, and Beauty are each at least 3, Performance is PASS, no capture is invalid, and the exact blind-match result is reported when a blind package was requested. Prefer a baseline only after judging unidentified Take A/Take B evidence; reveal their identities after the judgments are locked. Record dissenting evidence rather than averaging away a severe motion defect or an ink-law violation.
