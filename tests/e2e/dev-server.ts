/**
 * The port of the development server that serves the listening page for the Browser_Suite
 * (audio-output design.md, D31). `playwright.config.ts` starts it and `listening-page.spec.ts`
 * opens `listen.html` from it. The preview servers of `preview-servers.ts` serve the built site,
 * which does not hold the listening page.
 *
 * The same server serves the development result sheet, `result-sheet.html`, which
 * `result-page.spec.ts` opens. The build does not hold that page either.
 */
export const devServer: Readonly<{
  port: number;
  listeningPagePath: string;
  resultSheetPath: string;
}> = Object.freeze({
  port: 5175,
  listeningPagePath: "/listen.html",
  resultSheetPath: "/result-sheet.html",
});
