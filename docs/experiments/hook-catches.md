# Render check hook: demonstration record

This file records the attempts to show the render check hook in `.kiro/hooks/render-check-on-synth-save.json` firing on a deliberate bad change to a ghost sound, as task 14 of `.kiro/specs/ghost-sounds/tasks.md` and the design section "The hook in a headless CLI session" ask. The evidence that the hook ran is a line in the witness log, `/var/folders/00/9s1cvf5n6l909fsq36vfmsw00000gn/T/did-you-hear-that-hook-runs.log` on the project machine. The hook's command writes that line, not the agent. Text marked as a quote is copied exactly from the run's output, including words this project does not otherwise use.

## Outcome

The hook was seen to fire on a deliberate bad change in a headless CLI session, in run 3, with PostFileSave only.

- Run 1 and run 2 are not evidence about the trigger either way. In both, the agent read `src/audio/synth/attic-whine.ts`, declined to make the change because it conflicts with rule 3 of `.kiro/steering/audio-safety.md`, and wrote no file. With no write, neither PostFileSave nor PostToolUse had anything to fire on. That refusal was correct and stays in this record.
- Run 3 used a different deliberate change (D44 in `design.md`). It moves the attic whine from about 8000 Hz to about 4000 Hz and breaks only the band rule of brief 02. The agent made the change with its file tool, and the witness log gained a PostFileSave line for it from the run's own session, with `"exitCode":1`. The hook ran a second time for the restore, with `"exitCode":0`.
- The hook's findings did not reach the agent. The agent reported that no hook output came back, and no event in the stream carries the output. The brief's sentence that the hook "reports failures to the agent" has not been seen to hold in a headless CLI session.

The brief's Done-when line ("the hook has been seen to fire on a deliberate bad change, with that run noted in `docs/experiments/hook-catches.md`") is met by run 3. The PostToolUse fallback was not needed for run 3, so there is no run 4. The Kiro IDE step was not attempted, because these sessions were non-interactive.

## Setting

| | |
|---|---|
| Date | 2026-11-14 |
| Surface | Kiro CLI, headless (`--no-interactive`, V3 engine) |
| Version | `kiro-cli 3.3.0` |
| Started from | a Kiro session started after commit 77d993e, which already held the hook file (added in 65389a5) |
| Witness log before run 1 | 3 lines, all from task 11's hand runs |
| Run 3 started from | a Kiro session started after commit 8085dcf. The hook file was last changed in 8fe2c74 |
| Witness log before run 3 | 5 lines. Line 4 is from the hand run under run 1, line 5 from the other session described under run 2 |

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

## The check run by hand on the band change

Before run 3, the new change was applied with a shell command (`perl -pi`) and the check was run on it, then the file was restored with `git checkout -- src/audio/synth/attic-whine.ts` in the same command. It was on disk from 13:51:25Z to 13:51:26Z. Nothing played it, and no dev server was running. Hook mode was not run by hand, so this added no line to the witness log.

```diff
@@ -36,3 +36,3 @@ export function renderAtticWhine(
     const phaseRadians =
-      plan.startPhaseRadians + 2 * Math.PI * plan.carrierHz * cycles;
+      plan.startPhaseRadians + 1 * Math.PI * plan.carrierHz * cycles;
     const body =
```

The change halves the phase, so the carrier moves from about 8000 Hz to about 4000 Hz, one octave below the attic band (7127 to 8980 Hz). The fade envelopes, the length, the RMS scaling in `finishSound` and the zero end samples are untouched.

**`npm run render:sounds -- --changed src/audio/synth/attic-whine.ts` with the change applied** exited 1 and printed 20 findings, one for each seed from 1 to 10 at 44100 Hz and 48000 Hz, all of them the band rule. The first and last lines:

```
render:sounds: attic at 44100 Hz, seed 1: out-of-band energy 162.2 dB, limit -30 dB.
render:sounds: attic at 44100 Hz, seed 2: out-of-band energy 161.9 dB, limit -30 dB.
...
render:sounds: attic at 48000 Hz, seed 9: out-of-band energy 162.5 dB, limit -30 dB.
render:sounds: attic at 48000 Hz, seed 10: out-of-band energy 162.3 dB, limit -30 dB.
```

