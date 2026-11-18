# Design: one room

## Overview

The owner asked for one room made for the game: several kinds of sounds in it, found together, several kinds of monsters, and more fun. This spec turns the rooms of a visit into creatures that share one room. Nothing of the hearing method changes: each creature is one room of the earlier specs, with its own threshold search, seed, cap and floor. What changes is when the trials come and what the visitor sees.

- The searches of up to five rooms run in one room run. One trial is presented at a time, and after every decision a seeded draw says whose trial comes next.
- One practice, the roll call, introduces every creature: its sound once in the left ear and once in the right, at a level that is easy to hear.
- One lantern and one count serve the whole room. Each creature also has a tally of its own, and it goes home when its search ends.
- The screen is a dark room with a doorway at each side. A caught sound shows its creature in the doorway of its side. A sound that went by is seen leaving. Before the answer the screen shows nothing of the trial.

```
   src/ui/visit   the page of a visit                      src/ui/room   new: the picture of the room
     screen-of-snapshot.ts   what the room shows now         build-room-scene.ts   wall, doorways, lantern
     reaction-of-event.ts    what a scored trial shows       creature-shelf.ts     the cards along the floor
     show-screen.ts, show-caption.ts, build-visit-page.ts    creature-art.ts       the five drawings
        ▲ snapshot.room: creatures, together, practice.practising, practice.notHeard, lantern, chase
        │ events: practiceSoundScored, countingStarted, trialScored, roomFinished
  ┌───────────────────────────────────── src/session ─────────────────────────────────────────┐
  │ create-visit-flow.ts            a room run of up to roomsTogetherMaxCount rooms               │
  │   ├── practised-room-runner.ts  the roll call: every member, the left ear and then the right  │
  │   ├── room-runner.ts            the mixed runner: one trial at a time, the turn drawn         │
  │   ├── turn-seed.ts              pure: the seed of the turns, from the engine seeds            │
  │   ├── lantern.ts                one lantern for the run (unchanged)                           │
  │   └── chase-score.ts            one chase for the run and a tally for each creature           │
  └────────────┬──────────────────────────────────────────────────┬────────────────────────────┘
               │ beginRoom({ riseLimitPer: "sound" })               │ every visitor-facing string
               ▼ play("trial") with the sound of the turn's room    ▼
   src/audio/output   create-audio-output.ts                src/copy   creature-copy.ts (new)
     a mixed span: the rise limit by sound id                 front door, rules and replay lines
   src/engine   unchanged: one threshold search for each room
```

The design rests on these choices.

- **A creature is a room of the log** (D1). The visit log, the summary, the replay, the result picture, a saved visit and the swapped repeat keep the shape they had: one Room_Attempt for each run of each room, and every trial logged with its own room and attempt. So nothing that reads a log had to change, and a visit of the one room is drawn as five floors, as before.
- **One runner, with one track or several** (D6). `createMixedRoomRunner` presents and decides the trials of several searches. `createRoomRunner` is that runner with one track, so a room alone and the swapped repeat run on the same code and draw no turn.
- **Whose turn it is comes from the engine seeds** (D5). The seed of the turns is a fold of the run's engine seeds. The visit's own random source gives exactly the draws it gave before, so every seed that is found again by counting the room runs of a log is where it was.
- **The rise limit is counted by creature in the one room** (D4, approved by the owner on 2026-11-17). Each search still climbs one step at a time. Without this, a quiet creature followed by a louder one on the same ear would have its sound cut down, and its search would be told of a level that was not played.
- **A creature is shown only after the decision** (D10). The flow already releases a scored trial in the moment it is scored and not before. The screen draws from that event alone, so the experience rule holds by construction, and the screen-leak properties check it over whole visits.
- **The earlier way stays one number away** (D1), and every property of the visit flow runs both ways (D16).

## Sources

- The owner's request of 2026-11-16, quoted in `requirements.md`, and the owner's remark shortly before it that one room took too long. The owner's answer of 2026-11-17 to the question about rule 4 (D4).
- `.kiro/steering/`: `audio-safety.md` (rules 1 to 9, above all rule 4 "Within a room" and rule 9), `hearing-method.md` (the search, practice, the lantern, the end states, the Initial values), `product.md` ("What the visitor does", "What the result may claim", the experience rules), `wording.md` (the banned words, the fixed line, levels relative to the calibration, no comparison of floors), `structure.md` and `tech.md` (numbers in `src/config`, strings in `src/copy`, time and randomness passed in, the import boundary of `src/ui`).
- `.kiro/specs/visit-flow/`: D1 (the contract only grows), D4 (window starts), D9 (a paused trial comes again after its own gap), D19 (the seeds and their order), D25 (three refusals), D26 (the test hook), R6 (rooms), R11 (notifications), CP1 to CP10.
- `.kiro/specs/audible-start/`: the light plan at the top of its `tasks.md` (practice at the anchor, one upward step louder after a miss, the not-heard notice), R12 (the playable floor), D25 (the Keep_Minimum), CP1.
- `.kiro/specs/audio-output/`: rule 4 in the output stage (`prepare-playback.ts`, the previous applied gain), `beginRoom`, CP7.
- `.kiro/specs/missed-sound-replay/`, `swapped-repeat/`, `result-page/`: what each reads from the log, and that each begins a span of its own.
- The game layer of 2026-11-16 (`src/session/lantern.ts`, `chase-score.ts`, and "The lantern" in `hearing-method.md`).
- The code named in "Files".

No page outside the repository was read for this spec. The fold of D5 is the 32-bit FNV-1a fold with its usual first value and multiplier, written from its definition. `turn-seed.test.ts` checks the function against a fold written out a second time in the test.

## Files

New files:

| File | What it holds |
|---|---|
| `src/session/turn-seed.ts` (+ test) | `turnSeedOf`: the seed of the turns from the engine seeds (D5). |
| `src/session/practised-room-runner.test.ts` | Unit tests of the roll call and of the practice of one room, which had none of its own before. |
| `src/copy/creature-copy.ts` (+ test) | The five creatures and every line the one room says of them. |
| `src/ui/room/build-room-scene.ts` | The picture of the room: the wall, the two doorways, the floor, the lantern, who stands in view, rings. |
| `src/ui/room/creature-shelf.ts` | The row of cards along the floor. |
| `src/ui/room/creature-art.ts` | The five drawings, as SVG shapes. |
| `src/ui/room/room.css` | Every style of the room, its sizes of screen and its reduced motion. |
| `src/ui/visit/show-caption.test.ts` | Unit tests of the line under the room. |
| `tests/e2e/room.spec.ts` | Browser tests of the room on the development replay sheet. |
| `tests/e2e/simulated-room.ts` | Whole one-room visits played in Node, as moments a page is handed. |

Changed files:

| File | What changed |
|---|---|
| `src/config/visit-flow-config.ts` (+ test) | `roomsTogetherMaxCount: 5`. |
| `src/audio/output/create-audio-output.ts` (+ test) | `beginRoom(options?)`, the mixed span (D4). |
| `src/session/room-runner.ts` (+ test) | `createMixedRoomRunner`; `createRoomRunner` is built on it; `waitingTrack`. |
| `src/session/practised-room-runner.ts` | `createPractisedRoomsRunner`; `createPractisedRoomRunner` is built on it. |
| `src/session/create-visit-flow.ts` (+ test) | Room runs of several members, the creatures of the snapshot, the pause and device rules of D7 and D8. |
| `src/session/chase-score.ts` (+ test) | A row runs on between room runs under way at the same time. |
| `src/session/visit-flow-types.ts` | The additions of "Interface contract". |
| `src/copy/front-door-copy.ts`, `rules-copy.ts`, `replay-lines.ts` (+ tests) | The words of D14. |
| `src/ui/visit/screen-of-snapshot.ts`, `reaction-of-event.ts`, `show-screen.ts`, `show-caption.ts`, `build-visit-page.ts`, `start-visit.ts`, `start-replay-sheet.ts` (+ tests) | The page of a visit draws the room of `src/ui/room`. |
| `src/ui/visit/visit.css` | The styles of the earlier house in a visit are gone; the room's are in `room.css`. |
| `index.html`, `replay-sheet.html` | Each links `room.css`. |
| `tests/properties/visit-flow-harness.ts`, `visit-flow-cp1` to `cp10`, `visit-flow-cp7-check.ts`, `audible-start-cp1-practice-never-too-loud.property.test.ts`, `audio-output-cp7-rise-limit.property.test.ts`, `swapped-repeat-harness.ts`, `screen-leak/` | Every property runs both ways (D16). |
| `tests/e2e/visit.spec.ts`, `visit-steps.ts`, `replay.spec.ts`, `swapped-repeat.spec.ts`, `whole-visit.spec.ts`, `whole-swapped-repeat.spec.ts`, `simulated-result.ts`, `page-checks.ts`, `README.md` | The browser tests walk the one room (D17). |
| `.kiro/specs/missed-sound-replay/design.md` | The second line of the replay's announcement, as it now reads. |

