class RotationLatencyTapProcessorWorklet extends AudioWorkletProcessor {
  constructor() {
    super();

    this.isWaitingForResponse = false;
    this.orientationSetTimeSeconds = 0;
    this.measurementId = 0;

    // Feature thresholds (tuned to avoid false positives on steady signals).
    this.minimumBlockEnergy = 0.005;
    this.levelDeltaThreshold = 0.02;
    this.correlationDeltaThreshold = 0.005;

    // Require 3 consecutive blocks to confirm a change (suppresses sporadic noise).
    this.consecutiveHitCount = 0;
    this.requiredConsecutiveHits = 3;

    // Last and baseline feature vectors.
    this.lastFeatures = null;
    this.baselineFeatures = null;

    // Baseline settling: after each arm, collect a few blocks to build a stable baseline.
    this.settlingBlocksRemaining = 0;
    this.baselineAccumulator = null;
    this.baselineAccumulatorCount = 0;

    this.hasMarkedOrientationTime = false;

    this.port.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'arm') {
        this.measurementId = message.measurementId || 0;
        this.isWaitingForResponse = true;
        this.consecutiveHitCount = 0;
        this.hasMarkedOrientationTime = false;
        this.orientationSetTimeSeconds = 0;
        // Start a short settling period to build a stable baseline over multiple blocks.
        this.baselineFeatures = null;
        this.settlingBlocksRemaining = 4;
        this.baselineAccumulator = {rmsLeft: 0, rmsRight: 0, correlationLeftRight: 0};
        this.baselineAccumulatorCount = 0;
      } else if (message.type === 'mark') {
        if (message.measurementId !== this.measurementId) return;
        this.orientationSetTimeSeconds = Number(message.orientationSetTimeSeconds) || 0;
        this.hasMarkedOrientationTime = true;
      } else if (message.type === 'disarm') {
        this.isWaitingForResponse = false;
        this.consecutiveHitCount = 0;
        this.settlingBlocksRemaining = 0;
        this.baselineAccumulator = null;
        this.baselineAccumulatorCount = 0;
        this.baselineFeatures = null;
        this.hasMarkedOrientationTime = false;
        this.orientationSetTimeSeconds = 0;
      }
    };
  }

  computeStereoFeatures(left, right) {
    // RMS per channel and L/R correlation.
    let sumLeft = 0;
    let sumRight = 0;
    let dot = 0;

    for (let i = 0; i < left.length; i += 1) {
      const l = left[i];
      const r = right[i];
      sumLeft += l * l;
      sumRight += r * r;
      dot += l * r;
    }

    const rmsLeft = Math.sqrt(sumLeft / left.length);
    const rmsRight = Math.sqrt(sumRight / right.length);
    const denom = Math.sqrt(sumLeft * sumRight) + 1e-12;
    const correlationLeftRight = dot / denom;

    return {rmsLeft, rmsRight, correlationLeftRight};
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // Expect stereo.
    const inputLeft = input && input[0] ? input[0] : null;
    const inputRight = input && input[1] ? input[1] : null;
    const outputLeft = output && output[0] ? output[0] : null;
    const outputRight = output && output[1] ? output[1] : null;

    if (!inputLeft || !inputRight || !outputLeft || !outputRight) {
      return true;
    }

    // Pass-through.
    outputLeft.set(inputLeft);
    outputRight.set(inputRight);

    // Compute and store features for baseline capture.
    const features = this.computeStereoFeatures(inputLeft, inputRight);
    this.lastFeatures = features;

    const blockEnergy = 0.5 * (features.rmsLeft + features.rmsRight);
    if (blockEnergy < this.minimumBlockEnergy) {
      return true;
    }

    // Baseline settling (arming phase): accumulate a few blocks to build a stable baseline.
    if (this.isWaitingForResponse && this.settlingBlocksRemaining > 0) {
      // Accumulate features to compute a stable baseline.
      this.baselineAccumulator.rmsLeft += features.rmsLeft;
      this.baselineAccumulator.rmsRight += features.rmsRight;
      this.baselineAccumulator.correlationLeftRight += features.correlationLeftRight;
      this.baselineAccumulatorCount += 1;

      this.settlingBlocksRemaining -= 1;

      if (this.settlingBlocksRemaining === 0 && this.baselineAccumulatorCount > 0) {
        this.baselineFeatures = {
          rmsLeft: this.baselineAccumulator.rmsLeft / this.baselineAccumulatorCount,
          rmsRight: this.baselineAccumulator.rmsRight / this.baselineAccumulatorCount,
          correlationLeftRight: this.baselineAccumulator.correlationLeftRight / this.baselineAccumulatorCount,
        };
        this.consecutiveHitCount = 0;

        this.port.postMessage({
          type: 'ready', measurementId: this.measurementId,
        });
      }
      return true;
    }

    if (!this.isWaitingForResponse) {
      return true;
    }

    if (!this.baselineFeatures) {
      return true;
    }

    if (!this.hasMarkedOrientationTime) return true;

    const levelDelta = Math.abs(features.rmsLeft - this.baselineFeatures.rmsLeft) + Math.abs(features.rmsRight - this.baselineFeatures.rmsRight);

    const correlationDelta = Math.abs(features.correlationLeftRight - this.baselineFeatures.correlationLeftRight,);

    const isHit = levelDelta >= this.levelDeltaThreshold || correlationDelta >= this.correlationDeltaThreshold;

    if (isHit) {
      this.consecutiveHitCount += 1;
    } else {
      this.consecutiveHitCount = 0;
    }

    if (this.consecutiveHitCount >= this.requiredConsecutiveHits) {
      // Block-level timing (render quantum). `currentTime` shares the same time base as AudioContext.
      const responseTimeSeconds = currentTime;
      const deltaMilliseconds = (responseTimeSeconds - this.orientationSetTimeSeconds) * 1000;

      this.isWaitingForResponse = false;
      this.consecutiveHitCount = 0;

      this.port.postMessage({
        type: 'result', measurementId: this.measurementId, deltaMilliseconds,
      });
    }

    return true;
  }
}

registerProcessor('rotation-latency-tap', RotationLatencyTapProcessorWorklet);
