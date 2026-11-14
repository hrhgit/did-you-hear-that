# Design: threshold search

## Overview

The engine runs the search for one room. A room has one pitch and two ears. The engine knows nothing about the pitch: it asks for trials, is told the visitor's response to each, and finally returns one result per ear.

```
             settings (from src/config)     RandomSource (from src/config)
                         │                          │
                         ▼                          ▼
                  ┌──────────────────────────────────────┐
  respond(answer) │          ThresholdSearch             │ current()
 ───────────────▶ │  ┌────────────┐      ┌────────────┐  │ ─────────▶ next trial
                  │  │ EarSearch  │      │ EarSearch  │  │            or result
                  │  │   left     │      │   right    │  │
                  │  └────────────┘      └────────────┘  │
                  │  NoSoundSchedule   classifyResponse  │
                  │  finalizeEarResult  roomLimits       │
                  └──────────────────────────────────────┘
```

Each ear has its own `EarSearch`, a deterministic state machine with no randomness: it holds the next level, the direction of the next presentation and the tallies the ending rules need. The room object owns the random source. For every trial it decides whether to play nothing, which ear to play to, and how long to wait first. When both ear searches have ended and the share of no-sound trials is in range, it applies the room-wide checks (false alarm rate and inconsistent catches) and returns the result.

The tests drive the engine with simulated listeners through an interface, `SearchUnderTest`, that does not depend on the engine's own types. The same property checks can therefore run against the version on `experiment/no-spec` at the end of the spec.

## Sources

- `docs/briefs/01-threshold-search.md`: behaviour, listeners, the five properties, the comparison.
- `.kiro/steering/hearing-method.md`: the method, the four end states, the no-sound trials and the initial values.
- `.kiro/steering/structure.md`, `tech.md`, `audio-safety.md`, `wording.md`, `product.md`.
- `docs/architecture.md`: the engine's place and its inputs and outputs.
- The scaffold: `src/config/hearing-method-config.ts`, `seeded-random.ts`, `timer.ts`, the lint rules in `tools/lint/`, `vite.config.ts` (Vitest collects `src/**/*.test.ts`, `tests/**/*.test.ts` and `tools/**/*.test.ts`) and the tsconfig split.
- The American Speech-Language-Hearing Association's [Guidelines for Manual Pure-Tone Threshold Audiometry (2005)](https://www.asha.org/policy/gl2005-00014/), read while writing this spec to settle D1. See D1 and D26 for what it says and how far it is relied on.

## Files

Created:

```
src/engine/
  search-types.ts                  Ear, VisitorResponse, Trial, TrialRecord, EarResult, RoomResult, SearchStep, ThresholdSearch, ThresholdSearchSettings
  validate-search-settings.ts      validateSearchSettings (+ .test.ts)
  room-limits.ts                   roomLimits (+ .test.ts)
  fraction-comparisons.ts          atLeastFraction, atMostFraction (+ .test.ts)
  classify-response.ts             classifyResponse (+ .test.ts)
  ear-search.ts                    createEarSearch (+ .test.ts)
  no-sound-schedule.ts             createNoSoundSchedule (+ .test.ts)
  finalize-ear-result.ts           finalizeEarResult (+ .test.ts)
  threshold-search.ts              createThresholdSearch (+ .test.ts)
tests/listeners/
  listener-types.ts                ListenerEar, ListenerResponse, ListenerTrial, SimulatedListener
  psychometric-listener.ts         createPsychometricListener (+ .test.ts)
  extreme-listeners.ts             extremeListeners (+ .test.ts)
  listener-parameter-arbitraries.ts  plausibleListenerParameters, attentiveListenerParameters
  search-under-test.ts             SearchUnderTest, RoomRun, RunTrial, RunEarResult
  spec-search-under-test.ts        specSearchUnderTest (+ .test.ts)
  searches-under-test.ts           searchesUnderTest (the registry used by the scripts)
  classify-accuracy.ts             classifyAccuracy (+ .test.ts)
  measure-population.ts            measurePopulation (+ .test.ts)
  write-scatter-data.ts            CLI for npm run experiment:scatter
tests/properties/
  checks/                          one module per correctness property, shared by the tests and the comparison CLI
  checks/ear-oracle.ts             independent re-derivation of an ear's result from its records
  checks/valid-settings-arbitrary.ts
  checks/run-brief-properties.ts   CLI for npm run experiment:properties
  threshold-search-*.property.test.ts
  threshold-search-extreme-listeners.test.ts
  threshold-search-regressions.test.ts
docs/experiments/
  threshold-search-scatter-spec.csv
  threshold-search-scatter-no-spec.csv      copied from the measurement branch in task 15
  brief-properties-spec.json
  brief-properties-spec-first-run.json
  brief-properties-no-spec.json             copied from the measurement branch in task 15
  spec-vs-no-spec.md
```

Changed:

- `src/config/hearing-method-config.ts` and its test: six new fields (R12, D15).
- `package.json`: the scripts `experiment:scatter` and `experiment:properties`, both run through `tsx`.
- `src/engine/README.md`, `tests/listeners/README.md`, `tests/properties/README.md`, `docs/README.md`: one or two sentences each about what now lives there.

On the branch `experiment/no-spec-measured` only (D23): a copy of the harness-neutral listener and check files, the no-spec adapter, and the files `brief-properties-no-spec.json` and `threshold-search-scatter-no-spec.csv`, which task 15 copies to `main`.

## Components and interfaces

### Types

```ts
// src/engine/search-types.ts
import type { HearingMethodConfig } from "../config/hearing-method-config";

export type Ear = "left" | "right";
/** Named to avoid the DOM's global `Response`. */
export type VisitorResponse = Ear | "none";
export type Direction = "first" | "descending" | "ascending";
export type SoundOutcome = "caught" | "wrongSide" | "missed";
export type NoSoundOutcome = "falseAlarm" | "noResponse";

export type ThresholdSearchSettings = Pick<
  HearingMethodConfig,
  | "downwardStepDb" | "upwardStepDb" | "startingLevelDb" | "capRelativeToAnchorDb" | "floorDb"
  | "gapBetweenTrialsMinMs" | "gapBetweenTrialsMaxMs"
  | "noSoundTrialShareMinFraction" | "noSoundTrialShareMaxFraction" | "noSoundTrialProbabilityFraction"
  | "falseAlarmRateUnreliableAboveFraction" | "trialLimitPerEarPerRoomCount"
  | "thresholdCatchesMinCount" | "thresholdCatchShareMinFraction"
  | "floorCatchesForBetterThanFloorCount" | "capMissesForWorseThanCapCount"
  | "inconsistentCatchMarginDb"
>;

export interface SoundTrial {
  readonly kind: "sound";
  readonly trialNumber: number;
  readonly ear: Ear;
  readonly levelDb: number;
  readonly direction: Direction;
  readonly gapBeforeMs: number;
}

export interface NoSoundTrial {
  readonly kind: "noSound";
  readonly trialNumber: number;
  readonly phase: "search" | "closing";
  readonly gapBeforeMs: number;
}

export type Trial = SoundTrial | NoSoundTrial;

export type TrialRecord =
  | { readonly trial: SoundTrial; readonly response: VisitorResponse; readonly outcome: SoundOutcome }
  | { readonly trial: NoSoundTrial; readonly response: VisitorResponse; readonly outcome: NoSoundOutcome };

export type UnreliableReason = "trialLimit" | "inconsistentCatch" | "falseAlarmRate";

export interface EarCounts {
  readonly presentationCount: number;
  readonly catchCount: number;
  readonly wrongSideCount: number;
  /** Sound trials answered with "none". Wrong-side answers are counted in wrongSideCount only. */
  readonly missCount: number;
}

export type EarResult =
  | (EarCounts & { readonly state: "found"; readonly thresholdDb: number })
  | (EarCounts & { readonly state: "betterThanFloor" })
  | (EarCounts & { readonly state: "worseThanCap" })
  | (EarCounts & { readonly state: "unreliable"; readonly reasons: readonly UnreliableReason[] });

export interface RoomResult {
  readonly left: EarResult;
  readonly right: EarResult;
  readonly noSoundTrialCount: number;
  readonly falseAlarmCount: number;
  /** falseAlarmCount / noSoundTrialCount, or 0 when the room had no no-sound trial. */
  readonly falseAlarmRateFraction: number;
  readonly falseAlarmRateAboveLimit: boolean;
  readonly trials: readonly TrialRecord[];
}

export type SearchStep =
  | { readonly kind: "trial"; readonly trial: Trial }
  | { readonly kind: "finished"; readonly result: RoomResult };

export interface ThresholdSearch {
  /** The trial waiting for a response, or the result. Has no effect and may be called any number of times. */
  current(): SearchStep;
  /** Records the response to the waiting trial and returns the next step. */
  respond(response: VisitorResponse): SearchStep;
}
```

`search-types.ts` exports several types. It is the engine's vocabulary, and splitting it into one file per type would only add import lines. This is the "where practical" exception in `structure.md`.

### `createThresholdSearch`

```ts
export function createThresholdSearch(options: {
  settings: ThresholdSearchSettings;
  random: RandomSource;
}): ThresholdSearch;
```

It validates and copies the settings first (R2), so a caller who changes their object later cannot affect a running room. It throws a `TypeError` if `random` has no `next` function. The first trial is created inside `createThresholdSearch`, so `current()` never draws a random number and calling it twice cannot change the sequence (R3.2).

The session can replay a waiting trial as often as it needs before answering, for example after the tab was hidden (brief 04). The engine does not need to know.

### `validateSearchSettings`

```ts
export function validateSearchSettings(settings: ThresholdSearchSettings): ThresholdSearchSettings;
```

Returns a frozen copy of exactly the fields in `ThresholdSearchSettings`, or throws a `RangeError` whose message names the field and the value. It checks, in this order: R2.3 (integers), R2.4 (steps), R2.5 (floor, cap and start on the grid), R2.6 (gaps), R2.7 (fractions), R2.8 (counts and margin), R2.9 (a share in range exists for every possible number of sound trials). The last check uses `roomLimits`.