Left in place and no longer used by the page of a visit: `src/ui/ambient/`, `src/ui/ripple/`, `src/ui/house/motion-layer.ts` and `room-furniture.ts` (D18). The result page still uses `src/ui/house/`.

## Interface contract

### How the interface uses it

The page reads four things of the one room, all from the snapshot of the stage `room` and from events it already listened to.

- `snapshot.room.together` says whether the creatures take turns. Then the bar has no room name and no place in an order of rooms.
- `snapshot.room.creatures` is the list for the cards: who has begun a run, whether each is `about` or `gone`, its count and its quietest catch on each side, with the top and the floor that the bar of a card is drawn between.
- `snapshot.room.practice.practising` says whose practice sound plays or is about to play, so that the page can show that creature in the middle of the room. `practice.notHeard` names the creatures and sides for the not-heard notice.
- `trialScored`, `practiceSoundScored` and `roomFinished` carry the room they are about. The page turns each into what it shows (`reaction-of-event.ts`).

Nothing was added to the commands: `answer`, `pause`, `resume`, `goOnWithoutPractice` and `stop` do in the one room what they did in a room.

### What is added to each existing type

| Type | Added | When it is given |
|---|---|---|
| `RoomSnapshot` | `creatures?`, `together?` | In every snapshot of the stage `room`. |
| `RoomPractice` | `practising?`, `notHeard?` | In every snapshot of the stage `room`. |
| `AudioOutput.beginRoom` | one optional argument, `BeginRoomOptions` | A call without it does what it did. |
| `RoomRunner` (inside `src/session`, not part of the contract) | `waitingTrack()` | The room and attempt whose trial waits or is presented, or null. |

Every added field is optional, so that a literal written before this spec still compiles. The flow always gives them.

### The additions to `visit-flow-types.ts`

```ts
// On RoomSnapshot:
/**
 * Every room of the visit that has begun a run, in visit order: where the rooms run together
 * (one-room spec), every sound that takes its turn in this one room. Always present in the
 * snapshots the flow gives; optional only so that literals written before it still compile.
 */
readonly creatures?: readonly RoomCreature[];
/**
 * Whether several rooms' searches take turns in this one room (one-room design.md, D1). Then the
 * practice is the roll call and the room has no place in an order of rooms. Always present in the
 * snapshots the flow gives; optional only so that literals written before it still compile.
 */
readonly together?: boolean;

/**
 * One room's sound as the room's screen keeps it while several searches take turns in one room
 * (one-room spec): whether its search is still going, and how the chase of that sound alone stands.
 * Every field changes only when a room run begins, in the moment a trial is scored, and when its
 * search ends. It says nothing of a trial that is not scored yet.
 */
export interface RoomCreature {
  /** The room this sound is in the log and the result. */
  readonly room: VisitRoom;
  /** `about`: its search is under way or will begin again. `gone`: its search has finished. */
  readonly state: "about" | "gone";
  /** The sounds of it caught in its last run. */
  readonly caughtCount: number;
  /** The quietest level of it caught on each side in its last run, or null where nothing was caught yet. */
  readonly deepestCaughtDb: Readonly<Record<"left" | "right", number | null>>;
  /** The loudest level its search may ask for. */
  readonly topLevelDb: number;
  /** The quietest level its search may ask for. */
  readonly floorLevelDb: number;
}

// On RoomPractice:
/**
 * In `practice`: the room whose sound is practised now, so that the screen can show who is making
 * it. Never which side. Null in `notHeard` and `counting`. Always present in the snapshots the
 * flow gives; optional only so that literals written before it still compile (one-room spec).
 */
readonly practising?: VisitRoom | null;
/** In `notHeard`: each room's side that did not catch its sound, in the order practised; otherwise empty. Optional as `practising` is. */
readonly notHeard?: readonly PracticeMiss[];

/** A side on which a room's practice sound was not caught. */
export interface PracticeMiss {
  readonly room: VisitRoom;
  readonly ear: Ear;
}
```

### The addition to the output stage

```ts
beginRoom(options?: BeginRoomOptions): void;

/** What `beginRoom` takes. */
export interface BeginRoomOptions {
  /**
   * What the rise limit of the span compares a sound with: `ear`, the last sound on the same ear,
   * or `sound`, the last sound of the same sound id on the same ear. `ear` when left out.
   */
  readonly riseLimitPer?: RiseLimitScope;
}

export type RiseLimitScope = "ear" | "sound";
```

## Config

One value is added, in `visitFlowConfig`:

| Name | Value | What it does |
|---|---|---|
| `roomsTogetherMaxCount` | 5 | How many rooms' searches take turns in one room run at most. At 1 the rooms run one after another, each with its own practice and a rest before the next, as before this spec. From 5 up, every sound of the longest visit is searched in one room. |

The config test checks that it is a whole number and at least the room count of the longest visit. A value from 2 to 4 is accepted by the flow and gives a full visit in two room runs with a rest between them; the site does not ship that, and only the unit tests of the flow play it.

No other value of any config changes. The one room reads these as they are: `hearingMethodConfig` (the response window of 1800 ms, the steps, the starting level, the cap, the no-sound share, the trial limit), `visitFlowConfig` (`practiceStartLevelDb`, `practiceGapMs`, `practiceSoundsPerEarMaxCount`, `refusedPlaysInARowMaxCount`), `lanternConfig` (3 lights, 8000 ms) and `audioOutputConfig`.

## The flow

`createVisitFlow` takes `roomsTogetherMaxCount` as an option that stands in place of the config value, and throws a `RangeError` unless it is a whole number from 1 up ("The rooms that run together must be a whole number from 1 up, but got …"). `together` is true when the count is above 1.

**Starting a room run** (`startRoom`). The members are the rooms of the visit that have not finished, in visit order, and at most the first `roomsTogetherMaxCount` of them. Then, in this order:

1. The output stage begins a span: `beginRoom({ riseLimitPer: "sound" })` when together, `beginRoom()` otherwise.
2. For each member, in order: its search cap and search floor are computed from the calibration's range report, as for a room alone; one engine seed is drawn from the visit's source; its threshold search is created from `hearingMethodConfig` with that cap, floor and seed; its Room_Attempt is started in the recorder; and its creature is set to `about` with an empty tally. The loop draws nothing else from the visit's source (visit-flow D19).
3. The mixed runner is created over the members' tracks, with the turn source seeded by `turnSeedOf` of the engine seeds.
4. The roll call is created over the same members and started. It hands over to the mixed runner when it ends.

**A scored trial.** The mixed runner calls `scored(entry, track)` in the call that decides the trial. The flow counts it into the chase of the run and into the tally of that track's creature, gives a light back for a catch, and emits `trialScored` with the track's room. Nothing else of the trial reaches the interface, before or after.

**A search that ends** (`trackFinished`). The Room_Attempt is ended as `finished` with its result, the room is marked finished, its creature becomes `gone`, and `roomFinished` is emitted for that room. The other members go on. The last trial's `trialScored` comes before the `roomFinished` of its search.

**The end of the run** (`finished`). The runner and the lantern are dropped. If rooms of the visit are left, the flow shows the rest between rooms and starts the next run from it. Otherwise it begins a plain span with `beginRoom()` and goes on to the replay of missed sounds.

