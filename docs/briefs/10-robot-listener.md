# Brief 10: robot listener

## Goal

Let Kiro play the deployed site from the front door to the result page in a real browser, through a browser automation MCP server, with a listener whose threshold is chosen in advance.

## Behaviour to specify

- Opening the page with a robot flag in the address loads the robot module. Without the flag the module is not loaded and none of its code is in the main bundle.
- In robot mode the page shows a permanent visible banner saying it is in robot mode, and nothing is written to the stored visits.
- The robot module exposes, to scripts in the page, each trial as it starts: ear or none, level, and start time. It also accepts answers by function call.
- A robot listener script takes a threshold for each ear, a false alarm rate and a seed, and answers accordingly.
- Calibration in robot mode is set to a fixed gain without playing sound.
- The whole visit can run with time sped up through the injected timer.

## MCP

- Add a browser automation MCP server to the workspace configuration under `.kiro`.
- Write a short prompt file under `docs/` that asks Kiro to: open the deployed address in robot mode, run a listener with given thresholds, wait for the result page, take screenshots of the house mid-visit, the replay and the result, and check that the result matches the listener within 5 dB or is marked unreliable.
- Save the screenshots and Kiro's report under `docs/reports/robot-run/`.

## Properties

- With the robot flag absent, no robot code runs and the no-leak property from the interface spec still passes.
- For any robot listener, the result page agrees with the engine's result for the same seed and answers.

## Out of scope

- Using the robot for anything shown to visitors.

## Done when

A recorded run exists in `docs/reports/robot-run/` with screenshots and a pass or fail line, made by Kiro through the MCP server against the deployed site.