### `roomLimits`

```ts
export function roomLimits(settings: ThresholdSearchSettings): {
  readonly minimumEarPresentationCount: number;
  readonly minimumRoomSoundTrialCount: number;
  readonly maximumRoomSoundTrialCount: number;
  readonly maximumRoomNoSoundTrialCount: number;
  readonly roomTrialLimitCount: number;
};
```

- `minimumEarPresentationCount` = the smallest of `thresholdCatchesMinCount`, `floorCatchesForBetterThanFloorCount`, `capMissesForWorseThanCapCount` and `trialLimitPerEarPerRoomCount`. Every way an ear search can end needs at least that many presentations (D6).
- `minimumRoomSoundTrialCount` = 2 × the above.
- `maximumRoomSoundTrialCount` = 2 × `trialLimitPerEarPerRoomCount`.
- `maximumRoomNoSoundTrialCount` = the largest `c` with `atMostFraction(c, c + maximumRoomSoundTrialCount, noSoundTrialShareMaxFraction)`.
- `roomTrialLimitCount` = the sum of the two maxima.

With the shipped settings: 2, 4, 40, 13, 53.

### `atLeastFraction` and `atMostFraction`

```ts
export function atLeastFraction(part: number, whole: number, fraction: number): boolean; // part >= fraction * whole - 1e-9
export function atMostFraction(part: number, whole: number, fraction: number): boolean;  // part <= fraction * whole + 1e-9
```

Every share and fraction rule in the engine goes through these two functions, so a value exactly at a configured limit is treated the same way everywhere (D29). The tests use the same functions to check share limits, so test and engine cannot disagree about a boundary.

### `classifyResponse`

```ts
export function classifyResponse(trial: Trial, response: VisitorResponse): SoundOutcome | NoSoundOutcome;
```

Sound trial: the trial's ear is `caught`, the other ear is `wrongSide`, `"none"` is `missed`. No-sound trial: either ear is `falseAlarm`, `"none"` is `noResponse`. Any other value throws a `TypeError` naming it (R4.7).

### `createEarSearch`

```ts
export type EarEnding =
  | { readonly kind: "found"; readonly thresholdDb: number }
  | { readonly kind: "betterThanFloor" }
  | { readonly kind: "worseThanCap" }
  | { readonly kind: "trialLimit" };

export interface Presentation {
  readonly levelDb: number;
  readonly direction: Direction;
  readonly outcome: SoundOutcome;
}

export interface EarSearch {
  readonly ear: Ear;
  isSearching(): boolean;
  /** Throws an Error once the search has ended. */
  next(): { readonly levelDb: number; readonly direction: Direction };
  /** Throws an Error once the search has ended. */
  record(outcome: SoundOutcome): void;
  ending(): EarEnding | undefined;
  /** 0 once ended; otherwise at least 1. See D6. */
  remainingPresentationsLowerBound(): number;
  presentations(): readonly Presentation[];
}

export function createEarSearch(ear: Ear, settings: ThresholdSearchSettings): EarSearch;
```

State: the next level and direction, the list of presentations, and per level a tally of ascending presentations, ascending catches and ascending non-catches. It also keeps the number of presentations and catches at the floor. Levels are integers (R2.3), so they are exact map keys. A wrong-side answer is a non-catch everywhere in this module.

`record(outcome)` does the following. Only the first rule that applies counts.

```
p = { levelDb: nextLevel, direction: nextDirection, outcome }
append p and update the tallies
caught = outcome == "caught"

if p.direction == ascending and foundAt(p.levelDb)
        and not quieterLevelStillOpen(p.levelDb):             → end found(p.levelDb)
else if p.levelDb == floor and betterThanFloorReached():       → end betterThanFloor
else if p.direction == ascending and p.levelDb == cap
        and ascendingNonCatchesAt(cap) >= capMissesForWorseThanCapCount:  → end worseThanCap
else if presentation count == trialLimitPerEarPerRoomCount:    → end trialLimit
else:
  nextLevel     = caught ? max(floor, p.levelDb − downwardStepDb) : min(cap, p.levelDb + upwardStepDb)
  nextDirection = caught ? descending : ascending

foundAt(L): catches = ascending catches at L, total = ascending presentations at L
            catches >= thresholdCatchesMinCount and atLeastFraction(catches, total, thresholdCatchShareMinFraction)
quieterLevelStillOpen(L): Q = L − upwardStepDb
            L < cap and Q > floor, and foundAt(Q) would hold with one more ascending catch at Q (D40)
betterThanFloorReached(): catches = catches at floor (any direction), total = presentations at floor
            catches >= floorCatchesForBetterThanFloorCount and atLeastFraction(catches, total, thresholdCatchShareMinFraction)
```

The first presentation is at `startingLevelDb` with direction `first`.

`remainingPresentationsLowerBound()` for a searching ear is:

```
max(1, min(thresholdCatchesMinCount − (most ascending catches at any one level),
           floorCatchesForBetterThanFloorCount − (catches at floor),
           capMissesForWorseThanCapCount − (ascending non-catches at cap),
           trialLimitPerEarPerRoomCount − (presentations so far)))
```

Each ending needs its count to reach its limit, and one presentation raises any one count by at most 1. So no ear can end in fewer presentations than this (D6).

### `createNoSoundSchedule`

```ts
export function createNoSoundSchedule(settings: ThresholdSearchSettings): {
  /** May the next Search_Phase trial be a no-sound trial without risking the share maximum? */
  mayAddNoSoundTrial(counts: { noSound: number; sound: number; remainingSoundLowerBound: number }): boolean;
  /** Does the room need another closing no-sound trial? */
  needsClosingTrial(counts: { noSound: number; sound: number }): boolean;
};
```

- `mayAddNoSoundTrial`: `atMostFraction(noSound + 1, noSound + 1 + sound + remainingSoundLowerBound, max)`. The share at the end of the room is highest when the room ends with the fewest sound trials still possible, so this is the worst case (R9.2).
- `needsClosingTrial`: `!atLeastFraction(noSound, noSound + sound, min)`.

Neither function draws a random number. The room makes the draw.

### `finalizeEarResult`

```ts
export function finalizeEarResult(input: {
  ending: EarEnding;
  presentations: readonly Presentation[];
  falseAlarmRateAboveLimit: boolean;
  settings: ThresholdSearchSettings;
}): EarResult;
```

```
reasons = []
if ending is trialLimit: add "trialLimit"
reference = ending is found ? thresholdDb : ending is worseThanCap ? cap : none
if reference exists and some presentation is caught at a level <= reference − inconsistentCatchMarginDb:
  add "inconsistentCatch"
if falseAlarmRateAboveLimit: add "falseAlarmRate"
if reasons is not empty: unreliable with reasons
else: the state of the ending, with thresholdDb only for found
counts come from the presentations
```

### The room, step by step

```
create:
  settings = validateSearchSettings(options.settings)
  ears = { left: createEarSearch("left"), right: createEarSearch("right") }
  schedule = createNoSoundSchedule(settings)
  records = []; noSound = 0; sound = 0
  step = makeNextStep()

makeNextStep():
  searching = [left, right] filtered by isSearching, in that order
  if searching is not empty:                                   # Search_Phase
    lowerBound = sum of remainingPresentationsLowerBound over searching
    isNoSound = false
    if schedule.mayAddNoSoundTrial({ noSound, sound, remainingSoundLowerBound: lowerBound }):
      isNoSound = random.next() < noSoundTrialProbabilityFraction           # draw 1
    if not isNoSound:
      ear = searching.length == 1 ? searching[0]
                                  : searching[floor(random.next() × searching.length)]  # draw 2
    gap = gapMin + floor(random.next() × (gapMax − gapMin + 1))           # draw 3
    return the trial
  if schedule.needsClosingTrial({ noSound, sound }):          # Closing_Phase
    gap = draw as above
    return a closing no-sound trial
  return finished(buildResult())

respond(response):
  if step is finished: throw Error
  outcome = classifyResponse(step.trial, response)            # throws TypeError before any change
  append the record
  if the trial is a sound trial: ears[trial.ear].record(outcome); sound += 1
  else: noSound += 1
  step = makeNextStep()
  return step

buildResult():
  falseAlarms = number of records with outcome falseAlarm
  rate = noSound > 0 ? falseAlarms / noSound : 0
  above = noSound > 0 and not atMostFraction(falseAlarms, noSound, falseAlarmRateUnreliableAboveFraction)
  left, right = finalizeEarResult for each ear
```

Draws happen only where marked, in the order 1, 2, 3. Draw 1 is skipped when the share maximum forbids a no-sound trial. Draw 2 is skipped when the trial is a no-sound trial or only one ear is searching. The order is part of the design because R1.5 and the regression tests depend on it.

Every trial, record and result is built as a new object and frozen before it leaves the engine. The `trials` array of a result is a frozen copy.

## Worked examples

All with the shipped settings: start −25, floor −70, cap 15, steps 10 down and 5 up. "C" is a catch and "M" a miss. Each ear is shown on its own. In a room the two ears' trials interleave with no-sound trials, which does not change either ear's sequence.

**A. Step listener, true threshold −52.** −25 first C, −35 desc C, −45 desc C, −55 desc M, −50 asc C (1 of 1), −60 desc M, −55 asc M, −50 asc C (2 of 2). Found at −50 after 8 presentations, 2 dB above the truth.

**B. Never answers.** −25 first M, then ascending misses at −20, −15, −10, −5, 0, 5, 10, 15, and a second ascending miss at 15 because the level is held at the cap. Worse than cap after 10 presentations, no catch, so not unreliable on that ground.

**C. Step listener, true threshold −80.** Catches at −25, −35, −45, −55 and −65, then −70 desc C (floor, 1 of 1), −70 desc C (2 of 2). Better than floor after 7 presentations.