**The snapshot of the stage `room`.** `room` is the first member, so that a page written before this spec still has a room to name. `together`, `creatures`, `practice`, `lantern` and `chase` are as "Interface contract" says. `creatures` holds every room that has begun a run, in visit order, also one that finished in an earlier run.

**A pause** (D7). `pause` and every pause the output stage starts stop the runner as before: the gap is cancelled or the presented trial is discarded, and the waiting trial stays with its track. The log records the pause against the first member that has not finished. `resume` waits the waiting trial's own gap again and presents it, by the same creature. A pause fills the lantern, as before.

**An answer when the lantern is dark.** It is logged as ignored against the member whose trial waits, which `waitingTrack()` gives, or against the first member that has not finished when no trial waits. The page is not told which.

**A change of device** (D8). The run is abandoned: the runner is told to abandon, the lantern is dropped, and the Room_Attempt of every member that has not finished is ended as `abandoned`. A member whose search had finished keeps its result and stays finished. After the calibration again and a correct headphone check, the next run holds the rooms that have not finished: each gets a new Room_Attempt, a new engine seed, an empty tally, and a roll call from its first sound. The rules are not shown again.

**A stop.** `stop` leaves nothing scheduled and nothing sounding, as in a room.

**One at a time.** With the count at 1 every step above runs with one member. Step 1 begins a plain span, the turn source is never drawn from, the practice lines are the earlier ones, and after each room the flow rests. This is the flow of the earlier specs, and the same properties check it (D16).

## The mixed runner

`createMixedRoomRunner(options)` in `src/session/room-runner.ts` takes what a room runner took, with `tracks` in place of one room, and three callbacks in place of two:

```ts
export interface MixedRoomRunnerOptions extends RunnerCommonOptions {
  /** The room runs that take turns, in the order of the visit. At least one. */
  readonly tracks: readonly RoomTrack[];
  /** Drawn from once after every decided trial and once at the start, and never while only one track is unfinished. */
  readonly turnRandom: RandomSource;
  readonly scored: (entry: ScoredVisitTrial, track: RoomTrack) => void;
  /** Called when one track's search has finished, after that trial's `scored`. */
  readonly trackFinished: (track: RoomTrack, result: RoomResult) => void;
  /** Called once, when every track has finished, after the last `trackFinished`. */
  readonly finished: () => void;
}
```

**The turn** (D6). An open track is one whose search has not finished and has a trial waiting. With `n` open tracks in the order of the visit and a draw `u` of the turn source, the turn falls on the track at the index `min(n − 1, floor(u × n))`. With one open track the turn is that track's and nothing is drawn. With none, the run is over.

**When it draws.** Once in `start`, and once after every decision. A decision is the moment a trial is scored: an answer was taken in its window, or its window ended. Nothing else draws: not a pause, not a resume, not a refused sound, not an ignored answer. So the number of draws of a run can be counted from its decided trials, which is what lets the log replay (CP5).

**One trial at a time.** The trial of the turn's track waits its own gap, which its search drew, and is presented with the sound of its track's room. It is decided as in a room runner, with the same response window, the same judgement of an answer against the window, and the same rule after three refusals in a row. The scored entry goes to its own track's search and to no other.

**What stays through a pause.** The turn. A pause cancels the gap or discards the presented trial; the trial stays the waiting trial of its track, and that track stays the turn. `resume` presents it again after its own gap. The same holds when the output stage refused the sound.

**What it tells.** Between the start of a gap and the decision of its trial the runner calls nothing that reaches the interface. Which track waits is told only by `waitingTrack()`, which the flow reads for the log of an ignored answer.

**One track.** `createRoomRunner(options)` creates the mixed runner with one track, a turn source that throws if it is ever drawn from, and callbacks that drop the track. A room alone and the room of a swapped repeat therefore behave as they always have. An empty list of tracks throws `RangeError("A room run needs at least one track.")`.

## The roll call

`createPractisedRoomsRunner(options)` in `src/session/practised-room-runner.ts` practises several rooms and then hands over to the runner that counts (D2). It takes `rooms`, each with its room, attempt and search cap, in the order they are practised.

- **A round.** Every room in order, and for each the left ear and then the right. A side hears the room's sound at `practiceLevelsDb(searchCapDb, settings)`: the anchor, or the room's cap if that is lower, and one upward step louder after a sound it did not catch, up to `practiceSoundsPerEarMaxCount` sounds (2). A catch ends that side's practice. Gaps, windows and answers are those of a practice in the audible-start light plan.
- **The log.** Each practice sound is logged in the log's `practice` with its own room and attempt, never among the trials. The round is counted across the rooms. The number of a practice sound is its number within its room and round.
- **Not heard.** When a round has left sides uncaught, `notHeard(missed)` is called once, after the last room of the round, with every room and side that was not caught, in the order practised. The flow begins the pause `practiceNotHeard`. `resume` plays a new round for those sides alone. `goOn` starts the counting without them.
- **What the screen is told.** `practice()` gives `phase`, `soundPlaying`, `practising` and `notHeard`. `practising` is the room whose sound plays or is about to play, through the whole phase `practice`, and null in `notHeard` and `counting`. The side is never given.
- **Handing over.** When every side has caught its sound, or the visitor goes on, `countingStarted` is called once and the mixed runner is started. The flow then lights the lantern, sets the scale of the chase, and emits `countingStarted` for each member.
- **A caught practice sound** gives `practiceSoundScored` with the reaction `ripple`. Together, its line is `rollCallCaughtLine`: "That was Squeak."
- **One room.** `createPractisedRoomRunner` creates this runner with one room and gives its `notHeard` the ears alone, as before. An empty list throws `RangeError("A practice needs at least one room.")`.

The search does not start from the practice. Every ear's search starts at the starting level, as "Practice" in `hearing-method.md` says.

A roll call of five creatures is ten sounds when every one is caught. With the practice gap of 2000 ms and an answer soon after each sound, that is under half a minute.

## The rise limit in a mixed span

Rule 4 of `audio-safety.md` said: "Within a room, the level rises by at most one upward step between consecutive sounds on the same ear." It was written for a room with one sound, where consecutive sounds on an ear are the steps of one search.

In the one room, consecutive sounds on an ear belong to different searches. Say Squeak's search on the left ear stands at 25 dB below the calibration and Thump's at 5 dB below. When Thump's trial follows Squeak's on that ear, the rule as written holds Thump to 20 dB below, 15 dB under what its search asked for. The output stage would play it quieter and log a clamp, and Thump's search would score a level that was not played. Every search would be bent by whichever creature happened to come before it.

**The restatement** (D4). In a room in which several sounds take turns, the level of each sound rises by at most one upward step above the last sound of the same sound id on the same ear. The first sound of a sound id on an ear in the span is held to no earlier sound, as the first sound on an ear is in a plain span. The cap (rule 2), the ceiling, the fades (rule 3), exact zero on the other ear (rule 5) and every other rule apply as before.

**What it allows that the earlier wording did not.** Two sounds in a row on one ear may differ by more than one step when they are sounds of different creatures. Each is at a level its own search reached one step at a time, starting from the roll call at the anchor, and none is above the cap of 5 dB above the calibration. So the loudest thing the one room can play is what a room alone could play. What the restatement gives up is the promise that nothing on an ear is ever more than 5 dB louder than the sound before it, whoever made it.

**The owner's approval.** The coordinator put this to the owner as a loosening of the count of an audio-safety rule, which the steering reserves for the owner. The owner approved it on 2026-11-17. Setting `roomsTogetherMaxCount` to 1 takes it back: then no mixed span is ever begun.

**In the output stage.** `beginRoom` forgets every previous gain and sets the scope of the span. In a span by `ear` the previous applied gain of each ear is kept, as before. In a span by `sound` it is kept in a map from sound id to the gain of each ear, and `schedule` reads and writes the entry of the sound it plays. The replay and the calibration sound are held to no previous gain, as before.

**The flow** begins a mixed span when a room run starts together, and a plain span before the replay, in the swapped repeat and wherever else it began one.

