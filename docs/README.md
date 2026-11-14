# docs

Documents about the project rather than code. `architecture.md` explains how the parts fit together, `roadmap.md` lists the order of the specs, and `briefs/` holds the brief for each spec. `licences.md` records the licence of every font, image or sound that was not made for this project.

`experiments/` holds measured output that the write-up draws on. The `brief-properties-*.json` files are written by `npm run experiment:properties` and say which of the threshold search brief's properties hold for a version of the search, with the population figures. `brief-properties-spec-first-run.json` is the first complete run, kept for comparison. The `threshold-search-scatter-*.csv` files are written by `npm run experiment:scatter`. All of them describe simulated listeners only.

`reports/sounds.md` is written by `npm run render:sounds`. It lists the sound rules with their limits and, for each sound at 44100 Hz and 48000 Hz, the worst measured value over seeds 1 to 10. Do not edit it by hand.

`experiments/hook-catches.md` records the demonstration of the render check hook in `.kiro/hooks/render-check-on-synth-save.json`: a deliberate bad change to a sound, made by the agent in a new Kiro session, and whether the hook's witness line shows the check running on it. The last task of the ghost-sounds spec writes it. It records two headless CLI runs in which the agent declined the change, and a third in which the hook fired on a change that moves the attic whine out of its band.

`experiments/audio-output-listening.md` will hold the record of the first listen on the development listening page, written by the project owner after following "Manual checks" in `.kiro/specs/audio-output/design.md`: the date, the browsers and their versions, the operating system, the headphones, the kept calibration setting and the answer to every item. It does not exist yet, and no item of that checklist is claimed until it does.