**D. Step listener, true threshold 12.** Misses from −25 up to 10 (8 presentations), 15 asc C, 5 desc M, 10 asc M, 15 asc C (2 of 2). Found at the cap, 15, after 12 presentations. The found rule is checked before the worse-than-cap rule.

**E. An inconsistent catch.** As A, but the presentation at −60 is caught (a guess): −60 desc C, −70 desc M, −65 asc M, −60 asc M, −55 asc M, −50 asc C (2 of 2). Found at −50, but the ear caught −60, which is 10 dB below. The result is unreliable with the reason `inconsistentCatch`.

**F. Two of four.** Outcomes C C M C M M M C M M M C M M M C C M C. The levels are −25 −35 −45 −40 −50 −45 −40 −35 −45 −40 −35 −30 −40 −35 −30 −25 −35 −45 −40. Level −40 gets ascending presentations C, M, M, C. After the third it holds 1 of 3, which is not enough. The fourth makes 2 of 4, which is half, and the ear is found at −40 after 19 presentations. No other level reached 2 ascending catches first. Under a "first three only" reading this ear would have run into the trial limit (D1).

**G. Trial limit.** Outcomes M C, then M M M C four times, then M M (20 in all). The levels are −25 −20 −30 −25 −20 −15 −25 −20 −15 −10 −20 −15 −10 −5 −15 −10 −5 0 −10 −5. Each of −20, −15, −10 and −5 ends with 1 ascending catch in 3, and 0 has 1 of 1. Neither the floor nor the cap is reached. After the 20th presentation the ear ends with the reason `trialLimit`.

**H. A quieter level still open (D40).** Outcomes C C C M C M C M M M C M C. The levels are −25 −35 −45 −55 −50 −60 −55 −65 −60 −55 −50 −60 −55. After the 11th presentation −50 holds 2 ascending catches in 2, but −55 holds 1 in 2, and one more catch would make it 2 of 3. So the search goes on: −60 is missed and −55 is caught, 2 of 3. The level below it, −60, has 0 ascending catches in 1 and cannot qualify on its next presentation, so the ear is found at −55 after 13 presentations. Before D40 it was found at −50 after 11.

These traces become unit tests of `createEarSearch` (A to H) and of `finalizeEarResult` (E and G).

## Error handling

| Situation | Behaviour |
|---|---|
| Invalid settings | `RangeError` from `createThresholdSearch` naming the field and value. No search is created |
| `random` missing or without `next` | `TypeError` from `createThresholdSearch` |
| `respond` with anything but `"left"`, `"right"`, `"none"` | `TypeError`. State unchanged |
| `respond` after the room has finished | `Error`. State unchanged |
| `EarSearch.next` or `record` after the ear has ended | `Error`. The room never does this. The check guards against future changes |
| A caller changes its settings object after creation | No effect. The engine holds a frozen copy |
| A caller tries to change a returned trial or result | `TypeError` in strict mode. The objects are frozen |

## Correctness properties

Each property names the requirements it covers. "Universal" properties use fast-check with a random seed and at least 200 runs. "Statistical" properties use the fixed seeds and limits stated here (D19). The brief's five properties map onto them like this: brief 1 is CP1 and CP2, guarded by CP3; brief 2 is CP4; brief 3 is CP5; brief 4 is CP7 and CP8; brief 5 is CP9. The comparison counts a brief property as holding only if all its parts hold.

**CP1. Exact listeners get the exact answer** (Universal; R5, R6, R7, R8.2, R8.3). For any Step_Listener with true thresholds for each ear drawn from 20 dB below the floor to 20 dB above the cap, and any engine seed, with the shipped settings:
- true threshold at or below the floor: the ear is `betterThanFloor`
- true threshold above the cap: the ear is `worseThanCap`
- otherwise: the ear is `found` at the lowest Level_Grid level at or above the true threshold, so the estimate minus the truth is from 0 up to but not including 5 dB.

A Step_Listener never false-alarms, so no ear is unreliable.

**CP2. Accurate or flagged** (Statistical; brief property 1). For each parameter set drawn from the Plausible_Range (100 sets, fast-check seed 20261116), run 400 rooms with engine and listener seeds derived from the set. At least 93 percent of the 800 ear results are Accurate or Flagged. The target is 95 percent. The 2 point margin keeps a set whose real rate is at the target from failing on sampling noise (D19).

**CP3. Useful for attentive listeners** (Statistical; guards CP2 against an engine that flags everything). For each parameter set from the Attentive_Range (50 sets, seed 20261117), over 400 rooms, at least 88 percent of ear results are Accurate and not Flagged, and at most 10 percent are Flagged. The target is 90 percent.

**CP4. Every room ends** (Universal; R10, brief property 2). For any settings from the valid-settings generator, any engine seed, and any responder, the room finishes after at most `roomTrialLimitCount` responses, each ear has at most `trialLimitPerEarPerRoomCount` presentations, and `respond` is never asked for more. Responders: a scripted array of responses, a fast-check function from trial to response (which lets the answer depend on the ear, level and trial number), every Extreme_Listener, and Psychometric_Listeners from the Plausible_Range.

**CP5. Levels stay in range and climb gently** (Universal; R5.4, R5.5, R5.7, brief property 3). Same inputs as CP4. Every requested level lies from floor to cap and on the Level_Grid. For each ear, every level is at most one upward step above that ear's previous level in the room.

**CP6. The result agrees with its own record** (Universal; R4, R5, R6, R7, R8, R11). Same inputs as CP4. An independent oracle in `tests/properties/checks/ear-oracle.ts` replays each ear's presentations from the trial records. It recomputes each level and direction and the ear's ending, then the final state with its reasons, the counts, the false alarm count and rate. Everything must equal the engine's result. The oracle is written from the requirements, not by calling engine modules. It shares only `atLeastFraction` and `atMostFraction`.

**CP7. The no-sound share is always in range** (Universal; R9.3, R9.4, brief property 4). Same inputs as CP4. Every finished room's no-sound share lies from the minimum to the maximum, inclusive, as judged by `atLeastFraction` and `atMostFraction`.

**CP8. No-sound positions cannot be predicted** (Statistical; R9.1, R9.5, brief property 4). Run 2000 rooms with Psychometric_Listeners from the Plausible_Range (seed 20261118). Let r be the share of all trials that are no-sound trials. For each value of each feature below that occurs on at least 400 trials, the share of those trials that are no-sound trials lies within r ± 0.10:
- trials since the last no-sound trial in the room: 1, 2, …, 7, 8 or more, or none yet
- position in the room: 1, 2, …, 10, 11 or more
- the kind and outcome of the previous trial: caught, wrong side, missed, false alarm, no response, or none
- the ear of the previous sound trial, or none.

The check also reports, without a limit, the share of search trials on which the share maximum forced a sound trial and the share of rooms that needed closing trials (D8, D9).

**CP9. Same seed, same responses, same room** (Universal; R1.5, brief property 5). For any valid settings, any seed, and any responder, two searches created from the same seed and given the same responses produce deep-equal sequences of steps.

**CP10. Gaps do not depend on the trial** (Universal and Statistical; R3.6). Universal: every gap is an integer from the minimum to the maximum. Statistical, over the 2000 rooms of CP8: the mean gap of no-sound trials and of sound trials differ by at most 50 ms, and so do the mean gaps of left and right trials. For a uniform 1500 to 4000 ms gap the standard error of each mean is under 10 ms.

**CP11. Ears are mixed at random** (Statistical; R3.7, R3.8). Over the 2000 rooms of CP8, consider the sound trials made while both ears were still searching. A trial counts if its number is not after either ear's last presentation. Left makes up 47 to 53 percent of them. The chance that a trial is left after a left trial and after a right trial differ by at most 0.05. After one ear's last presentation, every sound trial is for the other ear.

**CP12. Extreme listeners** (examples and one Statistical; R8, R10, R13.5). With the shipped settings:
- never answers: both ears `worseThanCap`, each after exactly 10 presentations, false alarm count 0
- always answers, always answers on the wrong side, always presses left: both ears `unreliable` with the reason `falseAlarmRate`, and the room ends
- answers at random: over 500 rooms (seed 20261119), both ears are `unreliable` in at least 95 percent of rooms.

**CP13. Settings validation** (Universal; R2). Every settings object from the valid-settings generator is accepted. For each rule in R2.3 to R2.9, a mutation of a valid object that breaks only that rule is rejected with a `RangeError` whose message names the field.

The other checks are examples, not properties. They are the worked traces A to H, the response classification table, the frozen-object checks and the config value checks.

## Testing strategy

### Simulated listeners

All listener code lives in `tests/listeners/` and uses only the types in `listener-types.ts`:

```ts
export type ListenerEar = "left" | "right";
export type ListenerResponse = ListenerEar | "none";
export type ListenerTrial =
  | { readonly kind: "sound"; readonly ear: ListenerEar; readonly levelDb: number }
  | { readonly kind: "noSound" };
export interface SimulatedListener {
  respond(trial: ListenerTrial): ListenerResponse;
}
```

`createPsychometricListener(parameters, random)` follows R13.1 to R13.4. Its logistic function is `F(L) = 1 / (1 + exp(−(L − T) × 2 ln 9 / widthDb))`, which runs from 0.1 to 0.9 over `widthDb` centred on `T`. Its random draws per trial are in a fixed order: detection, then side (for a detection) or false alarm and side (for a non-detection).

`extremeListeners` holds the five listeners of R13.5, each as a factory taking a `RandomSource`.

`listener-parameter-arbitraries.ts` exports fast-check arbitraries for the Plausible_Range and the Attentive_Range in D17. Values are drawn on a grid (0.1 dB, 0.001 for rates) so that counterexamples print short.

Unit tests for the listeners check behaviour, not code. Over 20 000 trials with fixed seeds, the detection rate at T is within 0.02 of (1 − lapse)/2, at T + width/2 within 0.02 of 0.9 × (1 − lapse), and the false alarm and wrong-side rates are within 0.02 of their settings. A width of 0 behaves as a step.

### `SearchUnderTest` and the checks

