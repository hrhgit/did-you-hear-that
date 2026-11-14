import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import {
  exampleRoomSeeds,
  extremeListenerExamples,
  playExampleRoom,
} from "./checks/cp12-extreme-listener-examples-check";

describe("CP12. Extreme listeners, the examples (R8, R10, R13.5)", () => {
  const seedList = exampleRoomSeeds();
  for (const example of extremeListenerExamples) {
    it(`${example.listener}: ${example.expectation}, and the room ends within Room_Trial_Limit`, () => {
      for (const seeds of seedList) {
        const result = playExampleRoom(example, seeds, hearingMethodConfig);
        expect(
          example.problemWith(result),
          `engine seed ${String(seeds.engineSeed)}, listener seed ${String(seeds.listenerSeed)}`,
        ).toBeUndefined();
      }
    });
  }
});