`checkSound` tests every rule on its own and lists each one a buffer breaks, so the absence of any other line means that the fade-in, fade-out, duration, level and peak rules were met for all 20 buffers. After the restore, the file's hash was `d4a9b0e89dcd43ab855646fccd98296b8053dbaa`, as committed.

## Run 3: PostFileSave only, with the band change

**Hook file.** Content hash `735ea368042a41f82ddce52cc6d6c99aa3e7e478`, the same file as run 1, unchanged since 8fe2c74. HEAD was 8085dcf when the session started. One hook: `PostFileSave`. No `--trust-workspace` was given.

**Command**, run from the repository root at 2026-11-14T13:51:45Z, exit code 0, finished at 13:52:06Z. The design's command with only the prompt changed (D44):

```bash
kiro-cli chat --v3 --no-interactive --model claude-opus-5.5 \
  --trust-tools=read_file,fs_write,str_replace \
  --output-format stream-json \
  "In src/audio/synth/attic-whine.ts, in the line \`plan.startPhaseRadians + 2 * Math.PI * plan.carrierHz * cycles;\`, change the 2 to 1, so the whine sits near 4000 Hz instead of 8000 Hz. This is a deliberate, temporary change to show the render-check hook catching a break of the band rule of docs/briefs/02-ghost-sounds.md (energy outside one third of an octave around the room's pitch at least 30 dB below the energy inside). It touches no rule in .kiro/steering/audio-safety.md: the fades, the length and the level stay as they are. Nothing plays sound: the hook only renders the buffer and measures it. Save the file with your file tool. Report exactly what the render-check hook told you. Then restore the file straight away, exactly as it was, by changing the 1 back to 2, and save it again. Do not run any shell command." \
  > "$TMPDIR/hook-demo-stream.jsonl"
```

Session `sess_d8f70b7a-271a-4f89-a9e9-7cc56e5a9ffb`. The stream has 174 lines. Line 12 lists the same five steering files as run 1.

**The deliberate change**, made by the agent's `str_replace` tool (stream line 42, tool call `toolu_bdrk_0112ejauGmxYu9qkhWeRwgkT`):

```diff
-      plan.startPhaseRadians + 2 * Math.PI * plan.carrierHz * cycles;
+      plan.startPhaseRadians + 1 * Math.PI * plan.carrierHz * cycles;
```

The restore was a second `str_replace` with the two strings swapped (line 63, `toolu_bdrk_01KRvFmjHP7gjTmt7kT2ex2P`), followed by a `read_file` of lines 36 to 38 (line 70). For each write, the CLI raised a tool approval (lines 44 and 65), which resolved to `"accept"` without a person (lines 47 and 68), because the tool was trusted.

**Witness log.** 5 lines before, 7 lines after. The two new lines in full:

```
{"time":"2026-11-14T13:51:54.511Z","hookInput":"{\"session_id\":\"sess_d8f70b7a-271a-4f89-a9e9-7cc56e5a9ffb\",\"hook_event_name\":\"PostFileSave\",\"cwd\":\"/Users/herh/MyFiles/Projects/did-you-hear-that\",\"file_path\":\"/Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts\"}","paths":["/Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts"],"sounds":["attic"],"exitCode":1}
{"time":"2026-11-14T13:51:58.683Z","hookInput":"{\"session_id\":\"sess_d8f70b7a-271a-4f89-a9e9-7cc56e5a9ffb\",\"hook_event_name\":\"PostFileSave\",\"cwd\":\"/Users/herh/MyFiles/Projects/did-you-hear-that\",\"file_path\":\"/Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts\"}","paths":["/Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts"],"sounds":["attic"],"exitCode":0}
```

Line 6 is the catch. Its `session_id` is the run's session, its event is `PostFileSave` for `attic-whine.ts`, and its `exitCode` is 1. The committed attic whine meets every rule, so exit code 1 for the attic alone means the check rendered the changed file. Its time is the moment the check started, after the first write and before the restore. Line 7 is the hook running for the restore and finding every rule met. Neither line was written by a hand run: the only hand run in this session used changed-file mode, which writes no witness line.

The PostFileSave event's fields are `session_id`, `hook_event_name`, `cwd` and `file_path`, with an absolute path.