```ts
export interface SearchUnderTest {
  readonly name: string;            // "spec" or "no-spec"
  readonly takesSettings: boolean;
  readonly takesSeed: boolean;
  runRoom(input: {
    seed: number;
    settings: ThresholdSearchSettings;
    listener: SimulatedListener;
    trialBudget: number;            // the harness stops a run that asks for more trials than this
  }): RoomRun;
}

export interface RoomRun {
  readonly ending: "finished" | "budgetExceeded" | "threw";
  readonly error?: string;
  readonly trials: readonly RunTrial[];
  readonly ears: Readonly<Record<ListenerEar, RunEarResult>>;
  readonly falseAlarmRateFraction?: number;
}

export interface RunTrial {
  readonly kind: "sound" | "noSound";
  readonly ear?: ListenerEar;
  readonly levelDb?: number;
  readonly gapBeforeMs?: number;
  readonly response: ListenerResponse;
}

export type RunEarResult =
  | { readonly state: "found"; readonly thresholdDb: number }
  | { readonly state: "betterThanFloor" | "worseThanCap" | "unreliable" }
  | { readonly state: "unreported" };
```

`specSearchUnderTest` wraps `createThresholdSearch` and maps one to one. It also exposes the full `RoomResult` to spec-only checks (CP6, CP12) through a second function, `runSpecRoom`. Harness-neutral checks never use that function. `searchesUnderTest` is the registry the CLIs read, `{ spec: specSearchUnderTest }` on `main`. On the measurement branch it lists only the no-spec adapter, because the spec engine is not there.

Each module in `tests/properties/checks/` exports one check: its id (for example `"CP5"`), the brief property it belongs to (if any), whether it is harness-neutral, and either a builder of a fast-check property with the parameters it must run with, or a function that computes population metrics and a verdict. A property test file calls `fc.assert(check.property(specSearchUnderTest, settingsArbitrary), check.parameters)`, so fast-check prints the seed and shrunk counterexample as the scaffold requires. The CLI `run-brief-properties.ts --search <name>` calls `fc.check` with the same parameters and writes a JSON summary: for each brief property and its parts, whether it holds, the first counterexample if any, and the metrics. It also includes the population numbers from `measurePopulation`.

Harness-neutral checks: CP1, CP2, CP3, CP4 (ending and per-ear limit; the room total is spec-only), CP5, CP7, CP8, CP9, CP10. Spec-only checks: CP6, CP11, CP12, CP13 and the room-total part of CP4. Harness-neutral check modules import nothing from `src/engine` except the types in `search-types.ts`, and nothing from spec-only modules, so they can be copied to the measurement branch as they are.

Checks that run over settings take the settings arbitrary as a parameter. The spec's Vitest files pass either the shipped settings or a valid-settings generator (`valid-settings-arbitrary.ts`, which filters through `validateSearchSettings`), as each property says. The CLI passes `fc.constant(hearingMethodConfig)`, so the comparison runs every check with the shipped settings (D21).

`classifyAccuracy(earResult, trueThresholdDb, settings)` returns `"accurate"`, `"flagged"` or `"wrong"` as defined in D18. An `"unreported"` result is `"wrong"`.

### Statistical properties

They run with fixed seeds so that CI is stable. A failure is then a real finding about the code, not a bad draw. Their limits are stated with a margin under the target (D19). Universal properties keep fast-check's random seed, so every CI run explores new cases. Heavy tests set their own Vitest timeout (60 s for CP2 and CP8, 30 s for the rest). The whole suite must stay under 3 minutes (R14.7). If it does not, the run counts drop in this order: CP3 to 30 sets, CP2 to 60 sets. Any such change is recorded in Decisions.

### Counterexamples

See D20. Regression tests live in `tests/properties/threshold-search-regressions.test.ts`. Each is named `regression <n>: <what went wrong> (<property>, seed <s>)`, uses hard-coded listener parameters and seeds, and asserts the property's condition for that case alone.

### Requirement coverage

| Requirement | Verified by |
|---|---|
| R1 | `npm run lint` (import boundary, injection and sound API rules from the scaffold); CP9; all tests run under Node |
| R2 | `validate-search-settings.test.ts`, `room-limits.test.ts`, CP13 |
| R3 | `threshold-search.test.ts` (first trial, repeated `current()`, numbering, frozen objects), CP10, CP11 |
| R4 | `classify-response.test.ts`, `threshold-search.test.ts` (errors leave state unchanged), CP6 |
| R5 | `ear-search.test.ts` traces, CP1, CP5, CP6 |
| R6, R7 | `ear-search.test.ts` traces A to H, CP1, CP6 |
| R8 | `finalize-ear-result.test.ts`, trace E, CP6, CP12 |
| R9 | `no-sound-schedule.test.ts`, CP7, CP8 |
| R10 | CP4, CP12 |
| R11 | `threshold-search.test.ts`, CP6 |
| R12 | `hearing-method-config.test.ts` |
| R13 | `psychometric-listener.test.ts`, `extreme-listeners.test.ts` |
| R14 | the property files themselves; the regression file; the suite's run time |
| R15 | `measure-population.test.ts` (small population, two runs give equal rows); running the script twice and comparing files |
| R16 | the Comparison_Document and the two JSON files it cites |
| R17 | the final checks in tasks 13 and 15 |

## Scatter data

`tests/listeners/write-scatter-data.ts [--search spec]` calls `measurePopulation(search, { listenerCount: 3000, seed: 20261120, settings: hearingMethodConfig })`. That draws 3000 parameter sets from the Plausible_Range, runs one room each, and returns one row per ear. The script writes `docs/experiments/threshold-search-scatter-<name>.csv` with a header row and these columns:

`listener,ear,trueThresholdDb,widthDb,lapseFraction,falseAlarmFraction,wrongSideFraction,state,estimateDb,accuracy,trialCount`

`estimateDb` is the threshold for `found`, the floor for `betterThanFloor`, the cap for `worseThanCap`, and empty for `unreliable`. `accuracy` is the output of `classifyAccuracy`. Numbers are written with a fixed number of decimals and rows in listener order, so the file is byte-identical between runs (R15.3). The script prints the count and share of Accurate, Flagged and Wrong ears. The plot itself is drawn later for the write-up from this file.

The script lives in `tests/listeners/` because it needs the listeners, and the scaffold's lint rules forbid `tools/` from importing `tests/` (D22).

## Comparison experiment

The comparison is the last part of the spec (tasks 14 and 15). It is the first time anyone working on this spec reads the No_Spec_Version.

