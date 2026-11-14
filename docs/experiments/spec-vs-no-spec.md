# Threshold search: spec version, no-spec version and bare-prompt version

Three versions of the threshold search for one room were run against the same simulated listeners and the same checks of the five properties in `docs/briefs/01-threshold-search.md`. This document records what came out. The numbers describe simulated listeners only. They say nothing about how well any of the three versions works for people.

Every figure below comes from four files in this directory: `brief-properties-spec.json`, `brief-properties-spec-first-run.json`, `brief-properties-no-spec.json` and `brief-properties-bare-prompt.json`. The scatter files `threshold-search-scatter-<name>.csv` hold one row per ear of the same population.

## The versions and what each knew when it was written

| | Spec version | No-spec version | Bare-prompt version |
|---|---|---|---|
| Code | `src/engine/` on `main` | `src/engine/` on `experiment/no-spec` | `docs/experiments/bare-prompt/hearing_staircase.py` on `experiment/bare-prompt` |
| Commit of the code | a480f64 | aa9a0cc | df0f094 |
| Commit measured (code plus harness) | a480f64 | 99c8f3c on `experiment/no-spec-measured` | 39d5280 on `experiment/bare-prompt-measured` |
| Language | TypeScript | TypeScript | Python with numpy |
| Takes a seed and settings | yes and yes | yes and yes | yes and yes (its own `Config`, see below) |

**Spec version.** Written through this spec: requirements, design and tasks first, then code, from brief 01, every steering file, `docs/architecture.md` and the scaffold. The same spec wrote the simulated listeners, the listener ranges, the checks and their fixed seeds that this comparison uses, and its engine was changed after measuring with them (D40). It is the only version that was tuned against this harness.

**No-spec version.** Written by Kiro in plain chat with no spec, on a branch of this repository made from the scaffold (commit 7b89c0d), from the prompt "write a hearing threshold staircase for left and right ears with catch trials". It had read brief 01 with its list of five properties, in their first wording ("within 5 dB"), and its code cites `.kiro/steering/hearing-method.md` and the hearing method config. So it knew the method, the product's numbers and what it would be checked against. It wrote its own listeners and property tests. It did not see this spec's requirements, design, listener ranges, checks, seeds or the amended tolerance.

**Bare-prompt version.** Written by Kiro from the same one-line prompt in an empty folder, with no steering files, no brief and no config (D44). It knew nothing about the product, its levels, steps, limits or properties. It is a textbook 1-up 1-down staircase in dBFS, with steps of 8, 4 and 2 dB that shrink after reversals, a stop after 10 reversals, and the mean of the last 6 reversals as the threshold. The visitor answers only "heard" or "not heard", with no side.

## How it was run

- Each version was run on its own measurement branch, made from its branch in a git worktree outside the repository. The harness-neutral listener and check files were copied there unchanged from `main`, apart from import paths, with an adapter for that version. `experiment/no-spec` and `experiment/bare-prompt` were not changed.
- `npm run experiment:properties -- --search <name>` runs every harness-neutral check (CP1 to CP5, CP7 to CP10) with the shipped settings of `main` and writes the JSON file. The spec version's own checks (CP6, CP11, CP12, CP13 and the room total of CP4) depend on its design and are not counted here (D21).
- All three versions see the same listener model, the same parameter draws and the same seeds: 100 Plausible_Range sets for CP2 (seed 20261116), 50 Attentive_Range sets for CP3 (seed 20261117), 2000 rooms for CP8 and CP10 (seed 20261118) and a population of 3000 listeners (seed 20261120).
- A brief property holds only if every check that belongs to it holds. Brief property 1 is CP1, CP2 and CP3. Property 2 is CP4, property 3 is CP5, property 4 is CP7 and CP8, and property 5 is CP9.

### Two measures of accuracy

The tolerance of property 1 was amended by the project owner on 2026-11-14, after the spec version's first complete run (D41, D42). Both measures are reported for every version.

- **Accurate** (the amended property 1). Take the lowest level of the 5 dB grid that starts at −25 at or above the listener's true threshold. A found estimate is Accurate when it is that level or lies within one 5 dB step either side of it. Measured from the true threshold, the band runs from 5 dB below to just under 10 dB above. An estimate off the grid is judged against the same interval.
- **Within 5 dB** (the first wording). A found estimate within 5 dB of the true threshold, either way.

Unreliable results are Flagged under both measures. Wrong means neither Accurate nor Flagged under the measure in question. The amended band suits a search that lands at or above the true threshold, as the 2 of 3 rule on a 5 dB grid does. A search that takes the mean of its reversals, like the bare-prompt version, lands on either side of the true threshold, and an estimate a little below it can fall outside the band while lying within 5 dB.

