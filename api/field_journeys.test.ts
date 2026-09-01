import { expect, test } from "bun:test";
import { boundedIntegerParam } from "./field_journeys";

test("boundedIntegerParam applies defaults and hard limits", () => {
  expect(boundedIntegerParam(new URLSearchParams(), "depth", 8, 1, 20)).toBe(8);
  expect(boundedIntegerParam(new URLSearchParams("depth=invalid"), "depth", 8, 1, 20)).toBe(8);
  expect(boundedIntegerParam(new URLSearchParams("depth=0"), "depth", 8, 1, 20)).toBe(1);
  expect(boundedIntegerParam(new URLSearchParams("depth=999"), "depth", 8, 1, 20)).toBe(20);
});

test("boundedIntegerParam rejects fractional values", () => {
  expect(boundedIntegerParam(new URLSearchParams("limit=2.5"), "limit", 100, 1, 500)).toBe(100);
});
