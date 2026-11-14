# Brief 09: no-headphone replay

## Goal

A 60 second silent playback of one real visit, for anyone without headphones. Contest judges may score from the video and text alone and may open the site without headphones. This mode is how they see the whole product, and it is also the source footage for the video.

## Behaviour to specify

- Reached from the front door. Needs no audio permission and plays no sound by default. A control can turn sound on, at a comfortable fixed level that is labelled as raised for demonstration.
- Plays back a visit log stored in the repository as a data file. The file is a real visit by the author, and the screen says so, with the date and the headphones used.
- Time is compressed to fit 60 seconds. A visible marker shows that playback is sped up.
- Every sound in the log is drawn as a ripple on its side, labelled with pitch and level, including the ones the visitor missed, which are drawn differently.
- Beside the house, a small chart draws the level going down after each catch and up after each miss for the current room and ear. This is the only place the staircase is shown as a chart.
- No-sound trials are shown as such, with the house's line when the visitor answered one.
- Playback ends on the result page for that visit.
- Controls: pause, restart, and jump to the result.
- A tool validates a visit log file against the log format and refuses a file that was edited so that its trials no longer follow the engine's rules.

## Properties

- Any valid visit log plays back to the end, and the result page shown at the end equals the result computed from the log.

## Out of scope

- Recording. The log comes from the storage module's export.

## Done when

The mode plays a recorded visit from start to result with the sound off, at phone and desktop sizes.
