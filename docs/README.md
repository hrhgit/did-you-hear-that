# docs

Documents about the project rather than code. `architecture.md` explains how the parts fit together, `roadmap.md` lists the order of the specs, and `briefs/` holds the brief for each spec. `licences.md` records the licence of every font, image or sound that was not made for this project.

`experiments/` holds measured output that the write-up draws on. The `brief-properties-*.json` files are written by `npm run experiment:properties` and say which of the threshold search brief's properties hold for a version of the search, with the population figures. `brief-properties-spec-first-run.json` is the first complete run, kept for comparison. The `threshold-search-scatter-*.csv` files are written by `npm run experiment:scatter`. All of them describe simulated listeners only.
