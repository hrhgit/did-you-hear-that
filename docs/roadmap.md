# Roadmap

Deadline: 4 December 2026, 14:00 Pacific Time. Features freeze on 30 November.

The project is built as a series of Kiro specs. Each spec has a brief in `docs/briefs/` that is the input Kiro works from. Kiro turns the brief into `requirements.md`, `design.md` and `tasks.md` under `.kiro/specs/<name>/` and then carries out the tasks.

## How the work is run

| Surface | Used for |
|---|---|
| Kiro IDE | The threshold search spec, because the Correctness feature (property-based testing tied to requirements) exists only in the IDE. Also anything that needs eyes and ears: sound design and the look of the house |
| Kiro CLI, headless | Everything else. Each run is one spec phase or a small group of tasks |

Headless runs use this form, from the repository root:

```bash
kiro-cli chat --v3 --no-interactive --model claude-opus-5.5 --trust-tools=<tools> "<instruction>"
```

| Model | Default effort | Used for |
|---|---|---|
| `claude-opus-5.5` | high | Specs, design and implementation |
| `claude-haiku-5.5` | max | Commits, the blog post draft, wording checks, batch chores |

The effort defaults are set in `.kiro/settings/cli.json`.

## Order of specs

A spec may start when everything in its "Needs" column is done.

| # | Spec | Brief | Needs | Surface | Done when |
|---|---|---|---|---|---|
| 0 | `project-scaffold` | `00-project-scaffold.md` | — | CLI | All commands in the tech steering file run and pass on an empty project; the import rules are enforced by lint; the site deploys |
| 1 | `threshold-search` | `01-threshold-search.md` | 0 | IDE | The engine passes its property tests with simulated listeners, and the spec-against-no-spec comparison is recorded |
| 2 | `ghost-sounds` | `02-ghost-sounds.md` | 0 | CLI, then IDE for listening | Five room sounds and the calibration noise render offline and pass the spectrum check |
| 3 | `audio-output` | `03-audio-output.md` | 0 | CLI | Cap and channel isolation pass their property tests; stop-everything works |
| 4 | `visit-flow` | `04-visit-flow.md` | 1, 2, 3 | CLI | A whole quick visit and a whole full visit run with a fake timer for any answers and produce a complete visit log |
| 5 | `house-interface` | `05-house-interface.md` | 4 | CLI, then IDE for looks | A visitor can complete a visit by keyboard and by touch; the no-leak property passes |
| 6 | `result-page` | `06-result-page.md` | 4 | CLI, then IDE for looks | The cross-section shows any result; the copy property passes; past visits are stored and compared |
| 7 | `missed-sound-replay` | `07-missed-sound-replay.md` | 5 | CLI | Missed sounds replay in order, louder, within the cap, with ripples |
| 8 | `swapped-repeat` | `08-swapped-repeat.md` | 6 | CLI | The attribution property passes; the flow offers and runs the repeat |
| 9 | `no-headphone-replay` | `09-no-headphone-replay.md` | 6, 7 | CLI | A recorded real visit plays back in 60 seconds with no sound required |
| 10 | `robot-listener` | `10-robot-listener.md` | 5 | CLI with a browser MCP server | Kiro plays the deployed site end to end and saves screenshots |
| 11 | `last-door` | `11-last-door.md` | 4 | CLI | Three digits in noise, full visit only. First thing to cut if time runs short |

Specs 1, 2 and 3 do not depend on each other and can run at the same time.

## Kiro features and where each one is used

| Feature | Use in this project | Arrives with |
|---|---|---|
| Specs | Every row in the table above | All specs |
| Spec against no spec | The threshold search is written twice, once from a plain prompt on a branch and once from the spec, and both are run against the same simulated listeners | Spec 1 |
| Property-based testing | Eight properties, listed below | Specs 1, 3, 5, 6, 8 |
| Steering | Product, technology, structure, audio safety, wording, hearing method | Already in `.kiro/steering/` |
| Hooks | After a synthesis file is saved, render that sound and check its spectrum. After a copy file is saved, run the banned-word check | Specs 2 and 6 |
| Custom agent | A read-only reviewer that reads specs and visitor-facing text and reports only overclaims | After spec 6 |
| MCP | A browser automation server so Kiro can play the deployed site with the robot listener | Spec 10 |
| CLI | Headless spec runs, batch rendering of all sounds, commits | Throughout |
| IDE | Correctness feature for spec 1, sound and visual tuning | Specs 1, 2, 5, 6 |
| Powers, Web, Crew | Not decided. To be looked at once the scaffold exists. If unused, the write-up says so | — |

## The eight properties

1. **Accurate or flagged.** For any simulated listener whose true threshold is inside the playable range, the estimate is within 5 dB of the truth, or the result is marked unreliable.
2. **Safe.** Whatever the visitor does, the output never exceeds the cap.
3. **No crosstalk.** On every trial the channel that is not being tested is exact digital zero.
4. **Always ends.** Answering always, never, or at random, every search ends within the trial limit.
5. **The picture does not leak.** Screen events before an answer are independent of when a sound plays and on which side.
6. **No-sound trials cannot be predicted.** Their share stays in the configured range and their spacing is random.
7. **Safe wording.** For every combination of results, the generated text contains no banned word and always contains the limits statement.
8. **Correct attribution.** For every mix of ear difference and headphone imbalance, the swapped repeat reaches the right conclusion.

Property 1 is expected to fail at first. Counterexamples and their fixes are kept in the history and reported in the write-up.

## Evidence to keep along the way

- Both branches of the spec-against-no-spec comparison and the numbers from each.
- Every counterexample a property test finds, as a named regression test.
- One recorded case of a hook stopping a bad change.
- One before-and-after pair showing a steering file changing Kiro's output.
- Screenshots from the robot listener's run.
- A scatter plot of true threshold against estimate for the simulated listeners, with the 5 dB band drawn.

## Dates

| Dates | Goal |
|---|---|
| 13 to 15 November | Scaffold. A minimal sound page to try very quiet sounds on every available pair of headphones |
| 16 to 22 November | Specs 1 to 4. First deployed version |
| 23 to 29 November | Specs 5 to 11. The author's own repeated visits over three days |
| 30 November to 2 December | Feature freeze. Video, project page, write-up, blog post, social post |
| 3 December | Submit |

Specs written after this order: `audible-start` (calibration to music, practice, the playable floor), the game layer (the lantern and the chase, in the steering), and `one-room` (the searches of every pitch take turns in one room, with a creature for each pitch).

## What gets cut first

1. The last door (spec 11).
2. Comparison with past visits on the result page.
3. The 500 Hz and 2 kHz creatures (Thump and Tink), leaving the three of the quick visit.

The missed-sound replay, the result page and the no-headphone replay are never cut. They are what a judge without headphones sees.
