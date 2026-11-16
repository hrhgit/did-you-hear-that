/**
 * The port of the development server that serves the listening page for the Browser_Suite
 * (audio-output design.md, D31). `playwright.config.ts` starts it and `listening-page.spec.ts`
 * opens `listen.html` from it. The preview servers of `preview-servers.ts` serve the built site,
 * which does not hold the listening page.
 *
 * The same server serves the development result sheet, `result-sheet.html`, which
 * `result-page.spec.ts` opens, and the development replay sheet, `replay-sheet.html`, which
 * `replay.spec.ts` and `swapped-repeat.spec.ts` open. The build holds neither of those pages.
 */
export const devServer: Readonly<{
  port: number;
  listeningPagePath: string;
  resultSheetPath: string;
  replaySheetPath: string;
}> = Object.freeze({
  port: 5175,
  listeningPagePath: "/listen.html",
  resultSheetPath: "/result-sheet.html",
  replaySheetPath: "/replay-sheet.html",
});
