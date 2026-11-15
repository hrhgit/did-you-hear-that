import { describe, expect, it } from "vitest";
import { storageErrorKind } from "./storage-error-kind";

describe("storageErrorKind", () => {
  it.each([
    ["QuotaExceededError", new DOMException("full", "QuotaExceededError")],
    [
      "NS_ERROR_DOM_QUOTA_REACHED",
      new DOMException("full", "NS_ERROR_DOM_QUOTA_REACHED"),
    ],
    ["a plain object named QuotaExceededError", { name: "QuotaExceededError" }],
    ["code 22", { name: "Error", code: 22 }],
    ["code 1014", { name: "Error", code: 1014 }],
  ])("calls %s full", (_label, error) => {
    expect(storageErrorKind(error)).toBe("full");
  });

  it.each([
    ["SecurityError", new DOMException("no", "SecurityError")],
    ["a plain Error", new Error("no")],
    ["a TypeError", new TypeError("no")],
    ["another code", { name: "Error", code: 18 }],
    ["code 22 as text", { code: "22" }],
    ["a string", "QuotaExceededError"],
    ["a number", 22],
    ["null", null],
    ["undefined", undefined],
  ])("calls %s refused", (_label, error) => {
    expect(storageErrorKind(error)).toBe("refused");
  });

  it("calls a value whose fields throw when read refused, and does not throw", () => {
    const strange = new Proxy(
      {},
      {
        get() {
          throw new Error("no fields");
        },
      },
    );
    expect(storageErrorKind(strange)).toBe("refused");
  });
});