## The turn seed

`turnSeedOf(engineSeeds)` in `src/session/turn-seed.ts` is the 32-bit FNV-1a fold of the engine seeds in member order: four bytes of each seed, low byte first, from the first value `0x811c9dc5` with the multiplier `0x01000193`, to a whole number from 0 to 2³² − 1. It is pure. It throws a `RangeError` for a seed that is not a whole number in that range.

**Why not one more draw from the visit's source** (D5). Two things are found again by counting the draws of that source from the log: the render seed of the replay (`replayRenderSeed`) and the engine seed of a swapped repeat (`swappedRepeatEngineSeed`). Both count one draw for each room run. A draw for the turns would move both, and every visit saved before this spec would replay differently. A fold of seeds the log already holds needs no draw and no new field in the log.

**What follows.** The turns of a run are a function of its engine seeds and of the order of its decided trials, both of which the log holds. CP5 finds every turn again from the log alone.

## The chase

One lantern and one count serve the room run (D3).

- **The lantern** is created when the counting starts, with `lanternConfig.cellCount` lights. An answer in the roll call spends nothing: no lantern exists yet. In the counting every answer spends one light, a catch gives one back, and a spent light returns after `rechargeMs`, as "The lantern" in `hearing-method.md` says. Whose trial it was makes no difference.
- **The chase of the run** (`RoomChase`) counts the scored trials of every member: the sounds caught, the row, the longest row. Its scale reaches from the highest search cap to the lowest search floor of the members.
- **A tally for each creature** (`RoomCreature`) counts that creature's scored trials alone, with the quietest catch on each side. It is kept on the visit, by room, and starts empty with each new run of that room.
- **The score of a log.** `chaseScoreOf(log)` counts the scored trials of a log in the order played. Before this spec a row ended at every change of room run. Now it runs on between two room runs that were under way at the same time, which it reads from the log's Room_Attempts: the second began before the first ended. Rooms that ran one after another still end the row, and so does a log made by hand that holds no Room_Attempts.

Everything here changes with the visitor's own answers, in the moment a trial is scored, or with the clock. None of it says anything of a trial that is still open.

## The creatures

Each of the five sounds has a maker (D9). It lives on the floor that was that sound's room, which is also its floor in the result picture.

| Sound id | Pitch | Name | Kind | Home | Its sound | Colour |
|---|---|---|---|---|---|---|
| `cellar` | 500 Hz | Thump | the knocker | the cellar | "Three low knocks." | `#ef6f7a` |
| `corridor` | 1 kHz | Murmur | the ghost | the corridor | "A wavering hum." | `#a77bff` |
| `nursery` | 2 kHz | Tink | the tin toy | the nursery | "Four small notes." | `#6fc3b8` |
| `stairs` | 4 kHz | Scritch | the beetle | the stairs | "A dry scrape." | `#9ccf6a` |
| `attic` | 8 kHz | Squeak | the bat | the attic | "A thin, high whine." | `#7aa2ff` |

The quick visit has Murmur, Scritch and Squeak. The full visit has all five.

**The drawings** are this project's own, in `creature-art.ts`: pale bodies, dark eyes, and one accent each in the creature's own colour, in a box of 120 by 120. Thump is a heavy round body with two big fists. Murmur is a rounded sheet with tall eyes and a hem of three lobes. Tink is a tin box on two feet with a key in its side. Scritch is an oval shell with six legs and two feelers. Squeak is a small body between two spread wings. Each is drawn in three moods: awake, asleep with its eyes shut once it has gone home, and as a dashed outline when it went by. No figure, mark or logo of anyone else is used. The owner asked whether the mark of the hackathon's host could be the ghost, and then set that aside; the creatures stay original.

**A colour is never a word.** It is a glow in a doorway and an accent on a drawing and a card. Everything a colour marks is also said in text.

**What the screen shows of a creature, and when.**

| Moment | What is shown | Why it tells nothing |
|---|---|---|
| The roll call, while a creature is practised | The creature at the exact middle of the room, with its introduction. While its practice sound plays, the line that a sound is playing. | Practice counts for nothing, and the middle has no side (product.md, the exception for practice). |
| A practice sound is caught | Rings at the doorway of the side answered, a hop, and "That was Squeak." | The answer has been given. |
| The counting, between decisions | Nobody. The doorways are empty, the cards stand still. | |
| A counted sound is caught | Its creature in the doorway of its side, lit, with rings. Its card lights and counts. The line of the catch. | The trial is scored. |
| A counted sound went by, or the other side was answered | The outline of its creature leaving through the doorway of its side, and the line. | The trial is scored and its window is over. |
| An answer when no sound was made | The fixed line "I made no sound that time." No creature. | No creature made a sound. |
| A turn with no sound, unanswered | Nothing at all. | The page must not mark a silent turn. |
| A search ends | The card shows the creature asleep and "Gone home". A second line says where it went. | It follows the last scored trial of that search. |

The page draws all of this from `trialScored`, `practiceSoundScored` and `roomFinished`, and the flow emits each of those in the moment it scores and not before. So a counted creature cannot be drawn before its trial is decided.

**Which creature comes next is not shown and not known to the page.** The snapshot does not hold the turn.

## The copy

Every string is in `src/copy`. New, in `creature-copy.ts`:

| What | Example |
|---|---|
| `creatureIntroLine` | "Squeak, the bat from the attic. A thin, high whine." |
| `rollCallCopy` | Heading "Meet them". "Each one makes its sound once in each ear, loud enough to hear easily." "Answer which side it came from. Nothing counts yet." When it counts: "Now it counts. They take turns in no order, and some turns make no sound at all." "The bars beside each one show your quietest catch on each side." |
| `rollCallCaughtLine` | "That was Squeak." |
| `rollCallNotHeardLines` | "Not caught, even a little louder: Thump on your left and Squeak on either side." "Check that the earpieces are in and that the volume is where you set it." "Start counting goes on anyway; a sound you cannot hear here will show as louder than this house can play. Try again plays those sounds once more." |
| `creatureCaughtLine` | "You caught Tink on your right. 2 kHz, 20 dB quieter than your calibration." |
| `creatureSlippedLine` | "Scritch went by on your left." |
| `creatureOtherSideLine` | "That was Murmur, on your right." |
| `creatureGoneLine` | "Squeak has gone back to the attic." |
| `stillAboutLine` | "3 still about", "All gone home" |
| `creatureCaughtCountLine` | "4 caught" |
| `creatureCardLabel` | "Squeak, the bat from the attic. 4 caught. …" with the quietest catch on each side in words. |
| `oneRoomCopy` | The label of the picture, "A dark room with a door at each side, lit by your lantern"; the label of the cards, "Who is in the room"; "Gone home"; the marks "L" and "R". |

Changed (D14):

| Where | Before | Now |
|---|---|---|
| Front door, the line under the title | "A house that gets quieter each time you catch it. …" | "A house whose creatures get quieter each time you catch them. …" |
| Front door, the notes of the two visits | "Three rooms." "Five rooms." | "Three creatures." "Five creatures." |
| Rules | "Something here makes a sound, on your left or on your right, and you tell me which side." "Each time you catch it, it comes back quieter." | "The creatures of this house take turns making a sound, on your left or on your right, and you tell me which side." "Each time you catch one it comes back quieter, and after a while it goes home." |
| Rules, the button | "Enter the first room" | "Enter the room" |
| Replay, the second line of its announcement | "Each one comes from the room and the side where I made it, in the order I made them." | "Each one comes from the side where I made it, with its creature in the doorway, in the order I made them." |

The line for an answer to no sound is the fixed line of `wording.md`. Levels are said relative to the visitor's calibration. No line sets one creature's level against another's: floors are never compared (product.md). No line mocks a miss, and no string speaks of hands. `npm run check:copy` passes.

## The screen

The page of a visit keeps its bar, its sheets and its notices. What it shows for the stage `room` is new and lives in `src/ui/room/`.

### The scene

`buildRoomScene` gives one element with the role of an image and the label of `oneRoomCopy.sceneLabel`. In it: a wall with a doorway at the left and at the right, the floor, and the lantern hanging in the middle with its lights. Its interface:

```ts
export interface RoomScene {
  readonly element: HTMLElement;
  readonly lantern: { element; caughtLine; streakLine };
  setLight(fraction: number): void;
  setFeatured(feature: RoomFeature | null): void;
  caught(side: RoomSide, id: GhostSoundId): void;
  slipped(side: RoomSide, id: GhostSoundId): void;
  rings(side: RoomSide): void;
  cheer(): void;
  clear(): void;
}
```

- `setFeatured` puts a creature in plain view: at the centre for the roll call, or in a doorway while a missed sound is played again.
- `caught` shows a creature in the doorway of its side, lit, with three rings. `slipped` shows its outline leaving by that doorway.
- `rings` and `cheer` answer a caught practice sound: rings at the side that was answered, and one hop of the creature at the centre.
- `setLight` follows the lantern: the room dims as the lights are spent.
- Nothing in the scene moves by itself except the lantern, which sways and flickers in the middle of the room on its own clock. It has no side, and it does not follow the trials.

### The cards

`buildCreatureShelf` gives the row along the floor, one card for each creature of `snapshot.room.creatures`, in visit order. A card shows the creature's drawing, its name, "N caught", and a bar at each side marked "L" and "R". A bar's height is where that creature's quietest catch on that side stands between the top and the floor of its own search. Once the search has ended the card shows the creature asleep and "Gone home".

- A card flashes softly when its creature was caught (`flash(id)`).
- The two bars of one card can be set against each other: that is the left ear against the right on one floor, which the product may claim. Nothing joins one card to another, and the cards are not drawn on one scale (D11).
- During the roll call a card shows the creature's introduction as its label and no count.
- Each card has a label for a visitor who cannot see it (`creatureCardLabel`).

### The rest of the room

- **The words under the lantern**: the heading and lines of the roll call, then the two lines of the counting. Through the counting they stand still, so they change with no trial. The line that a sound is playing is shown only for a practice sound.
- **The count**: beside the lantern, the sounds caught and, from two in a row, the row.
- **The answers**: the left half and the right half of the room take a press or a touch, and the keys take an answer too. The keys are named only where a pointer that hovers is likely (`@media (hover: hover) and (pointer: fine)`), and not on a narrow upright screen.
- **The caption**: one line under the room in which the house says what just happened, and a second line for a creature that went home. Both are announced as status.
- **The bar**: together, it is empty through the roll call and then says how many creatures are still about (D12). One at a time, it names the room and its place among the rooms, as before.
- **A dark lantern**: the room dims slowly, and a line says that the lantern is out and that a light comes back.
- **A notice** (a pause, the not-heard choice): the room stays as it was behind it, faint, and the answers are not offered.

### How the page is put together