## The five brief properties

| Brief property | Spec version | No-spec version | Bare-prompt version |
|---|---|---|---|
| 1. Accurate or flagged | does not hold (CP2) | holds | does not hold (CP1, CP2, CP3) |
| 2. Always ends within the trial limit | holds | holds | holds |
| 3. Levels in range, rising by at most one upward step | holds | holds | does not hold (CP5) |
| 4. No-sound share in range, positions not predictable | holds | does not hold (CP8) | does not hold (CP7) |
| 5. Same seed and same answers give the same trials | holds | holds | holds |
| Holding | 4 of 5 | 4 of 5 | 2 of 5 |

Every check of every version could be run. None is reported as not checkable.

### First counterexample of each property that does not hold

**Spec version, property 1.** CP1 and CP3 hold. CP2 has 1 of 100 Plausible_Range sets below its limit of 93 percent Accurate or Flagged: a guesser just under the false alarm limit (left 11.2 dB, right 14.7 dB, width 4.3 dB, lapse 0.062, false alarm 0.299, wrong side 0.006, set seed 1113057956), with 92.5 percent. fast-check shrinks it to left 4.2 dB with the rest unchanged (set seed 4040559320): 17.5 percent Accurate, 74.3 Flagged, 8.3 Wrong. Its Wrong ears are found well below the true threshold, for example at −10 and −15 for a true threshold of 4.2. D43 reads the cause from the trial records: catches that are guesses, in rooms with too few no-sound trials to show a false alarm rate above 30 percent. So property 1 does not hold for this one kind of listener. It is reported as a limit of the method with a few no-sound trials per room, and the visit-flow brief now asks for a visit-level false alarm rule.

**No-spec version, property 4.** CP7 holds. CP8 does not: its schedule never lets a no-sound trial lift the share above 25 percent, even at the start, so no room opens with one. Positions 1, 2 and 3 have a no-sound share of 0 in all 2000 rooms, against 0.181 overall. Two other features show the same thing on the first trial (no previous trial, no previous sound trial).

**Bare-prompt version, property 1.**
- CP1: a step listener with a true threshold of 0.1 dB is found at 0. CP1 asks for the exact grid level, 5. The estimate 0 is Accurate and within 5 dB. A search that reports the mean of its reversals does not report grid levels, so CP1 cannot hold for it.
- CP2: 74 of 100 sets are below 93 percent. The shrunk set is left 0 dB, right 0 dB, width 1 dB, lapse 0, false alarm 0.098, wrong side 0.072 (set seed 1012478024): 85.4 percent Accurate, 6.3 Flagged, 8.4 Wrong, with estimates such as −17.8 and −23 for a true threshold of 0. Its task has no side, so a wrong-side answer and a false alarm both count as "heard" and move the level down. Its false alarm limit applies to the whole session, and this listener's rate of 0.098 is under it.
- CP3: 4 of 50 Attentive_Range sets are below the limits. The shrunk set is left 0 dB, right 0.1 dB, width 2.5 dB, lapse 0, false alarm 0.006, wrong side 0.003 (set seed 2662203826): 86.8 percent Accurate against a limit of 88, with right-ear estimates of −0.33 and −1 for a true threshold of 0.1. Those are within 5 dB but below the grid band, which starts at 0 for this threshold. 99.8 percent of that set's ears are within 5 dB.

**Bare-prompt version, property 3.** CP5: trial 4 of the first counterexample asks for −33, which is not on the 5 dB grid from −25. Its steps are 8, 4 and 2 dB, so it also rises by 8 dB after an early miss, more than the product's upward step of 5 dB. By its own step sizes it never rises by more than one step.

**Bare-prompt version, property 4.** CP7: a room with 5 no-sound trials in 35, a share of 14.3 percent, under the 15 percent minimum. Each of its trials is a catch trial with chance 0.2, with no guard on the share. CP8 holds, with a largest deviation of 0.015 from an overall share of 0.201.

## Brief property 1 in detail

CP2 is 100 Plausible_Range sets of 400 rooms, 80 000 ears. CP3 is 50 Attentive_Range sets of 400 rooms, 40 000 ears. The limits are 93 percent Accurate or Flagged for CP2, and at least 88 percent Accurate with at most 10 percent Flagged for CP3.