**Stream lines around the file writes.** The first write completed on line 48 with the tool's own message, `"Replaced text in /Users/herh/MyFiles/Projects/did-you-hear-that/src/audio/synth/attic-whine.ts"`. Line 51 is the first event from Kiro itself that mentions a hook:

```
51 {"type":"sessionUpdate","data":{"sessionId":"sess_d8f70b7a-271a-4f89-a9e9-7cc56e5a9ffb","update":{"sessionUpdate":"session_info_update","_meta":{"kiro":{"hook":{"hookId":"/Users/herh/MyFiles/Projects/did-you-hear-that/.kiro/hooks/render-check-on-synth-save.json#hook-0","operationId":"4329ee26-9908-4132-b6bf-f70dd054d4bb","name":"Render check on synthesis save","status":"completed","actionType":"runCommand"},"kind":"hook_update"}}}}}
```

The agent's next thought (lines 52 to 61) reads "No hook output showed up, so I should note that and then restore things back." The restore completed on line 69, and line 75 is a second `hook_update` with the same `hookId`, operation `b76273e4-4281-4c9e-986a-b00a9a63e075` and `"status":"completed"`. The other lines that mention hooks are the agent's own thought and message chunks and the final text on line 174.

**What the agent reported**, the run's `finalText`, quoted in full:

> The render-check hook told me nothing. I changed the 2 to 1 and saved the file with my file tool. No hook output came back after that save, either attached to the tool result or as a separate message. The only response was the tool's own "Replaced text in …/attic-whine.ts".
>
> I then changed the 1 back to 2 and saved again. I re-read the file to confirm it now says `plan.startPhaseRadians + 2 * Math.PI * plan.carrierHz * cycles;`, exactly as before. I ran no shell commands.
>
> So this run didn't show the hook catching the band-rule break. I didn't open `.kiro/hooks` to find out why. Here are some possible reasons, none of them checked:
> - The hook may fire only on saves made in the IDE editor, not on edits made by the agent's file tools.
> - It may be set to watch a file pattern that doesn't match `src/audio/synth/attic-whine.ts`.
> - It may run asynchronously and report somewhere other than this conversation.
> - It may not be enabled.

The agent's account of the hook is wrong on the first point: the witness log and lines 51 and 75 show that the hook fired on both of its saves. What it says it received is borne out by the stream. The `hook_update` events carry a status and no output or exit code, and no other event holds the hook's findings. The Hook actions page of the Kiro documentation (updated 10 October 2026, read on 2026-11-14) says that for a command that exits with a non-zero code, "the stderr output of the command is sent to the agent, and the agent is notified that the hook returned an error". That was not seen here. Whether the CLI put the output somewhere in the agent's context that the agent did not recognise cannot be told from the stream.

**Findings the agent received.** None, by the agent's account and by the stream. Hook mode prints the same finding lines on standard error as changed-file mode, as the hand runs under run 1 showed, so what the hook had to give the agent was the 20 band lines of the hand run above, followed by the line naming the witness log.

**File restored.** After the run, `git status --porcelain` showed nothing for `src/audio/synth/attic-whine.ts`, `git diff` was empty for it, and `git hash-object src/audio/synth/attic-whine.ts` gave `d4a9b0e89dcd43ab855646fccd98296b8053dbaa`, as committed. The bad change was on disk from the first write to the restore, a few seconds within 13:51:45Z to 13:51:58Z. Nothing played it, and no dev server was running.

**Fallback.** Not taken. The file was written and the witness log gained a line for the change, so the condition for the PostToolUse fallback of D20 was not reached.

## What is still open

- Whether the hook's findings reach the agent in a headless CLI session. In run 3 they did not, by the agent's account and by the stream. Until that is settled, the hook's catch is visible in the witness log and the stream's `hook_update` events, not in the agent's turn.
- The IDE step that R15.4 asks for. It was not attempted, and with run 3's line it is no longer required for the Done-when line. It would still show whether the IDE delivers the findings to the agent.

Settled by run 3:

- PostFileSave fires in a headless CLI V3 session (`kiro-cli 3.3.0`) for a write by the agent's `str_replace` tool.
- A headless V3 run loads workspace hooks without `--trust-workspace`.
- The PostFileSave event's fields are `session_id`, `hook_event_name`, `cwd` and `file_path`.
