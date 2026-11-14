/**
 * The port of the development server that serves the listening page for the Browser_Suite
 * (audio-output design.md, D31). `playwright.config.ts` starts it and `listening-page.spec.ts`
 * opens `listen.html` from it. The preview servers of `preview-servers.ts` serve the built site,
 * which does not hold the listening page.
 */
export const devServer: Readonly<{ port: number; listeningPagePath: string }> =
  Object.freeze({ port: 5175, listeningPagePath: "/listen.html" });
