import test from "node:test";
import assert from "node:assert/strict";
import { canonicalLf } from "./seal-file.mjs";

test("seal canonicalization permits only the Git CRLF transport difference", () => {
  assert.equal(canonicalLf("a\r\nb\r\n"), "a\nb\n");
  assert.equal(canonicalLf("a\nb\n"), "a\nb\n");
  assert.equal(canonicalLf("a\rb"), "a\rb");
});