| | Spec version | No-spec version | Bare-prompt version |
|---|---|---|---|
| CP2 sets below the limit, Accurate | 1 | 0 | 74 |
| CP2 sets below the limit, within 5 dB | 26 | 34 | 65 |
| CP2 Accurate / Flagged / Wrong | 53.4 / 44.6 / 2.0 percent | 53.5 / 44.6 / 1.9 percent | 52.9 / 31.5 / 15.6 percent |
| CP2 within 5 dB | 48.9 percent | 47.2 percent | 57.5 percent |
| CP2, the set of D43, Accurate or Flagged | 92.5 percent | 93.8 percent | 52.1 percent |
| CP3 sets below the limits, Accurate | 0 | 0 | 4 |
| CP3 sets below the limits, within 5 dB | 8 | 12 | 0 |
| CP3 Accurate / Flagged / Wrong | 97.6 / 2.4 / 0.0 percent | 97.5 / 2.4 / 0.0 percent | 96.4 / 0.3 / 3.3 percent |
| CP3 within 5 dB | 94.2 percent | 92.5 percent | 98.9 percent |

The set of D43 is the worst CP2 set for all three versions. The no-spec version is above the limit on it by 0.8 points and the spec version below it by 0.5 points. Each figure is one batch of 800 ears, and D19 gives a standard error of about 0.8 points for such a figure near 95 percent. This one batch does not show that the no-spec version treats that listener differently. Both versions find a level with the 2 of 3 rule on the same grid and flag a room above the same false alarm limit.

## The population of 3000 listeners

One room each, drawn uniformly from the Plausible_Range with seed 20261120, 6000 ears.

| Version | Accurate | Flagged | Wrong | Within 5 dB | Wrong under the 5 dB measure | Median trials per room | Largest |
|---|---|---|---|---|---|---|---|
| Spec version | 44.8 percent | 53.0 percent | 2.2 percent | 41.4 percent | 5.6 percent | 30 | 53 |
| No-spec version | 43.5 percent | 54.2 percent | 2.3 percent | 39.1 percent | 6.7 percent | 28 | 53 |
| Bare-prompt version | 44.1 percent | 37.2 percent | 18.7 percent | 50.6 percent | 12.2 percent | 46 | 63 |
| Spec version, first run | not measured | 52.7 percent | not measured | 40.5 percent | 6.7 percent | 28 | 53 |

No room of any version was stopped by the harness's trial budget or ended with an error.

The bare-prompt version flags fewer ears because it flags only a whole session with a false alarm rate above the limit. The other two also flag an ear that reached its trial limit or caught a sound 10 dB below its result. Its rooms are longer. It ends a staircase only after 10 reversals, 3 catches at the floor, 3 misses at the cap or the trial limit, and it has no limit on the number of catch trials. The trial limit of 20 per ear used here is a third of its own default of 60.

### The spec version's first run

`brief-properties-spec-first-run.json` is the spec version's first complete run, at commit 37215f8, before any counterexample was handled (D30). The checks were not yet committed, so it records an unclean working tree (D39). At that time Accurate meant within 5 dB, so its Accurate figures are the within 5 dB measure, and the grid band was not measured for that engine. On that run brief properties 2 to 5 held and property 1 did not: CP1 held, CP2 had 36 of 100 sets below its limit, and CP3 had 11 of 50. CP2's ears were 47.5 percent within 5 dB, 44.2 Flagged and 8.4 Wrong. CP3's were 92.5, 2.3 and 5.2. The shrunk counterexamples were step-like listeners just below a grid level, found one level too loud: left −55.1 dB found at −50 (CP2, set seed 4263754660), and left −0.1 dB found at 5 (CP3, set seed 3252736698). D40 changed the engine for those. D41 found that the rest came from the 5 dB grid itself, and D42 records the amendment.

## What each adapter had to interpret

The adapters translate names, units, levels and call shapes. They add no clamping, stopping, flagging or scheduling. Each stops a run that asks for more than 1000 trials, the same way for every version, and no run came near that.

**No-spec version** (`tests/listeners/no-spec-search-under-test.ts` on `experiment/no-spec-measured`).
- It takes settings with the config's field names, so the shared values go in under the same names. Its 2 of 3 rule uses two fields the shared settings do not have, `thresholdRulePresentationCount` 3 and `thresholdRuleCatchCount` 2. These come from its own config. It does not read the spec version's added fields, such as the no-sound chance or the inconsistent catch margin. It draws a target no-sound share for each room inside the 15 to 25 percent range, and its inconsistent catch rule uses the downward step.
- Its call is `answer(trialIndex, response)` and its trials count from 0. Its no-sound trials are `"no-sound"` and its states use hyphens. Those are renamed. A room without no-sound trials reports a false alarm rate of `null`, which is left out of the run.
- Its gaps are reported as it draws them, which are not whole milliseconds. That is why CP10's gaps-in-range part does not hold for it. That check is not one of the five properties.
- Its branch has its own `src/config/hearing-method-config.ts`, so the copies of `main`'s config, `search-types.ts` and `fraction-comparisons.ts` sit under `tests/shared/src/`.

