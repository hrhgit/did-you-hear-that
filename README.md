# Did You Hear That?

A haunted house that gets quieter every time you catch it. You walk out knowing what each of your ears missed.

An entry for Kiroween 2026 (Costume Contest category).

## Status

The house opens. A visitor can enter the one visit, hear the music box theme as they enter, check that left and right are the right way round, and read the rules before entering one dark room. They can stop at any time or pause. The creatures of the house live in that room, one for each pitch: Thump, Murmur, Tink, Scritch and Squeak. The room begins with a roll call: each creature makes its sound clearly once on each side, a little louder if it is missed. The roll call does not count toward the score. The game starts automatically when it ends. The creatures take turns in no order. After a clear catch the sound only gets quieter. Good answers and misses help estimate the level at which the sound became hard to catch. Counting ends after at most 5 minutes of active play. The house then goes straight to a picture of the estimated listening level for each ear in each room, next to a statement of what the picture can and cannot tell. The theme plays once as the result opens. From the picture the visitor can visit one floor again with the headphones the other way round, to tell a difference between the ears from one between the earpieces. The visitor can save the picture as an image, and can save the visit in the browser, where it stays until they delete it. Nothing leaves the browser. One thing is not built yet: the 60 second replay that needs no headphones.

## What it will be

A browser experience for headphones. The creatures of the house take turns making a sound on your left or your right. Catch one and it comes back quieter. The first miss after a catch gives the house a rough range. Each creature makes a different pitch, and the picture shows an estimated heard level for each ear and pitch.

It is not a hearing test in the medical sense and it does not diagnose anything. Headphones are not calibrated, so the result only compares your left ear with your right ear, and your own visits with the same headphones and device volume.

## How it is built

The application is built with Kiro. The `.kiro` directory holds the specs, steering files, hooks and settings used during development.

## Development

You need Node.js 26, the version in `.nvmrc`. With nvm, run `nvm use`. Then install the exact versions from the lockfile:

```sh
npm ci
```

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | Unit and property tests, run once |
| `npm run test:e2e` | Playwright tests against a local build. Installs Chromium and builds first |
| `npm run lint` | ESLint and Prettier check |
| `npm run typecheck` | Type-check the browser code and the Node code |
| `npm run format` | Rewrite code and config files in Prettier style |
| `npm run render:sounds` | Render every ghost sound offline and write a spectrum report. Until the ghost sounds exist it only says there is nothing to render |
| `npm run check:copy` | Scan user-facing text for banned words |

On Linux, Playwright's Chromium may need system libraries. Install them once with:

```sh
npx playwright install-deps chromium
```

### Publishing

Every push runs `.github/workflows/ci.yml`. Pushes to `main` also run `.github/workflows/deploy.yml`, which repeats the checks and publishes `dist/` to GitHub Pages. Before the first deployment, choose GitHub Actions as the Pages source once in the repository settings: **Settings, Pages, Source: GitHub Actions**.

## License

MIT. See [LICENSE](LICENSE).
