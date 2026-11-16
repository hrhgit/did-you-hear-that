import { describe, expect, it } from "vitest";
import { rippleLabel } from "../../copy/replay-lines";
import { leadSentence } from "./lead-sentence";

describe("leadSentence", () => {
  it("parts a line after its first sentence", () => {
    expect(
      leadSentence("On your left, 4 kHz. It was quiet. Now it is louder."),
    ).toEqual({
      lead: "On your left, 4 kHz.",
      rest: "It was quiet. Now it is louder.",
    });
  });

  it("keeps a line of one sentence whole", () => {
    expect(leadSentence("One sentence.")).toEqual({
      lead: "One sentence.",
      rest: "",
    });
    expect(leadSentence("No full stop")).toEqual({
      lead: "No full stop",
      rest: "",
    });
    expect(leadSentence("")).toEqual({ lead: "", rest: "" });
  });

  it("does not end a sentence inside a number", () => {
    expect(leadSentence("At 2.5 kHz. Then more.").lead).toBe("At 2.5 kHz.");
  });

  it("gives every word of the house's line for a replayed sound, with the side and pitch first", () => {
    for (const side of ["left", "right"] as const) {
      for (const capChangedLevel of [false, true]) {
        const line = rippleLabel(side, 4000, -35, capChangedLevel);
        const { lead, rest } = leadSentence(line);
        expect(`${lead} ${rest}`).toBe(line);
        expect(lead).toContain(side);
        expect(lead).toContain("kHz");
      }
    }
  });
});
