import { expect, test } from "@playwright/test";
import { resultPageCopy } from "../../src/copy/result-page-copy";
import { roomCopy } from "../../src/copy/room-copy";
import { expectNoHorizontalScroll, openPage } from "./page-checks";
import { previewServers } from "./preview-servers";
import { enterRoom, heading } from "./visit-steps";

// Runs against the built page and waits for real audio and response windows.
test.use({ launchOptions: { args: ["--mute-audio"] } });
test.skip(
  process.env.WHOLE_VISIT !== "1",
  "A whole visit takes minutes. Set WHOLE_VISIT=1 to walk it.",
);

const server = previewServers[0];
if (server === undefined) {
  throw new Error("There is no preview server to test against.");
}
const address = `http://localhost:${String(server.port)}${server.basePath}`;

test("shows the result automatically after an unanswered visit", async ({
  page,
}) => {
  test.setTimeout(8 * 60_000);
  const record = await openPage(page, address);
  await enterRoom(page);

  const result = heading(page, resultPageCopy.heading);
  const goOn = page.locator(".visit-rest").getByRole("button", {
    name: roomCopy.goOnButton,
    exact: true,
  });
  await expect(async () => {
    if (await goOn.isVisible()) {
      await goOn.click({ timeout: 1_000 });
    }
    await expect(result).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 7 * 60_000, intervals: [1_000] });

  await expect(page.locator(".visit-sheet-replay")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(record, "requests to other origins and uncaught errors").toEqual({
    otherOriginRequests: [],
    pageErrors: [],
  });
});
