# Tasks: one room

These tasks carry out `design.md` of this spec. The owner asked on 2026-11-16 for one room made for the game, with several kinds of sounds found together and several kinds of monsters, and asked for a version to look at. The code was written by Claude Code at the owner's request, because the Kiro credits had run out; the submission says so (Q22). Every task below is done and checked. Nothing of this spec is committed yet: the owner looks at it first.

- [x] 1. Add the number of rooms that run together
  - `roomsTogetherMaxCount: 5` in `visitFlowConfig`, with the config test that it reaches every room of the longest visit.
  - `createVisitFlow` takes it as an option and refuses a count that is not a whole number from 1 up.
  - _Requirements:_ R2
  - _Decisions:_ D1
  - _Files:_ `src/config/visit-flow-config.ts` (+ test), `src/session/create-visit-flow.ts`

- [x] 2. Extend the contracts
  - `RoomSnapshot.creatures` and `together`, `RoomCreature`, `RoomPractice.practising` and `notHeard`, `PracticeMiss`. Every new field is optional.
  - `beginRoom(options?)` with `BeginRoomOptions` and `RiseLimitScope`.
  - _Requirements:_ R1
  - _Decisions:_ D12
  - _Files:_ `src/session/visit-flow-types.ts`, `src/audio/output/create-audio-output.ts`

- [x] 3. Count the rise limit by sound in a mixed span
  - A span by `sound` keeps the previous applied gain for each sound id and ear. The replay and the calibration sound are held to none, as before.
  - A unit test, and a second test in audio-output CP7 at 200 runs.
  - Put to the owner as a loosening of rule 4, and approved by the owner on 2026-11-17.
  - _Requirements:_ R6
  - _Properties:_ audio-output CP7
  - _Decisions:_ D4
  - _Files:_ `src/audio/output/create-audio-output.ts` (+ test), `tests/properties/audio-output-cp7-rise-limit.property.test.ts`

- [x] 4. Seed the turns
  - `turnSeedOf`: the 32-bit FNV-1a fold of the engine seeds, with no draw from the visit's source.
  - _Requirements:_ R4
  - _Decisions:_ D5
  - _Files:_ `src/session/turn-seed.ts` (+ test)

- [x] 5. Write the mixed runner
  - `createMixedRoomRunner` over several tracks: one trial at a time, the turn drawn evenly among the open tracks once at the start and after every decision, kept through a pause and a refused sound. `waitingTrack()`.
  - `createRoomRunner` is the mixed runner with one track; its earlier tests pass unchanged.
  - _Requirements:_ R3, R4, R7
  - _Decisions:_ D6
  - _Files:_ `src/session/room-runner.ts` (+ test)

- [x] 6. Write the roll call
  - `createPractisedRoomsRunner`: every member, the left ear and then the right, at the practice levels; one not-heard notice for the round; `practising` and `notHeard` for the screen; the hand-over to the counting.
  - `createPractisedRoomRunner` is the roll call with one room. Its first unit tests.
  - _Requirements:_ R5
  - _Decisions:_ D2
  - _Files:_ `src/session/practised-room-runner.ts`, `src/session/practised-room-runner.test.ts`

- [x] 7. Run the rooms together in the flow
  - A room run of up to `roomsTogetherMaxCount` members: the spans, the seeds in visit order, one Room_Attempt for each member, the creatures of the snapshot, `roomFinished` for each search that ends.
  - One lantern and one chase for the run, and a tally for each creature.
  - A pause against the first member still about, an ignored answer against the member whose trial waits; a change of device restarts every creature still about and none gone home.
  - _Requirements:_ R3, R7, R8
  - _Decisions:_ D1, D3, D7, D8, D13
  - _Files:_ `src/session/create-visit-flow.ts` (+ test)

- [x] 8. Let a row of catches run on between room runs under way at the same time
  - _Requirements:_ R8
  - _Decisions:_ D3
  - _Files:_ `src/session/chase-score.ts` (+ test)

- [x] 9. Write the creatures and their words
  - Thump, Murmur, Tink, Scritch and Squeak; the roll call, caught, slipped, other-side and gone lines; the cards' labels; the room's labels.
  - The front door, the rules and the replay's announcement speak of creatures in one room. The same replay line in `missed-sound-replay/design.md`.
  - _Requirements:_ R9, R15
  - _Decisions:_ D9, D14, D19
  - _Files:_ `src/copy/creature-copy.ts` (+ test), `src/copy/front-door-copy.ts`, `rules-copy.ts`, `replay-lines.ts` (+ tests), `.kiro/specs/missed-sound-replay/design.md`

- [x] 10. Draw the room
  - The scene with two doorways and the lantern, the cards with their two bars, the five drawings in three moods.
  - The page of a visit draws from the snapshot and from scored events alone. The earlier depth scales of the chase are removed.
  - Small screens, reduced motion, and a fade for every change of brightness.
  - _Requirements:_ R10, R11, R12, R13, R14
  - _Decisions:_ D10, D11, D12, D15, D18
  - _Files:_ `src/ui/room/`, `src/ui/visit/screen-of-snapshot.ts`, `reaction-of-event.ts`, `show-screen.ts`, `show-caption.ts`, `build-visit-page.ts`, `start-visit.ts`, `start-replay-sheet.ts` (+ tests), `src/ui/visit/visit.css`, `index.html`, `replay-sheet.html`

- [x] 11. Run every property both ways
  - `roomRuns` in the harness: the rooms one after another, and the one room. No run count, tolerance or timeout lowered.
  - Each property that could pass on visits that took no turns counts something only turns give, and fails when it stays too low.
  - The screen-leak recorder records a creature gone home and keeps the earlier ambient schedule.
  - _Requirements:_ R16, R17
  - _Properties:_ CP1 to CP10, audio-output CP7, audible-start CP1, screen leak
  - _Decisions:_ D16
  - _Files:_ `tests/properties/`

- [x] 12. Walk the one room in the browser tests
  - `room.spec.ts` on visits played with the real flow by `simulated-room.ts`; `visit.spec.ts` into the one room; the replay, the result and the swapped repeat on one-room visits.
  - The whole-visit tests go on from a rest when one is offered; the listener of `whole-swapped-repeat.spec.ts` was moved inside the playable range.
  - _Requirements:_ R18
  - _Decisions:_ D17
  - _Files:_ `tests/e2e/`

- [x] 13. Write the spec, the steering and the documents
  - This spec. Rule 4 of `audio-safety.md`, restated with the day of the owner's approval. `product.md` and `hearing-method.md` for the one room. The READMEs, `docs/architecture.md` and `docs/roadmap.md`.
  - _Requirements:_ R19
  - _Files:_ `.kiro/specs/one-room/`, `.kiro/steering/`, `README.md`, `docs/`, `src/*/README.md`, `tests/*/README.md`

## Checked

On 2026-11-17: `npm run typecheck`, `npm run lint`, `npm run check:copy`, `npx vitest run` (253 files, 3476 tests passed), `npm run build`, `npx playwright test` (153 passed, 5 skipped), and with `WHOLE_VISIT=1` `whole-visit.spec.ts` and `whole-swapped-repeat.spec.ts`. Nobody has listened to the one room yet (Q20).
