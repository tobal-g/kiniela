import test from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";

const baseEnv = {
  AUTH_SECRET: "test-auth-secret-with-more-than-32-chars"
};

test("SYNC_ENABLED=false is parsed as false", () => {
  const env = loadEnv({ ...baseEnv, SYNC_ENABLED: "false" });
  assert.equal(env.SYNC_ENABLED, false);
});

test("SYNC_ENABLED=true is parsed as true", () => {
  const env = loadEnv({ ...baseEnv, SYNC_ENABLED: "true" });
  assert.equal(env.SYNC_ENABLED, true);
});
