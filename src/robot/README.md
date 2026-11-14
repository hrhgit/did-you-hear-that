# src/robot

Test-only hooks that let an automated listener play the house through a browser. This code is loaded only when the page is opened in robot mode.

Production code never imports it. No module may import from `robot`. The robot-listener spec adds the single dynamic import that loads it in robot mode.

May import from: `session`, `config`.