`screen-of-snapshot.ts` is pure: from a snapshot it gives what the room shows now (the bar's words, the cards, who is featured, the practice lines, the chase). `reaction-of-event.ts` is pure: from an event it gives the reaction (rings, a creature that went by, a line, a creature gone home) or null. `show-screen.ts` applies both to the scene, the shelf and the caption. `src/ui/room/` imports nothing from `src/session`: it is given ids, sides, numbers and strings. The import boundary of `src/ui` holds.

`main.visit` carries the state as data attributes for the stylesheet: `data-roll-call`, `data-lantern`, `data-replay`, `data-house`, `data-shelf`.

### Small screens

The room is laid out from a few measures in `room.css`: the height of the cards and of the caption, the width of a doorway, and the zone kept for the words under the lantern. Three rules change them (D15).

- **A window that is not tall** (at most 700 px high): smaller measures.
- **A narrow upright screen** (at most 40rem wide, upright): the doorways start lower, so that the lines of the counting end above them. A card's count may reach into the card's edge, so that the longest count and "Gone home" stay whole. The key names are not shown.
- **A phone on its side** (at most 520 px high, wider than high): through the roll call the cards are hidden and the floor is low, so that the practising creature stands clear under the words. When the counting begins the cards fade in and the floor rises over 0.9 s. Narrower than 48rem, both counts stand at the right of the lantern, each on a row of its own, clear of the bar's buttons.

### Motion and fades

Every change of brightness in the room is a fade of at least 0.2 s (audio-safety rule 9). A creature appears at its place and fades in. Nothing comes towards the visitor. With reduced motion every state is still shown and still fades, and nothing sways, flickers, hops, beats or travels.

## What makes it a game

The owner asked to think about what makes it more fun. These are the answers the design gives, and each of them leaves the measurement as it was.

- **Somebody to catch.** A sound has a maker with a name, a face and a home. "You caught Tink on your right" is a different thing to read than a level.
- **You do not know who comes next.** Five different sounds in no order ask for listening. One sound sixty times in a row asks for patience. The no-sound turns stay, so a silence is still something to judge.
- **Each creature has its own chase.** Its card counts its catches and shows how deep it was followed on each side. A visitor can see at a glance who is still about and who has been run to ground.
- **They leave one by one.** A search that ends sends its creature home, and the room thins out. The bar counts down: "3 still about". The end of the visit is something the visitor can see coming.
- **The fear is still the quiet.** A caught creature comes back quieter, and nothing in the room is sudden: no stinger, no flash, no creature that jumps (audio-safety rule 9; product.md, "The fear comes from things getting quieter").
- **A miss is shown, not scolded.** A sound that went by is seen leaving by its side, after its time to answer is over. The visitor learns where it was, and the replay later plays every one of them again with its creature.
- **The lantern still makes guessing costly.** Blind answers run the lantern dark; answers to what was heard never do.

What was left out on purpose: points, a timer, levels, anything that rewards speed or compares one visitor with another, and any comparison between creatures.

## The replay, the result and the swapped repeat

- **The replay** plays the missed sounds in the order they were made, which in the one room is the order of the turns. While a sound is played again its creature stands in the doorway of the side it came from, with rings, its words and the count of each side. The flow begins a plain span before it, so the replay is a span of its own, as before.
- **The result** shows one floor for each room, from the summary of the log. A visit of the one room gives a log of the same shape, so the picture, the saved visit and the earlier visit are untouched.
- **The swapped repeat** runs one floor alone, on a plain span, on the runner of one track. Its engine seed is found from the log by counting room runs, which D5 keeps where it was.

## Measurements

**The length of a visit.** Measured on 2026-11-17 with a probe that is not kept in the repository: 200 simulated visitors for each visit type, the same visitors both ways, whole visits through the visit flow's harness at a calibration of −22 dB, thresholds from 35 dB below the calibration to 5 dB above it, answers 0 to 1.4 s after the window opens, no rests. The time is the time in the rooms with their practice.

| Visit | Way | Median | 90th percentile | Longest | Trials, median |
|---|---|---|---|---|---|
| Quick, 3 creatures | one at a time | 4.1 min | 5.0 min | 6.5 min | 73 |
| Quick, 3 creatures | one room | 4.1 min | 5.2 min | 6.4 min | 73 |
| Full, 5 creatures | one at a time | 6.9 min | 8.2 min | 9.3 min | 122 |
| Full, 5 creatures | one room | 6.9 min | 8.4 min | 10.6 min | 123 |

So the one room does not shorten a visit. The same searches run and ask for the same number of trials. What it takes away is the rest between rooms, which the probe did not count, and the stretch of one sound alone. A shorter visit needs fewer trials, and that is a change of the method (Q21, for the owner).

**The playable range.** At the lowest calibration that can be kept, every room keeps at least 30 dB of playable range below the anchor (`playableRangeBelowAnchorMinDb`, audible-start D25). The scale of the chase reaches from the highest search cap of the members to the lowest search floor, and each card is drawn between its own search's cap and floor.

**The simulated visits of the browser tests** (`tests/e2e/simulated-room.ts`, seed 20261120, calibration −22 dB): the quick visit gives 192 moments, with 6 caught practice sounds, 28 caught trials, 19 that went by, 10 scored trials with nothing to show, 3 creatures gone home and 19 sounds played again. The full visit gives 290 moments, with 49 caught trials, 37 that went by, 20 with nothing to show and 20 sounds played again.

## Error handling

| Where | What | What happens |
|---|---|---|
| `createVisitFlow` | `roomsTogetherMaxCount` is not a whole number from 1 up | `RangeError`. |
| `createMixedRoomRunner` | an empty list of tracks | `RangeError("A room run needs at least one track.")`. |
| `createPractisedRoomsRunner` | an empty list of rooms | `RangeError("A practice needs at least one room.")`. |
| `turnSeedOf` | a seed that is not a whole number from 0 to 2³² − 1 | `RangeError` that names the value. |
| `rollCallNotHeardLines` | an empty list | `RangeError`. |
| `stillAboutLine`, `creatureCaughtCountLine`, `creatureCardLabel` | a count that is not a whole number from 0 up | `RangeError` that names the value. |
| `startRoom` | no room of the visit is due | An `Error`: the flow must never start a run with nothing to run. |
| The output stage refuses a trial sound because it is not running | | The flow pauses, as in a room; the trial waits with its creature. |
| One trial's sound is refused three times in a row | | The visit leaves with `soundRefused`, as in a room. |
| The output device changes | | D8: the creatures still about start again; those gone home stay. |
| A practice sound is not caught after its louder repeat | | The not-heard notice, once for the round, naming every creature and side. |

Nothing here is new behaviour for the visitor except the last line's wording. The rest carries a room's rules over to a run of several.

## Correctness properties

The properties of the visit flow, of the practice and of the screen record were written for rooms one after another. Each now runs twice (D16): with `roomsTogetherMaxCount` at 1, and at the shipped count, through `roomRuns` of `tests/properties/visit-flow-harness.ts`. No run count, tolerance or timeout was lowered. What each checks in the one room, beyond what it checked before:

**CP1. The visit ends** (50 visits each way; R3, R7, R17.1). Every drawn visit reaches the result or leaves. After a change of device, every search still going starts again and the visit still ends.

**CP2. The log holds exactly the trials that were played** (50 each way; R1.6, R3.4, R17.1). Each trial is logged with the room and attempt of its own member.

**CP3. Nothing reaches the interface before a trial is scored** (50 each way; R4.7, R8.5, R11.1, R11.2). Between the start of a gap and the decision, no event and no change of the snapshot's creatures, chase or practice comes. It also holds after the first creature has gone home, and the test counts those stretches and fails when there are too few.

**CP4. Answers are judged against their windows** (50 each way; R3.3, R5.1, R8.3). In the roll call an answer is the practised creature's. In the counting an answer is judged against the window of the trial that is presented, and an ignored answer is logged against the creature whose turn waited. The test counts answers held to a creature and to a later creature, and fails when either stays at 0.

**CP5. The log replays through the engine, and the turns replay from the seeds** (50 each way; R4.1 to R4.6, R4.8, R17.2). Each Room_Attempt's trials replay through a search made from its logged seed. Whose turn it was is found again from the engine seeds of the log alone: one draw when a run starts and one after each decided trial, while two or more of the run's searches are open; a trial that was discarded is presented again without a draw. The first room run of every visit holds `min(roomCount, roomsTogetherMaxCount)` searches.

**CP6. The output stage is used as it requires** (50 each way; R6.1, R6.5, R3.3). `beginRoom` is called once for each room run and once before the replay, with the mixed span exactly when together. Every sound is the sound of the creature whose trial it is. The test counts sounds of a later creature and fails unless there are more than the number of visits.

**CP7. Pauses discard and repeat** (50 each way, and a fixed draw of 200; R7.1 to R7.4, R17.3). While a pause holds, nothing is scheduled. A trial or a practice sound that a pause interrupts is presented again as it was, by the same creature. A pause in a gap of the counting is followed by the trial its creature's search was waiting on. A pause in the roll call is followed by more of the roll call, by a new round that starts with the first side that missed, or by the first trial of a search if the visitor goes on. A change of device stops the run of every creature still about and of no other; after the calibration again and a correct headphone check those creatures start their next run with a roll call from its first sound; a creature that has gone home stays there; the rules are shown once. The fixed draw (seed 20261117) shows that the checked visits met sounds presented again after a pause, pauses in a gap, and changes of device before and after a creature had gone home.

**CP8. A stop leaves nothing** (100 each way; R7.5). Nothing scheduled, nothing sounding.

**CP9. The summary and the visit rule follow from the log** (300 pure runs; 50 visits each way; R1.6, R15.3). The summary of a one-room visit is the summary of its log.

**CP10. The same seed gives the same visit** (50 each way; R4.4, R4.8). Two visits with the same seed and the same answers give the same log and the same events, turns included.

**Removed on 2026-11-17:** audio-safety rule 4 was dropped by the project owner, and with it R6, the rise limit counted by creature, and audio-output CP7. The text below is kept as it was decided.

**Audio-output CP7. The rise limit** (200; R6.2 to R6.4, R17.4). A second test draws sequences of sounds of several sound ids in a span by sound: each sound rises by at most one step per ear above the last sound of the same kind, the first sound of its kind on an ear and a replay are not held to an earlier sound, and the cap, the ceiling and the silent other ear hold as before. The earlier test of a plain span is unchanged.

**Audible-start CP1. Practice is never too loud** (50 visits each way; R5.1, R6.2, R17.5). Every room sound the flow asks for is at most its run's search cap and at least its search floor. A practice sound is played at the level it asked for. On each ear within a span each sound rises by at most one upward step above the one before it: the last sound on that ear one at a time, the last sound of the same creature on that ear in the one room. The test counts sounds held past another creature's sound and fails unless there are more than the number of visits.

**Screen leak** (50 drawn visits and a predictor over 120 visits, each way; R11). The record of everything the screen was told holds nothing between the start of a trial's gap and its decision, with the exception of the lantern, which follows the visitor's own answers and the clock. A predictor trained on that record does no better than chance at telling whether a trial has a sound and on which side. In the one room more than half of the checked visits must have taken turns. Whose turn it is is not a feature the predictor can read: the page is never told it.

## Testing strategy

### Unit tests

- `turn-seed.test.ts`: the range, the same seed for the same seeds, the fold checked against a second writing of it, that the order and the number of seeds matter, and the refused values.
- `room-runner.test.ts`, "createMixedRoomRunner": the turns for a scripted turn source, no draw with one open track, the trial of each track presented with its own sound and scored into its own search, a pause and a refused sound that keep the turn, `trackFinished` and `finished` in order, `waitingTrack`, an empty list. The tests of `createRoomRunner` are unchanged and pass on the new code.
- `practised-room-runner.test.ts`: the roll call's order, levels, log, not-heard round, `practising`, the hand-over, and the practice of one room.
- `chase-score.test.ts`: rows across room runs under way at the same time, and across none that were not.
- `create-audio-output.test.ts`: a span by sound holds a sound to the last one of its own kind on that ear and to no other sound's.
- `create-visit-flow.test.ts`, "one room in which the creatures take turns": the members of a run, the seeds and their order, the spans, the events of a search that ends, the snapshot's creatures and practice, the pause and the device rules, an ignored answer, a count from 2 to 4, and the refused option. The earlier cases of the flow run with the count at 1 and are unchanged.
- `creature-copy.test.ts`: every line, for every creature; the banned words; the refused counts.
- `screen-of-snapshot.test.ts`, `reaction-of-event.test.ts`, `show-caption.test.ts`: what the room shows for each snapshot and event, in the one room and one at a time.

### Browser tests

All run headless and muted. None checks what anything sounds like.

- `room.spec.ts`: each row of the table in "The creatures", the dark lantern, a creature going home, the not-heard choice and a pause, on moments of whole simulated visits; the same with every motion and with less motion; that every change of brightness is a fade; and, at seven sizes from 360 by 640 to 1280 by 800, that nothing lies over anything else, everything is on the page, no word on a card is cut off and nothing scrolls sideways, in three states: the roll call with the longest introduction, the counting just after a creature went home, and a dark lantern with long counts.
- `visit.spec.ts`: the built page from the front door into the one room, the roll call answered by keyboard and by touch, the not-heard choice, a pause and a stop.
- `replay.spec.ts`, `swapped-repeat.spec.ts`, `result-page.spec.ts`, `result-repeat.spec.ts`: as before, on the new room and on one-room visits.
- `whole-visit.spec.ts` and `whole-swapped-repeat.spec.ts` walk whole visits in real time and are skipped unless asked for with `WHOLE_VISIT=1`.

D17 lists the choices made in these tests.

### Run counts and time

| Check | Count | Time on the owner's machine |
|---|---|---|
| `npx vitest run`, everything | 253 files passed and 4 skipped; 3476 tests passed, 1 expected failure, 1 skipped, 3 todo | about 81 s |
| Each visit-flow property | 50 visits each way (CP8: 100; CP9: 300 pure runs and 50 visits) | within its 120 s |
| `npx playwright test`, both sizes | 153 passed, 5 skipped | 2.8 min |
| `whole-visit.spec.ts`, asked for | 1 | 3.6 min |
| `whole-swapped-repeat.spec.ts`, asked for | 1 | 4.1 min |

The browser suite needs a quiet machine. One run beside other heavy work on 2026-11-17 took 17.7 min and failed 16 tests on timeouts. The same code passed whole on the next run.

### Counterexamples

- The browser tests found faults of the page at small sizes, which `room.css` now answers: the lines of the counting ran into the doorways on a narrow upright screen; a card's count was cut off at 360 px; on a phone on its side the practising creature stood under the cards, and the counts ran under the bar's buttons.
- `whole-swapped-repeat.spec.ts` failed on its first run with `WHOLE_VISIT=1`: no floor offered the repeat. Its in-page listener heard down to 20 dB below its reference on the left and 45 dB below on the right. The test keeps the lowest calibration that can be kept, where every room's search reaches only 30 dB below the calibration, so the right ear heard every sound down to the floor and had no quietest catch to compare. The listener predates the playable floor of the audible-start spec, and the test is skipped by default, so nobody had seen it. The listener's ears were moved inside the playable range (15 and 35 dB below its reference), with no assertion changed. The fault was in the test's listener and not in the one room.

### Requirement coverage

| Requirement | Checked by |
|---|---|
| R1 The contracts only grow | `npm run typecheck` with every earlier literal unchanged; CP2, CP9; the unchanged tests of the replay, the result and the swapped repeat. |
| R2 The number is in config | The config test; the flow's unit tests of the option. |
| R3 The searches share one room run | The flow's unit tests; the mixed runner's unit tests; CP1, CP2, CP5. |
| R4 Whose turn it is | The mixed runner's and the turn seed's unit tests; CP3, CP5, CP10. |
| R5 The roll call | `practised-room-runner.test.ts`; the flow's unit tests; CP4, CP7; audible-start CP1. |
| R6 No jump upward, counted by creature | `create-audio-output.test.ts`; audio-output CP7; CP6; audible-start CP1. |
| R7 Pauses, a change of device and a stop | The flow's unit tests; CP7, CP8, CP1. |
| R8 One lantern and one chase | The flow's and the chase score's unit tests; CP3, CP4. |
| R9 The creatures and their words | `creature-copy.test.ts`; `npm run check:copy`. |
| R10 The screen of the room | `screen-of-snapshot.test.ts`, `reaction-of-event.test.ts`; `room.spec.ts`. |
| R11 Nothing before the answer | CP3; the screen-leak properties; `room.spec.ts` (the unanswered silent turn, the practice with no side). |
| R12 No jump scares on the screen | `room.spec.ts` (fades, both motion settings). |
| R13 Small screens | `room.spec.ts` (seven sizes, three states); `visit.spec.ts` at the phone size. |
| R14 A screen for everyone | The axe-core rules in `visit.spec.ts`, `replay.spec.ts` and `swapped-repeat.spec.ts`; the labels in `creature-copy.test.ts` and `screen-of-snapshot.test.ts`. |
| R15 The replay and the result after the one room | `replay.spec.ts`, `result-page.spec.ts`, `result-repeat.spec.ts`; the properties of the missed-sound replay, which draw one-room visits too. |
| R16 The earlier way stays | `roomRuns`; every property both ways; the flow's earlier unit tests at a count of 1. |
| R17 The properties | "Correctness properties". |
| R18 The browser tests | `tests/e2e/`. |
| R19 The steering and the documents | Read by the owner. No test reads them. |

Not checked by any test: what the room sounds like, whether five sounds are told apart by ear, and whether the turns feel right. Those are Q20.

## How the design serves the steering

- **Audio safety.** Every sound still goes through the one output stage. The cap, the ceiling, the fades, the silent other ear and the stop control are untouched. Rule 4 is restated for the one room with the owner's approval and checked by two properties. Rule 9 is kept on the screen: every change of brightness is a fade.
- **The hearing method.** Each search is the threshold search, with the same steps, start, cap, floor, no-sound share and trial limit. Mixing left and right trials in random order was already the method; this spec also mixes the pitches. Whether that changes thresholds is not known (see "Steering", the known limits).
- **The experience rule.** The page is not told whose turn it is, and draws a counted creature only from a scored trial. The practice shows who and never which side.
- **What the result may claim.** A card sets the left ear against the right for one creature. Nothing compares creatures, and nothing compares visitors.
- **Wording.** Levels are relative to the calibration. The fixed line stands. The copy check passes.
- **Structure.** The one number is in `src/config`. Every string is in `src/copy`. The turn source is seeded and passed in; nothing in `src` reads the clock or `Math.random` as a global. `src/ui` imports only `src/session`, `src/copy` and `src/config`.

## Steering

This spec changes three steering files.

### `.kiro/steering/audio-safety.md`

Rule 4 gains the restatement of D4 for a room in which several sounds take turns, with the day of the owner's approval and the number that takes it back.

### `.kiro/steering/product.md`

"What the visitor does", step 3, describes the one room: the creatures, the roll call, the turns and the lantern. The experience rules say "the practice at the start of the room" and that the practice may show who makes the sound, and they say what the screen shows of a creature after a trial is scored. Step 5 says that each missed sound is played again with its creature.

### `.kiro/steering/hearing-method.md`

"The search" says that the searches of all pitches of a visit take turns in one room, and how the turn is drawn. "Practice" describes the roll call. "The lantern" says that one lantern serves all creatures. "Known limits" gains one: mixing the pitches may change how a visitor listens, and that has not been checked against the rooms one after another.

## What this spec leaves to other specs

- The no-headphone replay (brief 09) will draw a recorded visit. A recorded one-room visit is a log like any other, with the turns in the order of its trials.
- The last door (brief 11) and the robot module (brief 10) are untouched.
- The result picture still draws five floors of a house. Whether it should draw the creatures is a question for the result page, not for this spec.
- The video and the submission text. The creatures and the room are what a viewer sees; the disclosure of how the code was written is Q22.

## Questions for the project owner

Each decision below that had more than one option was made by the owner's coordinator on 2026-11-16 or 2026-11-17, at the owner's request: the owner asked for a version to look at and had asked the coordinator to settle questions of this kind. The owner may reverse any of them. Q4 is the exception: the coordinator put it to the owner, and the owner approved it. Q20 to Q22 are open and marked FOR THE OWNER.

**Q1. How many rooms share the room. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) All of them, up to 5, in one room run. (b) Two room runs for the full visit, with a rest between. (c) One at a time, as before. Reason: the owner asked for one room with the sounds found together. The number stays in config, and 1 gives (c).