1. Create the branch `experiment/no-spec-measured` from `experiment/no-spec`, in a separate git worktree outside the repository directory, so the main working tree is not touched. `experiment/no-spec` itself is never changed (R16.2).
2. Copy into it, unchanged from `main`: the harness-neutral files of `tests/listeners/` (everything except `spec-search-under-test.ts`), the harness-neutral modules of `tests/properties/checks/` with `run-brief-properties.ts`, `src/engine/search-types.ts` (types only), and the `src/config` files they import. Copy them under paths that do not collide with the no-spec code. If the no-spec branch has its own file at one of those paths, put the copy under `tests/` instead and adjust only import paths.
3. Read the No_Spec_Version and write `tests/listeners/no-spec-search-under-test.ts`. The adapter follows D23: it translates and never decides.
4. Run `run-brief-properties.ts --search no-spec` there and `--search spec` on `main` at the measured commit. Both use the same seeds, run counts, listener ranges and settings (or the no-spec version's own values where it cannot take settings).
5. Write `docs/experiments/spec-vs-no-spec.md` on `main` (R16.6 to R16.8). Its numbers come from `brief-properties-spec.json`, `brief-properties-spec-first-run.json` and the no-spec JSON, which is committed on the measurement branch and copied to `main`.

The document has: what each version is and the commits measured; how the comparison was run; a table of the five brief properties against the two versions (holds, does not hold with the first counterexample, or not checkable); the population table (Accurate, Flagged, Wrong, median and largest trials per room); the spec version's first-run row; anything the adapter could not map; and the limits of the comparison. Those limits are: simulated listeners only, one author, one run of a plain prompt, and nothing here says how well either version works for people. It follows `wording.md`: it says "holds" and "does not hold" and avoids the banned words.

## How the design serves the steering

- **Audio safety.** Rule 2: the engine never requests a level above its cap, and the output stage still enforces its own cap (D14). Rule 4: CP5 checks that no ear's level rises by more than one upward step within a room. Rule 5: a no-sound trial carries no ear and no level, so the output stage has nothing to route. The worse-than-cap rule stops after at most three presentations at the cap (D4).
- **Product.** The four end states and "a number only for found" follow `hearing-method.md`. The room result carries every trial so that ripples, the replay and the stored result are all drawn from one record.
- **No leaks.** Gaps are drawn the same way for every trial (CP10) and no-sound positions do not follow a learnable pattern (CP8). What reaches the screen is the session's and the interface's business. The engine's trial objects, including `direction` and `phase`, are for the session and must not be drawn before an answer.
- **Structure.** The engine imports only `config`. Every number that decides a level, a gap or a result is a settings field. Levels end in `Db`. Ears are `left` and `right`.
- **Tech.** No runtime dependency. Randomness is injected. No clock.
- **Wording.** No visitor-facing text is written here. State names in code (`betterThanFloor`) are not shown to visitors. Commit messages avoid the banned words (D20).

## Decisions

Each point below was open in the brief, the steering files or the architecture and was settled here without being able to ask.

**D1. The threshold rule: at least 2 ascending catches at one level, making up at least half of the ascending presentations there.** `hearing-method.md` says "at least 2 of 3 presentations reached while rising" and marks the exact wording as unverified, because the guideline text had not been read. While writing this spec I read the ASHA 2005 guideline (see Sources). It defines threshold as the lowest level at which responses occur in at least half of a series of ascending trials, and sets two responses out of three presentations at a single level as the minimum, citing ANSI S3.21-2004. The ANSI standard itself was not read. The steering file is not changed by this spec, so the rule stays marked unverified there.

Two readings fit the steering text. In the first, only the first three ascending presentations at a level count, so a level with one catch in three is closed for good. In the second, a level keeps counting, and it qualifies once it has at least 2 catches and they are at least half of its ascending presentations. With exactly three presentations both readings say "2 of 3". The second also matches the guideline's "at least half", and it does not close a level after two unlucky lapses, which would push the estimate up by a whole step (trace F). I chose the second. The search stops as soon as any level qualifies, as in manual practice. At that moment no quieter level has qualified, so it is "the quietest level" that meets the rule. (D40 refines this: below the cap, the search does not stop while the level one step quieter could still qualify on its next ascending presentation.) The numbers 2 and one half are config fields (`thresholdCatchesMinCount`, `thresholdCatchShareMinFraction`), because `structure.md` keeps every number that affects scoring in `src/config`.

**D2. "Reached while rising" means the ear's previous presentation was not caught.** A presentation is ascending when the same ear's previous presentation was a miss or a wrong side, descending when it was a catch, and `first` for the ear's first presentation in the room. A presentation held at the cap after a miss is ascending, because the search was trying to rise. A presentation held at the floor after a catch is descending. Direction comes from the previous outcome and not from comparing levels, so the clamped cases need no special rule. A consequence: no ascending presentation can happen at the floor, so `found` is never at the floor. A visitor who keeps catching the floor ends `betterThanFloor`.

**D3. Better than floor: 2 catches at the floor that make up at least half of the presentations there, in any direction.** The steering says only "the visitor still caught the quietest sound the product will play". Presentations at the floor are never ascending (D2), so the ascending rule cannot apply. Two catches at the floor, using the same minimum share as D1, make it a repeated catch and not a single lucky one. A miss at the floor sends the search up, and the floor can still qualify later. The count is the config field `floorCatchesForBetterThanFloorCount`.

**D4. Worse than cap: 2 ascending non-catches at the cap, checked after the found rule.** The steering says "the visitor did not catch the loudest sound the product is allowed to play". The search cannot rise further, so it must stop. Two misses at the cap, with the found rule checked first on each presentation, end the ear after at most three presentations at the loudest level (M M, C M M or M C M). The other cap outcomes, C C, C M C and M C C, are found at the cap. Unlike D1, the cap is closed after two misses. This limits how often the loudest sound is played, in line with the spirit of `audio-safety.md`. The count is the config field `capMissesForWorseThanCapCount`.

**D5. "Responses were inconsistent" means a catch at least 10 dB quieter than the result.** The steering lists inconsistency as a reason for unreliable but does not define it. A catch well below a found threshold, or any catch well below the cap for an ear that ended worse than cap, is the visible trace of guessing. A visitor who presses at random names the right side half the time, and those false catches are what drag an estimate too low. The margin is one downward step (10 dB): the search itself moves by that much after a catch, so a catch that far below is not explained by the step pattern. It is the new config field `inconsistentCatchMarginDb`. It is a design choice with no source and is expected to be tuned, first by the property tests and later by listening. Misses far above the threshold (lapses) are not used. They push the estimate up, and the threshold rule (D1) already tolerates single lapses. Wrong-side answers are not used either (D16).

**D6. The trial limit counts presentations per ear. The room limit is derived from it.** `trialLimitPerEarPerRoomCount` (20) bounds the sound trials for each ear. No-sound trials are not for an ear and are bounded by the share maximum instead. The largest room therefore has 40 sound trials and at most 13 no-sound trials (13/53 ≤ 0.25 and 14/54 > 0.25), 53 trials in all. Every ending needs at least two presentations with the shipped settings, so a room has at least 4 sound trials. Settings validation checks that, for every possible number of sound trials from that minimum to the maximum, some whole number of no-sound trials puts the share in range (R2.9). Without this, the closing trials of D8 might be unable to reach the minimum without passing the maximum. With the shipped settings the check holds from 4 sound trials upwards (4 sound trials take 1 no-sound trial, 20 take 4 to 6). The per-ear lower bound used by the share maximum (`remainingPresentationsLowerBound`) is valid because one presentation raises any one ending's count by at most 1.

**D7. The false alarm rule is applied per room. The visit-level rule belongs to the visit flow.** The brief says both ears' results for the room are marked unreliable above the limit. `hearing-method.md` says the visit's result is marked unreliable, and brief 06 shows a visit-level notice. The engine sees one room, so it applies the brief's room rule and reports the counts. Pooling the counts across rooms and deciding about the whole visit is left to the visit-flow spec, which can use the same limit. "Above" is strict, as the config comment says: 3 false alarms in 10 no-sound trials is exactly 0.3 and still reliable. A room without no-sound trials cannot happen with the shipped settings, but if settings allow it, the rate is reported as 0 and the rule does not apply.

**D8. No-sound trials: an independent draw per trial, a guard for the share maximum, and closing trials for the minimum.** The brief asks for two things that pull against each other: a share inside 15 to 25 percent in every room, and positions that cannot be predicted. Room length depends on the answers and is not known in advance. Alternatives considered:
- Blocks of 4 to 6 trials with one no-sound trial each, or no-sound trials spaced 3 to 5 trials apart: the share is guaranteed, but after a no-sound trial the next few are certainly sounds, and after the longest gap a no-sound trial is certain. That is exactly the learnable pattern the steering forbids.
- A plain independent draw with no guard: unpredictable, but the share of a 30-trial room falls outside 15 to 25 percent in a large fraction of rooms.
- A controller that raises or lowers the chance according to the running share: fewer forced trials, but more numbers to justify, and the chance then depends on history all the time instead of only at the edges.

I chose the simplest scheme that guarantees the share. Each search trial is a no-sound trial with probability `noSoundTrialProbabilityFraction`, 0.2, the middle of the steering's range. The draw is independent of everything else. Only when one more no-sound trial could push the final share over the maximum, in the case where the room ends with the fewest sound trials still possible, is the trial made a sound trial. After both ear searches end, no-sound "closing" trials are added if the share is below the minimum. The guard and the closing trials are the only places where a trial's kind is not a free draw. CP8 checks that this leaves no usable pattern, and CP7 checks the share. The frequency of forced and closing trials is reported but has no limit. It is expected to be a few percent of trials, and if it turns out large, the controller above is the next step. The probability is a config field because it decides how many no-sound trials there are.

**D9. What "cannot be predicted" means in a test.** Strict independence from history is impossible together with a guaranteed share (D8). The visitor also cannot see which trials were silent, except through the "I made no sound that time" line after a false alarm. So the test asks whether any simple pattern a person could learn gives an edge: trials since the last silence, position in the room, the previous outcome, and the previous ear. For each value of each feature with enough data (400 trials), the share of no-sound trials must be within 0.10 of the overall share, about 0.2. That rules out any certain or near-certain position under those features. It does not rule out a predictor that tracks the search state of both ears, which a visitor cannot see. This is a choice and is stated in the Comparison_Document.

**D10. While both ears are searching, each sound trial goes to either ear with equal chance. Nothing balances them.** Any balancing rule, such as no more than three in a row on one side, makes the next side predictable after a run. A known cost: once one ear's search has ended, every sound comes from the other side. A visitor who noticed could press that side every time. They would then also press on every no-sound trial, and the false alarm rule would mark the room unreliable. Playing extra sounds to the finished ear would add trials, levels and rules that the brief does not ask for. The cost is accepted and recorded here.

**D11. Gaps are whole milliseconds drawn uniformly from the configured range, the same way for every trial.** Whole milliseconds are enough for scheduling and print cleanly. The gap is drawn after the kind and the ear, but from the same formula and range for every trial, so its distribution cannot depend on either (CP10). The first trial of a room also has a random gap. Any pause the session adds when a room starts is its own business.

**D12. The engine is given the raw response and classifies it itself.** The architecture lists outcomes as the engine's input. Taking `"left"`, `"right"` or `"none"` instead keeps the scoring rule in one place. It also makes impossible inputs impossible: a session could otherwise report a catch for a no-sound trial. The architecture's outcomes are exactly what `classifyResponse` returns and what each trial record holds.

**D13. The engine is a stateful object with `current()` and `respond()`.** A purely functional `(state, response) → state` interface would need the random generator's state inside the engine state, but `RandomSource` keeps its state in a closure. The object holds its state privately and returns only frozen values, so callers cannot change it. All random draws happen inside `respond` and at creation, never in `current()`.

**D14. Settings are the config field names, validated strictly. Levels are integers on one grid.** The engine's settings type is a `Pick` of `HearingMethodConfig`, so the shipped object passes unchanged and there is one vocabulary. Validation requires integer levels and steps, a downward step that is a whole multiple of the upward step, and floor and cap on the grid of the starting level. With those, every level the search can reach is on one 5 dB grid. Levels are exact numbers and can be map keys. A search that has dropped by a downward step returns to the same level by upward steps. CP1's exact answer depends on this: with an off-grid floor, a clamped level starts a second grid and an ascending run can alternate between two levels without ever repeating one. `hearing-method.md` warns that the floor may be raised after testing Bluetooth headphones. A new floor must then sit on the grid, for example −65 or −60 rather than −62, or the start must move with it. The error message says so. The engine's cap is the cap relative to the anchor. The absolute digital ceiling belongs to the output stage, which still clamps and logs (audio-safety rule 2). If a loud calibration makes the effective ceiling lower, the visit-flow spec can pass a lower `capRelativeToAnchorDb`, rounded down to the grid, so that "worse than cap" refers to the loudest level actually played.

**D15. Six new config fields.** `structure.md` allows no number that affects scoring outside `src/config`, so the rule constants of D1, D3, D4, D5 and D8 become fields: `thresholdCatchesMinCount` 2, `thresholdCatchShareMinFraction` 0.5, `floorCatchesForBetterThanFloorCount` 2, `capMissesForWorseThanCapCount` 2, `inconsistentCatchMarginDb` 10, `noSoundTrialProbabilityFraction` 0.2. The first two come from the method. The next two mirror it at the floor and the cap. The last two are design choices. None of them is in the initial values table of `hearing-method.md`. Adding them there is a steering change for the project owner, so this spec only records it. The equal chance per ear (D10) and the uniform gap (D11) use no constants: they are written as `floor(u × count)` and `min + floor(u × (max − min + 1))`.

**D16. Wrong-side answers are counted but never make an ear unreliable on their own.** The steering says only that they count as a miss and are recorded separately. Many of them on one ear might mean confused sides or swapped earpieces, but the calibration step already checks left and right, and there is no source for a limit. They are reported in `wrongSideCount` for the result page and the swapped repeat to use.

**D17. The listener model and its parameter ranges are design choices, not data.** No source in the steering gives psychometric slopes, lapse rates or false alarm rates for visitors with consumer headphones, and none was looked up for this spec. The model is the standard one for a yes-no task with a side report. A logistic detection function is scaled by (1 − lapse). A detected sound is named on the wrong side with the wrong-side rate. Any undetected trial, silent or not, draws a false alarm with a random side. That last point matters: a guesser names the correct side half the time, which is how guessing produces false catches below threshold.

| Range | True threshold | Width (10 to 90 percent) | Lapse | False alarm | Wrong side |
|---|---|---|---|---|---|
| Plausible | floor to cap, each ear on its own | 1 to 8 dB | 0 to 0.10 | 0 to 0.50 | 0 to 0.10 |
| Attentive | floor to cap | 1 to 4 dB | 0 to 0.02 | 0 to 0.02 | 0 to 0.02 |

The width stops at 8 dB because "within 5 dB" cannot hold for arbitrarily shallow listeners, whatever the engine does. A 5 dB step search on a listener whose detection rises from 10 to 90 percent over 15 dB is spread wider than the tolerance. The false alarm range goes far past the 30 percent limit so that CP2 covers guessers the rule should catch and those it barely misses. The Extreme_Listeners follow the brief's list. "Always answers" names a random side. "Always answers on the wrong side" also answers every no-sound trial, because it always answers. "Always presses left" is added to cover a stuck key and the one-ear-left case of D10. Changing a range later counts as changing the property (R14.6).

**D18. "Within 5 dB" for each end state.** The True_Threshold is the 50 percent point of the listener's logistic function, before lapses. A found estimate is Accurate when it is within 5 dB of it, inclusive. Better than floor and worse than cap are claims too ("quieter than this house can whisper"), so they are held to the same standard. Better than floor is Accurate when the true threshold is at most 5 dB above the floor. Worse than cap is Accurate when it is at least 5 dB below the cap. An unreliable result is Flagged, never Accurate. The ascending 2-of-3 rule tends to land a little above the 50 percent point. With 5 dB steps the estimate for a step listener is 0 to under 5 dB above the truth (CP1), so most of the tolerance is used upward. That is a property of the method, and the property tests measure it rather than hide it.

**D19. Universal and statistical properties, and their limits.** The brief states property 1 for every listener. For a listener whose answers are random, any engine produces a wrong unflagged answer with some small chance, so a literal "for every run" property would eventually find a counterexample in every engine. The rendering here keeps "for every listener" and makes each check a rate. For every parameter set in the range, at least 95 percent of that listener's ear results must be Accurate or Flagged. fast-check searches the parameter space and shrinks toward the worst region, so a counterexample is a reproducible kind of listener, not one unlucky run. Exact listeners (CP1) keep the literal "always" form. Each statistical limit sits 2 points under its target: 93 percent for a 95 percent target, measured over 800 ear results. The standard error near 95 percent is about 0.8 points. So a listener whose true rate is at the target fails with a chance well under 1 percent, while one at 90 percent fails almost surely. CP3 exists because "accurate or flagged" alone is met by an engine that flags everything. Its 90 percent target for attentive listeners is a choice. Fixed seeds for statistical checks keep CI stable. Universal properties keep random seeds and at least 200 runs.

**D20. A counterexample is committed first as an expected failure.** `tech.md` asks for the counterexample as a named regression test, with the fix in a separate commit. If the test is committed in its failing form, the suite is red between the two commits. Instead, the first commit adds the regression with Vitest's `it.fails`, which records that the case currently breaks and keeps the suite green. The fix commit changes `it.fails` to `it`, changes the engine, and adds a decision here (D31 onwards) saying what was wrong and what changed. Commit messages follow `wording.md` (they are named there), so they say "regression case" and "handle", not "failing test" or "fix fail". Example: "Add regression case for guessed catches below threshold", then "Mark guessed catches below the found level as inconsistent".

The first complete run of the checks (D30) happens through the CLI, which reports and does not stop. A check that does not hold on that run has its Vitest property file committed with `it.skip` and a comment naming the regression case, so that every commit keeps `npm test` green and nothing is left uncommitted. The commit that makes the check hold removes the skip. A check that holds gets its active Vitest file at once. A counterexample found later, for example by a random seed in CI, follows the same two commits.

**D21. The brief's properties are written once, against an interface both versions can implement.** The brief asks for "the same properties against both versions". Rewriting them for the No_Spec_Version would make them not the same. So each check takes a `SearchUnderTest`, and listeners see only `ListenerTrial`. The interface reports only what the brief's properties need: trials with kind, ear, level, gap and response, and per-ear state and estimate. Checks that depend on this spec's own design (the oracle, the closing trials, the reasons) are kept spec-only and are not part of the comparison count. In the comparison every check runs with the shipped settings. Running CP4, CP5, CP7 and CP9 over random valid settings as well is an extra that the spec's own Vitest files add. It is not part of the brief's properties, and the No_Spec_Version may not take settings at all.

**D22. The scatter script lives in `tests/listeners/` and writes CSV only.** It needs the simulated listeners. The scaffold's lint rules forbid `tools/` from importing `tests/`, and `structure.md` keeps listeners in `tests/`. A file under `tests/` that is not named `*.test.ts` is not collected by Vitest, so the script does not run during `npm test`. The brief asks for the data. Drawing the plot with the 5 dB band is left to the write-up. The CSV is committed so that the write-up uses the same numbers the spec produced.

**D23. Rules for the no-spec adapter.** The adapter translates and never decides.
- It may rename fields, convert units, map the version's output names to the four states, and call its functions in whatever order its API requires.
- It never clamps, stops, flags, schedules, retries or filters.
- A state the version does not report is `"unreported"`. The adapter never infers `unreliable` or a boundary state from a missing number.
- A version that cannot take the shared settings runs with its own values, which the document records. Properties then use those values for floor, cap and limits.
- If the version draws from `Math.random`, the measurement run may replace `Math.random` with a seeded source for reproducibility. This changes no logic, and the document says so. Brief property 5 is still judged only on whether the version's own interface takes a seed.
- If it reads the clock or schedules callbacks, fake timers may drive it. If it touches audio or the DOM, those parts may be stubbed, but nothing in its decision logic may change.
- A property is "not checkable" when the version does not expose what it needs, for example no per-trial levels for brief property 3. It is then not counted as holding.
- Anything the adapter had to interpret is listed in the document.

The branch `experiment/no-spec-measured` keeps the evidence without changing `experiment/no-spec`, which the roadmap asks to keep as produced.

**D24. The room result carries every trial record.** The session also keeps a visit log. The engine's own records make the result self-checking (CP6), let regression tests show exactly what happened, and give brief 09's log validator the rules in executable form: replaying a stored log's responses with its seed must reproduce its trials (CP9).

**D25. The search starts at −25 and descends after catches, as the steering says.** The ASHA guideline's basic procedure starts below the expected threshold and ascends, with a familiarisation tone first. The steering's version starts at a moderate level so that the first sound is clearly heard, and the monster then gets quieter. That is the product's premise, and the found rule only counts ascending presentations either way. No separate familiarisation trial is added. The calibration step already plays sound at the anchor level.

**D26. Points that `hearing-method.md` marks as unverified, and what this spec chose.**
- *The exact wording of the 2 of 3 rule.* Still unverified in the steering. This spec read the ASHA 2005 guideline (not the ANSI standard it cites) and chose a reading consistent with both (D1). Recommended steering change: cite the guideline and state the reading.
- *Step sizes "documented by several audiometer makers".* The ASHA guideline gives the same 10 dB down and 5 dB up. The values are unchanged.
- *Hand rubbing at about 65 dB SPL.* Not used. The engine never converts a level to any other scale.
- *The 15 dB left and right difference for the swapped repeat.* Not used by this engine. It belongs to the swapped-repeat spec. The engine only reports per-ear results.
- *Ghost sounds are not pure tones.* The listener model is the same for any sound, so the property results say nothing about whether narrow-band sounds give the same thresholds as pure tones.
- *Bluetooth headphones may gate quiet sounds, and the floor may have to rise.* The floor stays a config value. Validation requires it to sit on the level grid (D14). CP1 to CP3 must be re-run after any change to the shipped values. CP4, CP5, CP7, CP9 and CP13 already run over random valid settings, so they keep holding after tuning.
- *Fear may affect thresholds.* Not modelled. The lapse and false alarm parameters are the nearest stand-ins.
- *Every initial value is expected to change after listening tests.* So are the six new fields (D15) and the listener ranges (D17).

**D27. Names of states and reasons in code.** `found`, `betterThanFloor`, `worseThanCap`, `unreliable`, and the reasons `trialLimit`, `inconsistentCatch`, `falseAlarmRate`. These are code identifiers, never shown to visitors. The visitor-facing phrases ("quieter than this house can whisper") belong to `src/copy` and the result-page spec.

**D28. The trial objects tell the session more than the screen may show.** `direction`, `phase`, `ear` and `levelDb` are on every trial because the session needs them to play the sound and to write the visit log. Showing any of them before an answer is a leak, and the house-interface spec's no-leak property covers it. The engine cannot enforce this. It only makes sure nothing in the data depends on more than it should, through CP8 and CP10.

**D29. Fractions are compared with a tolerance of 10⁻⁹.** Shares and rates are compared with configured decimals such as 0.15, which have no exact binary form. Without a tolerance, a count exactly at a limit could land on either side depending on rounding. Inclusive limits are what the steering means ("15 to 25 percent"), so the tolerance always favours the configured boundary. The constant lives in `fraction-comparisons.ts`. It is arithmetic, not a tunable number, and changing it cannot change any result with counts below a million.

**D30. The first complete run is kept for the comparison.** The brief expects property 1 to fail at first. The JSON written by `run-brief-properties.ts --search spec` before the first counterexample is handled is committed as `brief-properties-spec-first-run.json`. The comparison can then show what the spec produced before and after its own property tests corrected it. That is a fairer picture than the final version alone.

The decisions below were settled while implementing tasks 1 to 5, where the design above left a detail open.

**D31. The share maximum must be below 1, and R2.9 is checked through the smallest share that reaches the minimum.** `roomLimits` needs the largest number of no-sound trials that keeps the share at or below `noSoundTrialShareMaxFraction` with the most sound trials. With a maximum of 1 there is no largest number, so Room_Trial_Limit does not exist (R10.2), and with `noSoundTrialProbabilityFraction` also 1 a room would never end. R2.7 allows fractions up to 1 inclusive, so `roomLimits` throws a `RangeError` naming `noSoundTrialShareMaxFraction` when it is not below 1. Validation calls `roomLimits` at the start of its R2.9 step, so that error comes out of the R2.9 step. For each number of sound trials from Minimum_Room_Sound_Trials to twice the trial limit, the R2.9 step takes the smallest whole number of no-sound trials that reaches the share minimum and checks that it stays at or below the maximum. The share rises with the number of no-sound trials, so if the smallest one is above the maximum, every larger one is too. Both counts are found from their closed form and then moved to the exact boundary with `atLeastFraction` and `atMostFraction`, so validation and the engine agree about every boundary (D29). The R2.9 message names both share fields and the number of sound trials that has no fitting count.

**D32. `trialLimit` and `inconsistentCatch` never appear together.** R8.2 and R8.3 define an inconsistent catch only against a found threshold or the cap, so an ear that ended with the trial limit has no reference level and is never marked inconsistent. R8.5 fixes the order of the reasons, but all three cannot apply to one ear. Task 4 asks for a test of "all three together". `finalize-ear-result.test.ts` tests instead the two pairs that can occur, `trialLimit` with `falseAlarmRate` and `inconsistentCatch` with `falseAlarmRate`, each in the order of R8.5. It also checks that trace G, which caught levels 20 dB apart, gets only `trialLimit` and `falseAlarmRate`. Changing this would mean defining a reference level for a trial-limit ending, which is a change to R8 and is not made here.

**D33. Validation compares configured values exactly and treats a non-number as breaking the rule of its field.** The 10⁻⁹ tolerance of D29 applies where a count is compared with a configured fraction. Where validation compares one configured value with another (the share minimum against the maximum, the no-sound probability against the share range, the gap minimum against the maximum), it uses plain comparisons, because both sides are written by the same person and neither has a rounding error to absorb. Each rule is written so that `NaN`, `Infinity`, a string or a missing field breaks it, for example "positive" as `!(value > 0)`. A wrong type therefore gets a `RangeError` that names the field, like any other value outside its rule. Validation reads every field into the copy first and checks the copy, so a getter cannot return one value to the check and another to the engine.

**D34. Small choices in the engine code.**
- `roomLimits` doubles the per-ear counts by the length of a `["left", "right"]` list, not by a literal 2. That keeps R12.4 literal: the engine holds no number other than 0, 1 and the tolerance.
- `room-limits.ts` and `no-sound-schedule.ts` also export a named interface for their return values (`RoomLimits`, `NoSoundSchedule`), which the design writes inline. The shapes are the ones the design gives.
- `createThresholdSearch` validates the settings before it checks the random source, as the order of the sentences in "createThresholdSearch" suggests. Invalid settings with a missing random source therefore give a `RangeError`.
- `EarSearch.next()` and `EarSearch.presentations()` return frozen values, like everything else that leaves the engine.

The decisions below were settled while implementing tasks 6 to 8.

**D35. The listeners draw only what a trial needs, and the parameter arbitraries take the levels.**
- A Psychometric_Listener makes no detection draw on a no-sound trial, because there is nothing to detect. On a sound trial it draws detection first. After a detection it draws the wrong side. After a non-detection, and on every no-sound trial, it draws the false alarm, and only after a false alarm does it draw the side. So the number of draws per trial varies, but their order is fixed. The design leaves open whether every trial draws the same number of times. Nothing depends on that, because two runs of one listener on one search see the same trials and so make the same draws.
- A listener checks its own parameters and throws a `RangeError` for a rate outside 0 to 1, a negative width or a threshold that is not finite, so a mistyped test case fails loudly.
- The extreme listeners are named `alwaysAnswers`, `neverAnswers`, `answersAtRandom`, `alwaysAnswersWrongSide` and `alwaysPressesLeft`. Every factory takes a `RandomSource`, also those that draw nothing, so the five can be created the same way.
- `plausibleListenerParameters` and `attentiveListenerParameters` are functions of the floor and the cap, because D17 draws the true threshold "from floor to cap" and D23 lets a version that cannot take the settings run with its own floor and cap. The two ranges are also exported as data, `plausibleListenerRange` and `attentiveListenerRange`, so the arbitraries and the population draw (D36) read one table. A small test, `listener-parameter-arbitraries.test.ts`, checks that table against D17 and the grids.

**D36. Population draws are uniform, and the harness has one generous trial budget.**
- `measurePopulation` draws each listener's parameters with `drawListenerParameters`, uniformly on the grids of the range table (D35), from a `RandomSource` made from its one seed. For each listener in turn that source gives the six parameters (left threshold, right threshold, width, lapse, false alarm, wrong side), then the engine seed, then the listener seed, each seed as `floor(u × 2³²)`. fast-check is not used here, because its generation leans towards the ends of each range on purpose. That suits a search for counterexamples, but it would skew a population share and the scatter data. The property checks keep using the fast-check arbitraries.
- Listeners are numbered from 1. `trialCount` is the number of trials in the listener's room, the same on both ear rows. The summary holds the counts and shares of Accurate, Flagged and Wrong ears, the median trials per room (the mean of the two middle values for an even count), the largest, and the number of rooms stopped by the budget or ended by a throw.
- A run is stopped as `"budgetExceeded"` when the search asks for a trial after `trialBudget` trials have been answered, so a room that needs exactly its budget finishes. `RoomRun.trials` holds the answered trials only. Anything thrown while playing, by the search or the listener, ends the run as `"threw"` with the message. Ears of a run that did not finish are `"unreported"`.
- `runSpecRoom` takes the same input as `runRoom`. It throws an `Error` when the budget is exceeded and passes on whatever the engine throws, because the spec-only checks that use it treat either as a counterexample.
- `search-under-test.ts` also exports `generousTrialBudgetCount`, 1000. The harness-neutral checks and the population measure give every room this budget. It is far above any room that ends within its trial limit (53 trials with the shipped settings) and exists only to stop a search that would never end. The room total of R10.2 is checked separately with the spec's own `roomTrialLimitCount` (D38).

**D37. Worse than cap is Accurate when the true threshold is at most 5 dB below the cap.** D18 says worse than cap is Accurate "when it is at least 5 dB below the cap". Read literally, a listener with a true threshold of −40 who ended worse than cap would count as Accurate, which is the opposite of what D18 sets out to hold the boundary states to. The sentence mirrors the one for better than floor ("at most 5 dB above the floor"), so `classifyAccuracy` uses the mirror: worse than cap is Accurate when the true threshold is at or above the cap minus 5 dB. The 5 dB is `accuracyToleranceDb` in `classify-accuracy.ts`. It is the brief's definition of a property, not a value that affects the product, so it lives with the test code and not in `src/config`.

**D38. The shape of the check modules, and what the universal checks settle.**
- `tests/properties/checks/check-types.ts` defines a check: its CP id, an optional part name, a title, its brief property, its requirements, and either `property(search, settingsArbitrary)` (harness-neutral) or `property(settingsArbitrary)` (spec-only), with `parameters: { numRuns: 200 }` and no seed. Harness-neutral checks also have `notCheckableReason(search)`, which says when a search cannot be checked at all (CP9 for a search that takes no seed). Task 9 adds the statistical shape next to these. Files are named `cp<n>-<what>-check.ts` after their export, for example `cp5LevelsInRangeCheck`.
- Checks throw a plain `Error` through `checkThat(condition, message)` instead of using Vitest's `expect`, because the property CLI runs them outside Vitest. A check that meets a run without the data it needs, such as a trial without a level or a gap, throws `NotCheckableError`, so the CLI can record "not checkable" instead of "does not hold" (R16.5, D23).
- CP4 is two modules. `cp4-every-room-ends-check.ts` is harness-neutral: the room finishes within the generous budget of D36, and no ear has more than `trialLimitPerEarPerRoomCount` presentations. `cp4-room-trial-limit-check.ts` is spec-only: through `runSpecRoom` with a budget of `roomTrialLimitCount`, the room finishes without being asked for more (R10.2, R10.3). Both name brief property 2. The brief property count of the comparison uses only harness-neutral checks, as the design's list of harness-neutral checks says.
- Harness-neutral modules import `fraction-comparisons.ts` as well as `search-types.ts` from `src/engine`. The design says both that harness-neutral modules import only the types and that CP7, which is harness-neutral, judges the share with `atLeastFraction` and `atMostFraction`. The second is the reason for the first rule's exception: the two functions are arithmetic with no search logic, and using them keeps every version judged at the same boundaries. Step 2 of the comparison experiment therefore copies `fraction-comparisons.ts` with `search-types.ts`.
- The inputs shared by CP4, CP5, CP6, CP7 and CP9 come from `room-input-arbitrary.ts`: settings from the given arbitrary, an engine seed, and a responder from `responder-arbitrary.ts`. A responder is a factory, so every run starts a fresh listener in the same state. The four kinds are a scripted list of responses with a fallback once it runs out, a `fc.func` of the trial's kind, ear, level and position (the listener counts its own calls, so the position needs no field in `ListenerTrial`), each extreme listener with a seed, and a Plausible_Range Psychometric_Listener with a seed.
- CP9 runs the room once with the responder and once more from the same seed with a listener that replays the first run's responses, and compares the two `RoomRun`s with `isDeepStrictEqual`. That checks "same seed and same responses" directly, also for a responder whose answers are random.
- CP1 draws each ear's true threshold on a 0.1 dB grid from 20 dB below the floor to 20 dB above the cap, and expects the lowest Level_Grid level at or above it, `start + ceil((T − start) / up) × up`. Its listener is a Psychometric_Listener with width 0 and all rates 0.
- CP5 accepts levels within 10⁻⁹ dB of the floor, the cap, the grid and the one-step rise, so a version that computes levels in floating point is not failed by rounding. The spec engine's levels are integers, for which this changes nothing. CP5 checks the trials of an unfinished run as far as they go. CP7 checks finished rooms only, because an unfinished room has no final share and CP4 already reports it.
- `valid-settings-arbitrary.ts` draws steps of 1 to 10 dB up and 1 to 4 upward steps down, a start from −60 to 0 with the floor and the cap 0 to 20 upward steps away, gaps from 1 ms, shares on a 0.01 grid (minimum to 0.30, maximum up to 0.30 above it, probability between them), counts from 1 to 4, a trial limit from 1 to 30 and a margin from 1 to 30 dB. It builds values that meet the per-field rules and filters through `validateSearchSettings` for the rules across fields. A sample of 2000 took 45 ms, so the filter keeps most draws.
- CP13 pairs each valid settings object with one mutation from a fixed list that covers every rule of R2.3 to R2.9. Some mutations cannot apply to every object: the floor or the cap cannot be moved off a 1 dB grid, and the probability cannot go below a share minimum of 0. Those return nothing and that run checks only acceptance. A mutation may also break a later rule (a floor of −69.5 is also off the grid). Validation checks the rules in order, so the error still names the field. The R2.9 mutation sets the share minimum, maximum and probability all to 0.3137, which no room shorter than 10 000 trials can hit.
- The oracle also checks what the design lists for CP6 implicitly: trial numbers from 1 (R3.5), the outcome of every response (R4), the phase of every no-sound trial, that a closing trial is added only while the share is below its minimum and that the room does not stop below it (R9.3, R10.3), and that no ear is presented after it ended. It reports an ear whose records end while it is still searching as `undefined` with a mismatch.

The decisions below were settled while implementing task 9.

**D39. The statistical checks, the property CLI and the first run.**
- A statistical check has `kind: "statistical"`, its fixed seed, run counts and Vitest timeout in `parameters`, and `evaluate(search, settings)` (harness-neutral) or `evaluate(settings)` (spec-only), which returns `{ holds, firstCounterexample, metrics }`. The CP12 examples use the same shape with fixed seeds, because they are a list of rooms with a verdict and the CLI reports them like the other checks. The Vitest files and the CLI call the same `evaluate`, so they cannot disagree.
- CP2 and CP3 draw their parameter sets with `fc.sample` from the D17 arbitraries and the design's seed. Each set's 400 rooms take their engine and listener seeds from a source seeded with FNV-1a over the set's six values in a fixed order (`listenerSetSeed`). A counterexample is therefore replayed from its parameters alone, which is what a regression test needs. Only when a set is below its limit is `fc.check` run with the same seed and run count, to stop at a set below the limit and shrink it. The shrunk set is reported as the first counterexample, together with the first set below the limit in draw order. All per-set limits are judged with `atLeastFraction` and `atMostFraction` (D29).
- CP8, the statistical part of CP10 and CP11 share one population of 2000 rooms. It is drawn like `measurePopulation`, uniformly from the Plausible_Range with seed 20261118, through `tests/listeners/play-population-rooms.ts`, which `measurePopulation` now also uses with the same draw order and output. The rooms are played once per process and search. CP8's features are counted over every trial of every room, closing trials included, because a visitor meets those too. "The previous trial" is the trial just before, and "the previous sound trial" the latest sound trial before it in the room. CP11 compares each both-ear sound trial with the previous both-ear sound trial in the room.
- CP8's two unlimited figures come from different places. The share of rooms that needed closing trials is reported harness-neutrally as the share of rooms that end with a no-sound trial. For the spec engine these are the same rooms, because a search-phase no-sound trial is always followed by a sound trial. The share of search trials on which the share maximum forced a sound trial needs the engine's draws, so a spec-only report (`no-sound-schedule-report.ts`) replays the same 2000 rooms with a random source that counts its draws. A sound trial that made one draw fewer than its kind draw, ear draw (when both ears were searching) and gap draw would need was forced. On the first run 13.6 percent of search trials were forced sounds and 31.8 percent of rooms needed closing trials, which make up 2.0 percent of all trials. That is more forcing than D8 expected ("a few percent"). D8 sets no limit on it, and CP8 holds with a largest deviation of 0.060.
- The CP12 examples play 20 rooms for each listener, with engine and listener seeds drawn from 20261119. "Unreliable with the reason `falseAlarmRate`" is read as "the reasons include `falseAlarmRate`". Always pressing left, for example, also ends the right ear worse than cap, which is not a reason.
- `run-brief-properties.ts` loads the spec-only checks with a dynamic `import()` only for the search named `spec`, so that the same file runs on the measurement branch, where the spec engine does not exist. The spec-only results go in a `specOnly` section that the comparison does not count. The brief properties count only harness-neutral checks (D38). The population figures use the scatter data's population (3000 listeners, seed 20261120), so the CLI and the scatter file report the same numbers. The JSON also holds the fast-check seed of every universal check, the time each check took, and `workingTreeClean`, which is `false` for the first run because D30 has it run before the check modules are committed. It exits 0 whatever the checks find. Only a usage error, such as an unknown search name, exits 2, because that is not a report.
- The Vitest files of CP4, CP5, CP6, CP7, CP9 and the universal part of CP10 each run their check twice, with the shipped settings and with the valid-settings generator (D21). CP1 runs with the shipped settings and CP13 with the generator, as the design states them.
- The generated JSON files in `docs/experiments/` are listed in `.prettierignore`. They are output, written with `JSON.stringify(…, null, 2)`, and Prettier's JSON layout would otherwise make `npm run lint` report every new run.
- Vitest reports a test file without tests as an error, so the regression file holds one `it.todo` until the first case is added.

The decisions below were settled while implementing task 10.

**D40. A found level waits while the level one step quieter could still reach the rule.** Regression 1 (CP2, set seed 4263754660: left −55.1 dB, width 1 dB, all rates 0) and regression 2 (CP3, set seed 3252736698: left −0.1 dB, width 1 dB, all rates 0) showed the same mechanism in their trial records. A narrow listener 0.1 dB below a level of the grid catches that level about 61 percent of the time and the level above nearly always. Each ascending pass reaches the quieter level first, and every miss there hands the louder level an ascending catch. The search stopped as soon as the louder level had 2 catches, often while the quieter level held 1 catch in 2 and one more catch would have made it 2 of 3. The ear was then found 5.1 dB above the true threshold, which D18 counts as Wrong. In the first room of regression 1 the left ear went C C C M C M C M M M C, found at −50 after 11 presentations.

The change is a refinement of the threshold reading of D1 and stays within "at least 2 of 3 presentations reached while rising": a level that meets the found rule ends the ear only if the level one upward step below it could not meet the rule with one more ascending catch. While it could, the search simply goes on with the usual steps, so the quieter level gets its next ascending presentation. The found level is still a level with at least 2 ascending catches making up at least half of its ascending presentations, so it is now more often "the quietest level" in the steering's sense. Two exceptions keep earlier decisions intact. The floor is never open, because it never has ascending presentations (D2). The cap is never held back, so the loudest level is still played at most three times before the ear ends (D4). Trace H shows the rule, R6.5 states it, the oracle of CP6 checks it from its own count, and traces A to G are unchanged by it.

Measured with `npm run experiment:properties -- --search spec`, before and after:

| | Before | After |
|---|---|---|
| CP2 sets below 93 percent (of 100) | 36 | 26 |
| CP2 Accurate / Flagged / Wrong over 80 000 ears | 47.5 / 44.2 / 8.4 percent | 48.9 / 44.6 / 6.5 percent |
| CP3 sets below the limits (of 50) | 11 | 8 |
| CP3 Accurate / Flagged / Wrong over 40 000 ears | 92.5 / 2.3 / 5.2 percent | 94.2 / 2.4 / 3.5 percent |
| Regression 1 set, Accurate or Flagged | 78.0 percent | 85.75 percent |
| Regression 2 set, Accurate | 82.6 percent | 88.0 percent |
| Population of 3000: Accurate / Flagged / Wrong | 40.5 / 52.7 / 6.7 percent | 41.4 / 53.0 / 5.6 percent |
| Median trials per room | 28 | 30 |

Every other check still holds. Regression 2 now holds, at exactly its 88 percent limit (704 of 800 ears). Regression 1 does not, and neither does CP2 or CP3. D41 records why.

Two other changes inside what task 10 allows were measured and not made. Looking further ahead, so that the quieter level stays open until it could reach 2 catches however many presentations that takes, brought CP2 to 17 sets below its limit. But it made CP3 worse (13 sets below, 6.1 percent Flagged) because more ears ran into the trial limit, and it raised the median room to 40 trials. Setting `inconsistentCatchMarginDb` to 5 dB, which marks a single catch one step below the found level as inconsistent, brought CP2 to 18 to 19 sets below. But CP3 then had 35 to 38 sets below, with 12 to 16 percent of attentive ears Flagged, because an honest listener near a level of the grid catches the level below quite often. Both would trade a wrong number for an unreliable notice given to attentive visitors, which CP3 exists to prevent.