**Bare-prompt version** (`tests/listeners/bare-prompt-search-under-test.ts` and `tests/listeners/bare_prompt_driver.py` on `experiment/bare-prompt-measured`, D44).
- It is a Python program. One Python process runs the program's own `run_session` for the whole measurement, with a listener object that hands each trial to the harness over two FIFOs and returns the answer. No sound is played, and nothing was installed: `sounddevice` is only needed by its keyboard listener.
- Levels: the program uses dBFS and requires its loudest level to be at most 0 dBFS. A program level is the harness level minus 25 dB, so the shared cap of +15 is −10 dBFS (its own default cap), the start of −25 is −50 dBFS and the floor of −70 is −95 dBFS. The program only adds, subtracts and compares levels, and 300 rooms gave the same trials and results under offsets of −15, −25 and −40 dB.
- Settings it takes, given the shared values: start, floor and cap through the level map, a trial limit of 20 per staircase (its own 60), a catch trial chance of 0.2 (its own 0.2), a false alarm limit of 0.3 (its own 0.2) and a random silence before the tone of 1.5 to 4.0 s from the gap range (its own 0.2 to 0.6 s). Everything else keeps its own value: 1000 Hz only, steps of 8, 4 and 2 dB in both directions, 1 up and 1 down, 10 reversals to stop, the mean of the last 6 as the threshold, and a stop after 3 catches at the floor or 3 misses at the cap. The checks still judge it against the shared settings, including the 5 dB grid and the 5 dB upward step.
- Answers: it asks only whether a tone was heard. Naming either side is "heard", and "none" is "not heard". A wrong-side answer is a catch for it.
- Results: it marks a whole session as not reliable when its false alarm rate is above the limit or it had no catch trials. One session is one room here, so both ears are then Flagged. Otherwise "heard at min" is better than floor, "not heard at max" is worse than cap, and "converged" and "max trials" are found at the level it reports. "Max trials" is not read as unreliable, because the program reports a level for it and does not flag it.
- Gaps: the gap of a trial is its random silence before the tone, worked out from the buffer length and given in milliseconds without rounding.
- The same copied files as for the no-spec version, under the same paths.

## What could not be measured

- The spec version's own checks (CP6, CP11, CP12, CP13 and the room total of CP4) were not run against the other two versions. They test this spec's design, not the brief (D21).
- The grid band was not measured for the spec version's first-run engine. Only the within 5 dB figures of that run exist.
- The bare-prompt version has no side in its answers, so nothing here measures how it would treat wrong-side answers if it had them. Its own tests need `pytest`, which is not installed, and were not run.

## Limits of this comparison

- Simulated listeners only. The listener model and its ranges are design choices of this spec (D17), not data about people.
- One author, and one run of each prompt. Another run of either prompt could produce different code.
- The spec version was developed against these checks, listener ranges and seeds. The other two never saw them.
- The no-spec version had read the brief, its five properties and the steering files. The bare-prompt version had not, and is judged against a grid, a share range, a trial limit and a false alarm limit it never saw.
- The amended band was chosen for a search on the 5 dB grid that lands at or above the true threshold. The within 5 dB figures are given beside it for that reason.
- Nothing here says how well any version works for people, and none of them has been checked against professional equipment.

## Reproducing the numbers

On `main` at a480f64:

```
npm ci
npm run experiment:properties -- --search spec
npm run experiment:scatter -- --search spec
```

On `experiment/no-spec-measured` at 26dfdcc, in a worktree outside the repository:

```
git worktree add ../did-you-hear-that-no-spec-measured experiment/no-spec-measured
cd ../did-you-hear-that-no-spec-measured
npm ci
npm run experiment:properties -- --search no-spec
npm run experiment:scatter -- --search no-spec
```

On `experiment/bare-prompt-measured` at 8ebc56d, with Python 3 and numpy on the path (or `BARE_PROMPT_PYTHON` set to an interpreter that has numpy):

```
git worktree add ../did-you-hear-that-bare-prompt-measured experiment/bare-prompt-measured
cd ../did-you-hear-that-bare-prompt-measured
npm ci
npm run experiment:properties -- --search bare-prompt
npm run experiment:scatter -- --search bare-prompt
```

The property run took under 2 seconds for the no-spec version and 9 minutes 24 seconds for the bare-prompt version, which spends most of that time in Python. The JSON files record the commit each run was made at, which is the commit before the one that adds the files. Universal checks use a random fast-check seed on every run, and the seed of each run is in its JSON file. Statistical checks and the population use the fixed seeds above, so they give the same figures on the same code.
