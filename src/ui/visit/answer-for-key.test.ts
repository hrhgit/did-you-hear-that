import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { answerForKey, type KeyPress } from "./answer-for-key";

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key,
  repeat: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...extra,
});

describe("answerForKey", () => {
  it("takes the arrow keys, and A and L in either case", () => {
    expect(answerForKey(press("ArrowLeft"))).toBe("left");
    expect(answerForKey(press("a"))).toBe("left");
    expect(answerForKey(press("A"))).toBe("left");
    expect(answerForKey(press("ArrowRight"))).toBe("right");
    expect(answerForKey(press("l"))).toBe("right");
    expect(answerForKey(press("L"))).toBe("right");
  });

  it("answers once for a key that is held down", () => {
    expect(answerForKey(press("ArrowLeft", { repeat: true }))).toBeNull();
    expect(answerForKey(press("l", { repeat: true }))).toBeNull();
  });

  it("leaves the browser's shortcuts alone", () => {
    expect(answerForKey(press("ArrowLeft", { altKey: true }))).toBeNull();
    expect(answerForKey(press("l", { ctrlKey: true }))).toBeNull();
    expect(answerForKey(press("a", { metaKey: true }))).toBeNull();
  });

  it("takes no other key as an answer", () => {
    const answers = ["ArrowLeft", "ArrowRight", "a", "A", "l", "L"];
    fc.assert(
      fc.property(
        fc.string().filter((key) => !answers.includes(key)),
        (key) => {
          expect(answerForKey(press(key))).toBeNull();
        },
      ),
    );
    for (const key of ["Enter", " ", "Escape", "Tab", "ArrowUp", "ArrowDown"]) {
      expect(answerForKey(press(key))).toBeNull();
    }
  });
});
