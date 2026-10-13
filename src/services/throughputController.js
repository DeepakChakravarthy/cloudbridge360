export class AdaptiveThroughputController {
  constructor({
    minConcurrency = 2,
    maxConcurrency = 12,
    initialConcurrency,
    desiredWindowMs = 5000,
    sampleSize = 8,
  } = {}) {
    this.minConcurrency = Math.max(1, minConcurrency);
    this.maxConcurrency = Math.max(this.minConcurrency, maxConcurrency);
    this.desiredWindowMs = Math.max(1000, desiredWindowMs);
    this.sampleSize = Math.max(2, sampleSize);
    this.targetConcurrency = Math.min(
      this.maxConcurrency,
      Math.max(this.minConcurrency, initialConcurrency ?? this.minConcurrency),
    );
    this.samples = [];
  }

  recordBatch({ successCount = 0, failureCount = 0, totalBytes = 0, elapsedMs = 0 }) {
    const totalAttempts = successCount + failureCount;
    if (!totalAttempts || elapsedMs <= 0) {
      return this.targetConcurrency;
    }

    const throughputBytesPerSecond = totalBytes / (elapsedMs / 1000);
    const failureRate = failureCount / totalAttempts;

    this.samples.push({
      throughputBytesPerSecond,
      failureRate,
      elapsedMs,
      timestamp: Date.now(),
    });

    if (this.samples.length > this.sampleSize) {
      this.samples.shift();
    }

    const averageThroughput =
      this.samples.reduce((sum, sample) => sum + sample.throughputBytesPerSecond, 0) /
      this.samples.length;
    const averageFailureRate =
      this.samples.reduce((sum, sample) => sum + sample.failureRate, 0) /
      this.samples.length;

    if (averageFailureRate > 0.2) {
      this.targetConcurrency = Math.max(
        this.minConcurrency,
        Math.round(this.targetConcurrency * 0.75),
      );
    } else if (
      averageFailureRate < 0.05 &&
      averageThroughput > 0 &&
      this.targetConcurrency < this.maxConcurrency
    ) {
      this.targetConcurrency = Math.min(
        this.maxConcurrency,
        Math.round(this.targetConcurrency * 1.2),
      );
    }

    return this.targetConcurrency;
  }

  getTargetConcurrency() {
    return this.targetConcurrency;
  }

  snapshot() {
    return {
      targetConcurrency: this.targetConcurrency,
      minConcurrency: this.minConcurrency,
      maxConcurrency: this.maxConcurrency,
      sampleCount: this.samples.length,
      averageThroughputBytesPerSecond:
        this.samples.length > 0
          ? this.samples.reduce((sum, sample) => sum + sample.throughputBytesPerSecond, 0) /
            this.samples.length
          : 0,
      averageFailureRate:
        this.samples.length > 0
          ? this.samples.reduce((sum, sample) => sum + sample.failureRate, 0) /
            this.samples.length
          : 0,
    };
  }
}