**Q2. The practice. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) One roll call: every creature once in each ear, then everything counts. (b) Each creature practised just before its first counted trial. (c) No practice. Reason: (b) would tell the visitor which creature comes next, and (c) drops the familiarization the method asks for. The roll call also introduces the creatures, which the game needs.

**Q3. The lantern and the count. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) One lantern and one count for the room, and a tally on each creature's card. (b) A lantern for each creature. Reason: the visitor answers with a side and does not know whose trial it is before the answer, so a lantern for each creature could not be spent honestly.

**Q4. The rise limit in the one room. Put to the owner by the coordinator; approved by the owner on 2026-11-17: (a).** (a) Count rule 4 for each creature on each ear. (b) Keep it for each ear across all creatures and let the output stage cut sounds down. (c) Start every search from a common level and keep them within one step of each other. Reason: under (b) a search is scored on levels that were not played; (c) is a different method. Under (a) the cap and the ceiling are unchanged and each search still climbs one step at a time.

**Q5. Where the turns come from. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) A source seeded by a fold of the run's engine seeds. (b) One more draw from the visit's source. (c) A fixed order, round and round. Reason: (b) moves the seeds that the replay and the swapped repeat find by counting, and breaks every saved visit; (c) lets the visitor count.

**Q6. How a turn is drawn. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) Evenly among the searches that are still open, once after every decision. (b) Weighted towards the search with the most trials left. (c) Never the same creature twice in a row. Reason: (a) is the simplest rule that gives no pattern to learn. (c) would tell the visitor who is not next. With (a) a creature can come several times in a row, and near the end the last creature comes alone, as in a room of its own.

