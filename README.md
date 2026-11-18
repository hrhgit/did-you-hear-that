# Did You Hear That?

A haunted house that gets quieter every time you catch it. You walk out knowing what each of your ears missed.

An entry for Kiroween 2026 (Costume Contest category).

## Status

The house opens. A visitor can choose a short or a long visit, set a music box waltz to a comfortable volume with a slider or the keys, check that left and right are the right way round, read the rules and enter one dark room, and can stop at any time or pause. The creatures of the house live in that room, one for each pitch: Thump, Murmur, Tink, Scritch and Squeak, three of them in the short visit and five in the long one. The room begins with a roll call: each creature makes its sound clearly once on each side, a little louder if it is missed, and nothing of it counts; a side that still misses it can try again or go on. Then the counting begins. The creatures take turns in no order, a caught one comes back quieter, and each goes home when its search is over. After the room the house can play again the sounds the visitor did not catch, and then shows a picture of the quietest sound each ear caught in each room, next to a statement of what the picture can and cannot tell. From the picture the visitor can visit one floor again with the headphones the other way round, to tell a difference between the ears from one between the earpieces. The visitor can save the picture as an image, and can save the visit in the browser, where it stays until they delete it. Nothing leaves the browser. One thing is not built yet: the 60 second replay that needs no headphones.

## What it will be

A browser experience for headphones. The creatures of the house take turns making a sound on your left or your right. Catch one and it comes back quieter. Miss it and it comes back louder. Each creature makes a different pitch, so by the end the house has found the quietest sound each ear caught at each pitch.

It is not a hearing test in the medical sense and it does not diagnose anything. Headphones are not calibrated, so the result only compares your left ear with your right ear, and you with yourself over time.

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
