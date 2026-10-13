import test from "node:test";
import assert from "node:assert/strict";

import { AdaptiveThroughputController } from "../src/services/throughputController.js";

test("adaptive controller increases concurrency when throughput remains healthy", () => {
  const controller = new AdaptiveThroughputController({
    minConcurrency: 2,
    maxConcurrency: 12,
    initialConcurrency: 4,
    desiredWindowMs: 2000,
  });

  controller.recordBatch({
    successCount: 6,
    failureCount: 0,
    totalBytes: 600 * 1024 * 1024,
    elapsedMs: 1000,
  });

  assert.ok(controller.getTargetConcurrency() >= 4);
  assert.ok(controller.getTargetConcurrency() <= 12);
});

test("adaptive controller backs off when failures spike", () => {
  const controller = new AdaptiveThroughputController({
    minConcurrency: 2,
    maxConcurrency: 10,
    initialConcurrency: 6,
    desiredWindowMs: 2000,
  });

  for (let index = 0; index < 4; index += 1) {
    controller.recordBatch({
      successCount: 1,
      failureCount: 3,
      totalBytes: 40 * 1024 * 1024,
      elapsedMs: 4000,
    });
  }

  assert.ok(controller.getTargetConcurrency() <= 6);
});
