import assert from "node:assert/strict";
import { test } from "node:test";
import { hasNativeViewHierarchy } from "../../src/page-objects/app.page.js";

test("Given a native view hierarchy, When checked, Then it is available", () => {
  assert.equal(hasNativeViewHierarchy("<hierarchy><node /></hierarchy>"), true);
});

test("Given an empty hierarchy, When checked, Then it is rejected", () => {
  assert.equal(hasNativeViewHierarchy(""), false);
  assert.equal(hasNativeViewHierarchy(" \n\t "), false);
});
