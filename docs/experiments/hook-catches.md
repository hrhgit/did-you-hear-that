# Render check hook: demonstration record

This file records the attempts to show the render check hook in `.kiro/hooks/render-check-on-synth-save.json` firing on a deliberate bad change to a ghost sound, as task 14 of `.kiro/specs/ghost-sounds/tasks.md` and the design section "The hook in a headless CLI session" ask. The evidence that the hook ran is a line in the witness log, `/var/folders/00/9s1cvf5n6l909fsq36vfmsw00000gn/T/did-you-hear-that-hook-runs.log` on the project machine. The hook's command writes that line, not the agent. Text marked as a quote is copied exactly from the run's output, including words this project does not otherwise use.

## Outcome

The hook was not seen to fire in a headless CLI session.

Neither headless run is evidence about the trigger either way. In both runs the agent read `src/audio/synth/attic-whine.ts`, declined to make the change because it conflicts with rule 3 of `.kiro/steering/audio-safety.md`, and wrote no file. With no write, neither PostFileSave nor PostToolUse had anything to fire on.

The Kiro IDE step was not attempted. This session was non-interactive and nobody could run the IDE. The brief's Done-when line ("the hook has been seen to fire on a deliberate bad change, with that run noted in `docs/experiments/hook-catches.md`") is still open.

## Setting

| | |
|---|---|
| Date | 2026-11-14 |
| Surface | Kiro CLI, headless (`--no-interactive`, V3 engine) |
| Version | `kiro-cli 3.3.0` |
| Started from | a Kiro session started after commit 77d993e, which already held the hook file (added in 65389a5) |
| Witness log before run 1 | 3 lines, all from task 11's hand runs |

## Run 1: PostFileSave only

**Hook file.** Content hash `735ea368042a41f82ddce52cc6d6c99aa3e7e478` (`git hash-object`), at commit 77d993e when the session started. One hook: `PostFileSave`, matcher on the synthesis and sound config paths.

**Command**, run from the repository root at 2026-11-14T13:43:12Z, exit code 0, finished at 13:43:33Z:

```bash
kiro-cli chat --v3 --no-interactive --model claude-opus-5.5 \
  --trust-tools=read_file,fs_write,str_replace \
  --output-format stream-json \
  "In src/audio/synth/attic-whine.ts, remove the call that applies the outer fade, so the sound starts at full level. Save the file. Report exactly what the render-check hook told you. Then restore the file exactly as it was and save it again. Do not run any shell command." \
  > "$TMPDIR/hook-demo-stream.jsonl"
```

The CLI accepted the three tool ids.

**The deliberate change.** None was made. The stream holds one tool call, a `read_file` of `src/audio/synth/attic-whine.ts` (stream lines 67 to 71), and no write. The turn summary on stream line 193 lists `"usedTools":["read_file"]`.

**Witness log.** 3 lines before, 3 lines after. No new line.

**Stream lines around the file write.** There was no file write. The only tool call:

```
67 {"type":"sessionUpdate","data":{"sessionId":"sess_c11663c7-a996-4a2c-8399-e5c84f896e51","update":{"sessionUpdate":"tool_call","toolCallId":"toolu_bdrk_0136Cj52hBxGWUNa57PsPL6T","title":"Read File","kind":"read","locations":[{"path":"/Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts"}],"rawInput":{"path":"/Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts","offset":null,"limit":null},"_meta":{"kiro":{"toolOrigin":"default"}}}}}
```

**Stream lines that mention hooks.** Only the agent's own message and thought chunks (lines 38, 98, 145 and 189) and the final text on line 197. No event from Kiro itself mentions a hook, a hook load or a hook run. Line 12 lists the five steering files the session loaded, `audio-safety.md` among them.

**What the agent reported**, the run's `finalText`, quoted in full:

> I didn't make this edit, so I have no render-check hook output to report.
>
> Removing the outer fade so the sound "starts at full level" breaks audio-safety rule 3: "Every sound fades in and fades out over at least 20 ms. Nothing starts at full level." The rules say that when a requested change conflicts with them, I should stop and say so rather than work around it. Planning to revert it straight away doesn't change that. While the file is saved without the fade, a running dev server with hot reload, or any test or render that runs in that window, could play or ship an unfaded whine near 8 kHz.
>
> In this file, the outer fade is applied by the last line, `return finishSound(samples, sampleRateHz, config.outerFadeMs);`. The file is untouched.
>
> If you want to check that the render-check hook catches a missing fade, these approaches don't need a rule-breaking sound in `src/`:
>
> - **A test fixture:** add a deliberately unfaded buffer under `tests/` and point the check at it. That code can never reach the output stage.
> - **A safety test:** add a test that calls `renderAtticWhine` and asserts the first and last 20 ms ramp from zero. A regression would then fail in CI without anyone editing production synthesis code.
> - **Owner approval:** if you're the project owner and want the live-file experiment anyway, say so explicitly and confirm no dev server or browser tab is running. I can then do the edit, report the hook output, and restore the file.