**Q7. What a pause and an ignored answer are logged against. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) A pause against the first creature still about; an ignored answer against the creature whose turn waits. (b) Both against a new "room" of their own. Reason: the log's shape must not change (R1.6). The log is not shown to the visitor.

**Q8. A change of device. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) Every creature still about starts again, with a new roll call; those gone home keep their result. (b) Everything starts again. Reason: a finished search was heard on the earlier device and is as good as it was; a room alone already kept finished rooms across a change of device.

**Q9. Who the creatures are. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) Thump the knocker, Murmur the ghost, Tink the tin toy, Scritch the beetle and Squeak the bat, each named for its sound and housed on its sound's floor, as original drawings. (b) Five ghosts. (c) The host's mark as the ghost. Reason: the owner asked for more than ghosts; names that sound like the sounds help tell them apart; (c) was raised by the owner and set aside by the owner.

**Q10. The room. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) One dark room with a doorway at each side, the lantern in the middle, and creatures that show only once a trial is scored. (b) The earlier cross-section of the house with a game set into it. (c) Creatures that stand in the room all the time. Reason: the owner asked for (a) over (b). Under (c) any movement of a creature could hint at its trial.

**Q11. The cards. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) A count and a bar for each side, each card on its own scale; the earlier line of the room's quietest catch is removed. (b) One scale for all creatures. Reason: (b) sets floors against each other, which the product does not claim.

**Q12. How the page knows it is the one room. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) An optional field `together` on the room's snapshot. (b) The page reads the config. Reason: the page must draw what the flow did, and a test flow may run with another count than the config's.

**Q13. A room that ends, one at a time. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) `roomFinished` gives the line that the creature went home both ways. (b) Only together. Reason: one screen for both ways; the line is true of both.

**Q14. The words. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) As in "The copy". (b) Keep the earlier rules and front door. Reason: the earlier lines promised rooms and "the first room".

**Q15. Small screens. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) As in "Small screens": on a phone on its side the cards wait through the roll call. (b) Smaller cards at every moment. Reason: at 640 by 360 the practising creature, the words and five cards do not fit at once at a size that can be read.

**Q16. The properties. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) Every property of the flow runs both ways, at its full run count each way. (b) Only the shipped way. Reason: the owner can go back with one number only if that way is still checked. The screen-leak recorder still builds lamp nudges and door shadows from the earlier schedule of `src/ui/ambient`, which the page no longer shows; it is kept so that the earlier way stays checked as it was.

**Q17. The browser tests. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) These choices: the fixtures are one-room visits played with the real flow; waiting for the page to come to rest leaves out motion that loops; layouts are measured with less motion, so that the swaying lantern is read at rest; the place of a creature, a doorway and the rings is checked by geometry with both motion settings; bounds are measured from the page in place of the earlier "the house is at least 240 px high"; the whole-visit tests press "Go on" at a rest when the page offers one; the listener of `whole-swapped-repeat.spec.ts` was moved inside the playable range. (b) Screenshot comparison. Reason: (b) fails on every change of a drawing and says little about what went wrong.

**Q18. The earlier house and motion code. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) Left in place, unused by the page of a visit. (b) Deleted. Reason: the result page still uses the house, the screen-leak recorder still reads the ambient schedule, and going back to rooms one at a time may want some of it. Deleting is a small task once the owner has looked.

**Q19. The names of the two visits. Decided by the owner's coordinator; the owner may reverse it: (a).** (a) "about 7 minutes" and "about 12 minutes" stay. (b) New names from the measured medians. Reason: the names cover calibration, the headphone check, the roll call, the replay and the result, and the time in the rooms did not change (Measurements).

**Q20. FOR THE OWNER. Listening.** Nobody has listened to the one room. Three things only a listening session can tell: whether the five sounds are told apart by ear, above all Murmur and Tink, which are neighbours in pitch; whether a quiet creature right after a louder one on the same ear is harder to catch than it should be; and whether the turns feel like a game or like noise.

**Q21. FOR THE OWNER. A shorter visit.** The owner said one room took too long. The one room does not make the visit shorter (Measurements): the quick visit still has about 73 trials. Shorter needs fewer trials: a lower trial limit, a larger step, fewer creatures, or one ear's search ending the other's. Each of those changes the method in `hearing-method.md` and what the result can say. The coordinator did not decide it.

**Q22. FOR THE OWNER. The disclosure.** The code of this spec was written by Claude Code, not by Kiro. The submission must say so, in words the owner chooses.

## Decisions

**D1. Up to `roomsTogetherMaxCount` rooms' searches take turns in one room run, and the value is 5** (Q1). Each stays a room of the log. At 1 the visit runs as before this spec.

**D2. One practice for the run: the roll call** (Q2). Every member in visit order, the left ear and then the right, at the practice levels of the audible-start light plan, with one not-heard notice for the round.

**D3. One lantern and one chase for the run, and a tally for each creature** (Q3). `chaseScoreOf` lets a row run on between room runs under way at the same time.

**D4. In a room in which several sounds take turns, the rise limit of rule 4 is counted for each sound id on each ear** (Q4). Put to the owner by the coordinator and approved by the owner on 2026-11-17. The cap and the ceiling are unchanged. `roomsTogetherMaxCount: 1` takes it back.

**D5. The seed of the turns is `turnSeedOf` of the run's engine seeds, and the visit's source gives no draw for it** (Q5). So the seeds found again by counting the room runs of a log are where they were.

**D6. A turn is drawn evenly among the open tracks, once at the start and once after every decision, and never with one track open** (Q6). `createRoomRunner` is the mixed runner with one track.

**D7. A pause is logged against the first member that has not finished, and an ignored answer against the member whose trial waits** (Q7).

**D8. A change of device starts again every creature still about and none that has gone home** (Q8).

**D9. The creatures are Thump, Murmur, Tink, Scritch and Squeak, each with a kind, a home, a colour and a drawing of this project's own** (Q9). No mark of anyone else is used.

**D10. The screen is one room with a doorway at each side, and the creature of a counted sound is shown only after its trial is scored** (Q10).

**D11. A card shows a count and a bar for each side on the scale of its own search. Nothing compares creatures, and the line of the room's quietest catch is removed** (Q11).

**D12. The snapshot of the room says `together`, and together the bar says how many creatures are still about** (Q12).

**D13. `roomFinished` gives the line that a creature has gone home both ways** (Q13).

**D14. The front door, the rules, the roll call, the counting and the replay speak of creatures in one room** (Q14), with the words of "The copy".

**D15. On a phone on its side the cards wait through the roll call and the floor then rises slowly; on a narrow upright screen the doorways start lower and the key names are not shown** (Q15).

**D16. Every property of the visit flow, the practice property and the screen-leak properties run both ways at their full run counts, and the screen-leak recorder keeps the earlier ambient schedule** (Q16).

**D17. The browser tests use one-room visits played with the real flow, measure layouts at rest, and check places by geometry** (Q17).

**D18. The earlier house and motion code stays in place, unused by the page of a visit** (Q18).

**D19. The visits keep their names, "about 7 minutes" and "about 12 minutes"** (Q19).