**File restored.** Nothing to restore. Right after the run, `git status --porcelain` and `git diff --stat` printed nothing, and `git hash-object src/audio/synth/attic-whine.ts` gave `d4a9b0e89dcd43ab855646fccd98296b8053dbaa`, as at 77d993e.

## The check run by hand on the same change

The design asks for these two runs to show that the check catches the change, while the trigger is what is in question. The change was applied with a shell command (`perl -pi`), because the agent had made none, and reverted with `git checkout -- src/audio/synth/attic-whine.ts` in the same command. It was on disk from 13:44:32Z to 13:44:34Z. Nothing played it, and no dev server was running.

```diff
@@ -40,5 +40,5 @@ export function renderAtticWhine(
       raisedCosineRamp((config.durationMs - timeMs) / config.bodyReleaseMs);
     samples[n] = body * Math.sin(phaseRadians);
   }
-  return finishSound(samples, sampleRateHz, config.outerFadeMs);
+  return Float32Array.from(samples);
 }
```

**`npm run render:sounds -- --changed src/audio/synth/attic-whine.ts` with the change applied** exited 1 and printed 59 findings, three for each seed from 1 to 10 at 44100 Hz and 48000 Hz, except that the peak line is missing at 48000 Hz, seed 6. The first lines and the last line:

```
render:sounds: attic at 44100 Hz, seed 1: last sample 0.000000, limit exactly 0.
render:sounds: attic at 44100 Hz, seed 1: RMS 21.700 dB from the reference, limit within 0.01 dB.
render:sounds: attic at 44100 Hz, seed 1: peak 1.000 of full scale, limit below 1.
render:sounds: attic at 44100 Hz, seed 2: last sample 0.000000, limit exactly 0.
...
render:sounds: attic at 48000 Hz, seed 6: last sample -0.000000, limit exactly 0.
render:sounds: attic at 48000 Hz, seed 6: RMS 21.700 dB from the reference, limit within 0.01 dB.
render:sounds: attic at 48000 Hz, seed 7: last sample 0.000000, limit exactly 0.
...
render:sounds: attic at 48000 Hz, seed 10: peak 1.000 of full scale, limit below 1.
```

**`echo '{"path":"src/audio/synth/attic-whine.ts"}' | npm run --silent render:sounds -- --hook` with the change applied** exited 1, printed the same 59 findings on standard error, and ended with `render:sounds: witness log: /var/folders/00/9s1cvf5n6l909fsq36vfmsw00000gn/T/did-you-hear-that-hook-runs.log.` It added line 4 to the witness log. That line comes from this hand run, not from a hook:

```
{"time":"2026-11-14T13:44:33.876Z","hookInput":"{\"path\":\"src/audio/synth/attic-whine.ts\"}\n","paths":["src/audio/synth/attic-whine.ts"],"sounds":["attic"],"exitCode":1}
```

**After the revert**, `git status` and `git diff` were empty for the file, its hash was `d4a9b0e89dcd43ab855646fccd98296b8053dbaa` again, and `npm run render:sounds -- --changed src/audio/synth/attic-whine.ts` exited 0 with `render:sounds: attic: every rule met at 44100 Hz and 48000 Hz over 10 seeds.`

**What this shows about the chosen change.** The check catches it, through the last-sample, level and peak rules. The `fadeIn` and `fadeOut` rules are still met. In the attic whine the body envelope already rises over `bodyAttackMs` (200 ms) and falls over `bodyReleaseMs` (300 ms), so taking out `finishSound` does not make the sound start at full level. The design's sentence that this change "breaks the `fadeIn` and `fadeOut` rules so plainly" does not hold for this sound. The prompt's words "so the sound starts at full level" describe something the change does not do, and they are the words the agent quoted when it declined.

## Run 2: PostFileSave and the PostToolUse fallback of D20

**Hook file.** Commit 25db93d ("Add the PostToolUse fallback hook of D20 and its test.") added a second hook to the same file: `"trigger": "PostToolUse"`, `"matcher": "write"`, the same command and timeout. Content hash `cb79c6b0706cce12713be9c3fbdf9255d7a5060e`, at commit 25db93d when the session started. `tests/render-check-hook.test.ts` was extended for it in the same commit.

**Command.** The same command as run 1, from the repository root, in a new headless session (`sess_ac6102cf-a06a-45ba-9bcf-6b898bad84d9`), started at 13:46:16Z, exit code 0, finished at 13:46:37Z.

**The deliberate change.** None was made. The stream holds a `read_file` of `src/audio/synth/attic-whine.ts` (lines 61 to 65) and one shell call, `echo skip` (line 41), which the CLI refused because shell access was not trusted (line 48: "The permission request failed before it was answered, so this call did not run"). There was no write.

**Witness log.** 5 lines before, 5 lines after. No new line during the run. Line 5 was added before the run started and is described below.

**Stream lines around the file write.** There was no file write. The tool calls:

```
41 {"type":"sessionUpdate","data":{"sessionId":"sess_ac6102cf-a06a-45ba-9bcf-6b898bad84d9","update":{"sessionUpdate":"tool_call","toolCallId":"run_command_toolu_bdrk_0179DiS8UZ78z2yZyXPCeWDD","title":"No-op placeholder","kind":"execute","rawInput":{"command":"echo skip","description":"No-op placeholder","run_in_background":false},"_meta":{"kiro":{"toolOrigin":"default"}}}}}
61 {"type":"sessionUpdate","data":{"sessionId":"sess_ac6102cf-a06a-45ba-9bcf-6b898bad84d9","update":{"sessionUpdate":"tool_call","toolCallId":"toolu_bdrk_01Vex9R2VpiaUYsF57K6hugL","title":"Read File","kind":"read","locations":[{"path":"/Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts"}],"rawInput":{"path":"/Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts","offset":null,"limit":null},"_meta":{"kiro":{"toolOrigin":"default"}}}}}
```

**Stream lines that mention hooks.** Only agent message and thought chunks and the final text on line 180. No event from Kiro itself mentions a hook.

**What the agent reported**, the run's `finalText`, quoted in full:

> I didn't make this change, so I have no render-check hook output to report.
>
> Removing the outer fade breaks audio-safety rule 3: "Every sound fades in and fades out over at least 20 ms. Nothing starts at full level." That rule says to stop and say so when a requested change conflicts with it, and it outranks every other requirement. The edit being temporary doesn't change that. While it was in place the file would hold a sound that breaks the rule. If the session ended between the edit and the restore, it would stay that way, and this session has nobody to approve the edit or catch that.
>
> I only read the file. In `src/audio/synth/attic-whine.ts` the outer fade is applied in the last line:
>
> ```ts
> return finishSound(samples, sampleRateHz, config.outerFadeMs);
> ```
>
> The file is unchanged. I also made one shell call by mistake. It was a no-op `echo` and it never ran, because the permission request failed.
>
> If the goal is to check that the render-check hook catches a missing fade, these options avoid breaking the rule:
>
> - **A test-only fixture:** a buffer under `tests/` with no fade, which the check is pointed at. It doesn't touch shipped synthesis code.
> - **A unit test of the fade check itself:** feed the detection logic a buffer with an abrupt start and assert that it fails.
> - **Owner approval:** if you own the project and want this exact edit-and-restore done, say so explicitly in a new session.

**File restored.** Nothing to restore. After the run, `git status --porcelain` showed nothing for `src/audio/synth/attic-whine.ts` and `git diff --stat` was empty.

### A PostToolUse line from another session

Line 5 of the witness log was written at 2026-11-14T13:45:59.937Z, after the second hook was saved to disk and about two seconds before commit 25db93d. It came from another Kiro session working in this repository at the same time on a different spec, not from either headless run and not from the deliberate change. Its event starts:

```
{"session_id":"sess_98ec2de1-7252-49e0-8dbc-a1138cb9588b","hook_event_name":"PostToolUse","cwd":"/Users/herh/MyFiles/Projects/did-you-hear-that","tool_name":"fs_write","tool_input":{"path":"/Users/herh/MyFiles/Projects/did-you-hear-that/.kiro/specs/audio-output/requirements.md","text":...
```

The rest of the event is the text of the written file, cut at 4000 characters, and is not copied here. The line's `sounds` field lists all six sounds and its `exitCode` is 0.

What the line shows:

- The PostToolUse hook ran in some Kiro session for an `fs_write`. The surface of that session is not in the event, and when it started is not known, so the line does not settle whether hooks reload while a session runs.
- The field names of a PostToolUse event are `session_id`, `hook_event_name`, `cwd`, `tool_name` and `tool_input`, with `path` and `text` inside `tool_input`.
- Hook mode took the written file's text as a path, because the text contains `src/audio/synth/`. Its `paths` field holds the start of that text instead of the file's path. Every sound was checked for a write that could not change one, as D40 foresaw.

It is not a catch. It does not count towards the Done-when line.

### The fallback hook afterwards

Commit 8fe2c74 ("Remove the PostToolUse fallback hook after its headless run.") put the hook file and its test back as they were at 77d993e. The file's hash is `735ea368042a41f82ddce52cc6d6c99aa3e7e478` again. The reasons are in D20 of `design.md`.

## What is still open

- The brief's Done-when line. No recorded run has a witness line for the deliberate change.
- Whether PostFileSave fires in a headless CLI V3 session. Neither run wrote a file, so the question was not reached.
- The IDE step that R15.4 asks for.
- Whether a headless V3 run loads workspace hooks without `--trust-workspace`. The CLI's help says that flag lets "Hooks, agents, MCP servers and workflows from this folder load without asking". The design's command does not include it, and neither run reached a point where it would matter.

Before the next attempt, the project owner has to choose how the agent can be asked to make a bad change it will accept under `audio-safety.md`. One way is to state the owner's approval in the prompt. Another is to choose a change that breaks a sound rule that is not an audio-safety rule, such as moving energy out of the band. The prompt should also describe what the change does to this sound, since taking out `finishSound` from the attic whine does not remove its fade.
