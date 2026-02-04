import Omnitone from './omnitone.esm.js';
import OmnitoneWrapper from './omnitoneWrapper.js';
import AudioContextService from './audioContextService.js';
import {toOmnitoneQuaternionFromAzimuthAndElevation} from './quaternionAdapters.js';

// --- AudioWorkletNode-based tap for rotation latency measurement ---
let audioWorkletModuleLoadPromise = null;

async function ensureRotationLatencyWorkletModuleLoaded(audioContext) {
  if (audioWorkletModuleLoadPromise) return audioWorkletModuleLoadPromise;

  const externalModuleUrl = new URL('./rotation-latency-tap-processor.worklet.js', import.meta.url);

  const getWorklet = () => audioContext.audioWorklet.addModule(externalModuleUrl);

  audioWorkletModuleLoadPromise = getWorklet().catch((error) => {
    console.error(error);
    throw error;
  });
  return audioWorkletModuleLoadPromise;
}

async function createRotationLatencyTapNode(audioContext) {
  await ensureRotationLatencyWorkletModuleLoaded(audioContext);
  return new AudioWorkletNode(audioContext, 'rotation-latency-tap', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
}

/**
 * Create a periodic "pink-ish" noise ambisonic test signal, looped and suitable for rotation latency tests.
 *
 * The signal excites BOTH the omnidirectional channel (channel 0) and a directional component (channel 3)
 * with the same noise.
 */
function createAmbisonicRotationTestSignalSource(audioContext, ambisonicOrder) {
  const ambisonicChannelCount = (ambisonicOrder + 1) * (ambisonicOrder + 1);
  const channelMergerNode = audioContext.createChannelMerger(ambisonicChannelCount);

  // Create a 128-frame *periodic* noise buffer (loop-safe).
  // "Pink-ish" is approximated by setting amplitudes ~ 1/sqrt(bin) over integer FFT bins.
  const frameCount = 128;

  // Deterministic PRNG for reproducible runs.
  let seed = 1337;
  const random01 = () => {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    // Convert to [0, 1)
    return ((seed >>> 0) / 4294967296);
  };

  const samples = new Float32Array(frameCount);
  const nyquistBins = frameCount / 2;

  // Sum of cosine components at exact integer bins → perfectly periodic over `frameCount`.
  // Skip bin 0 (DC) and Nyquist (frameCount/2) to avoid edge artifacts.
  for (let bin = 1; bin < nyquistBins; bin += 1) {
    const phase = random01() * Math.PI * 2;
    const amplitude = 1 / Math.sqrt(bin); // pink-ish (1/f)
    const w = (2 * Math.PI * bin) / frameCount;
    for (let n = 0; n < frameCount; n += 1) {
      samples[n] += amplitude * Math.cos(w * n + phase);
    }
  }

  // Remove DC and normalize.
  let mean = 0;
  for (let n = 0; n < frameCount; n += 1) mean += samples[n];
  mean /= frameCount;

  let peak = 0;
  for (let n = 0; n < frameCount; n += 1) {
    samples[n] -= mean;
    const a = Math.abs(samples[n]);
    if (a > peak) peak = a;
  }

  const normalizer = peak > 0 ? (1 / peak) : 1;
  for (let n = 0; n < frameCount; n += 1) samples[n] *= normalizer;

  const noiseBuffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  noiseBuffer.copyToChannel(samples, 0);

  const bufferSourceNode = audioContext.createBufferSource();
  bufferSourceNode.buffer = noiseBuffer;
  bufferSourceNode.loop = true;

  const sourceGainNode = audioContext.createGain();
  sourceGainNode.gain.value = 0.6;
  bufferSourceNode.connect(sourceGainNode);

  // Excite omnidirectional (0) and a directional component (3).
  const omnidirectionalChannelIndex = 0;
  const directionalChannelIndex = Math.min(3, ambisonicChannelCount - 1);
  sourceGainNode.connect(channelMergerNode, 0, omnidirectionalChannelIndex);
  sourceGainNode.connect(channelMergerNode, 0, directionalChannelIndex);

  return {
    node: channelMergerNode,
    start() {
      bufferSourceNode.start();
    },
    stop() {
      try {
        bufferSourceNode.stop();
      } catch {
      }
    },
    dispose() {
      try {
        bufferSourceNode.disconnect();
      } catch {
      }
      try {
        sourceGainNode.disconnect();
      } catch {
      }
      try {
        channelMergerNode.disconnect();
      } catch {
      }
    },
  };
}

/**
 * Run a soundfield rotation latency measurement for a given ambisonic order using Omnitone in a real AudioContext.
 * Measures time between calling setRotationMatrix3() and the first observed change at the stereo tap.
 */
export async function measureOmnitoneSoundfieldRotationLatencyInMilliseconds({
                                                                               ambisonicOrder,
                                                                               channelMap,
                                                                               toggleCount = 30,
                                                                               toggleIntervalMilliseconds = 250,
                                                                               controlTrialCount = 10,
                                                                               renderQuantumFrames = 128,
                                                                             }) {
  const audioContext = await AudioContextService.ensureRunning();

  // Build Omnitone renderer
  let ambisonicRenderer;
  if (ambisonicOrder === 1) {
    ambisonicRenderer = await Omnitone.createFOARenderer(audioContext, {channelMap});
  } else {
    ambisonicRenderer = await Omnitone.createHOARenderer(audioContext, {ambisonicOrder});
  }

  await ambisonicRenderer.initialize();
  ambisonicRenderer.setRenderingMode('ambisonic');

  // Test source
  const testSignalSource = createAmbisonicRotationTestSignalSource(audioContext, ambisonicOrder);

  // Tap node to observe stereo right after renderer
  const stereoTapBufferSizeFrames = 128; // AudioWorklet typically processes 128-frame render quanta

  // Rotation setter (must be above warmup for AudioWorklet)
  const applyAzimuthDegrees = (degree) => {
    const omnitoneQuaternion = toOmnitoneQuaternionFromAzimuthAndElevation(degree, 0);
    const rotationMatrix3 = OmnitoneWrapper.quaternionToRotationMatrix3(omnitoneQuaternion);
    ambisonicRenderer.setRotationMatrix3(rotationMatrix3);
  };

  // AudioWorkletNode-based tap and measurement logic
  const latencyMeasurementsMilliseconds = [];
  const falsePositiveMeasurementsMilliseconds = [];
  const stereoTapNode = await createRotationLatencyTapNode(audioContext);

  // Route: source -> renderer -> tap -> destination
  testSignalSource.node.connect(ambisonicRenderer.input);
  ambisonicRenderer.output.connect(stereoTapNode);
  stereoTapNode.connect(audioContext.destination);

  let nextMeasurementId = 1;
  let pendingReadyResolve = null;
  let pendingResultResolve = null;

  const waitForReady = () => new Promise((resolve) => {
    pendingReadyResolve = resolve;
  });
  const waitForResult = () => new Promise((resolve) => {
    pendingResultResolve = resolve;
  });

  stereoTapNode.port.onmessage = (event) => {
    const message = event.data || {};

    if (message.type === 'ready' && pendingReadyResolve) {
      const r = pendingReadyResolve;
      pendingReadyResolve = null;
      r(message);
      return;
    }

    if (message.type === 'result' && pendingResultResolve) {
      const r = pendingResultResolve;
      pendingResultResolve = null;
      r(message);
    }
  };

  // Warmup: start the signal and allow a few render quanta to be processed so the worklet has a stable baseline.
  applyAzimuthDegrees(0);
  testSignalSource.start();
  await new Promise((resolve) => setTimeout(resolve, 400));

  // Control trials: arm the detector WITHOUT changing rotation.
  // Any reported latency here is a false positive caused by thresholding/noise.
  for (let i = 0; i < controlTrialCount; i++) {
    const measurementId = nextMeasurementId++;

    const readyPromise = waitForReady();
    const resultPromise = waitForResult();
    stereoTapNode.port.postMessage({
      type: 'arm',
      measurementId,
    });

    const readyMessage = await Promise.race([
      readyPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 200)),
    ]);

    if (!readyMessage || readyMessage.measurementId !== measurementId) {
      stereoTapNode.port.postMessage({type: 'disarm'});
      pendingReadyResolve = null;
      pendingResultResolve = null;
      continue;
    }

    const orientationSetTimeSeconds = audioContext.currentTime;
    stereoTapNode.port.postMessage({
      type: 'mark',
      measurementId,
      orientationSetTimeSeconds,
    });

    // no rotation

    const message = await Promise.race([
      resultPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), toggleIntervalMilliseconds)),
    ]);

    if (message && message.type === 'result' && message.measurementId === measurementId) {
      const deltaMilliseconds = Number(message.deltaMilliseconds);
      if (Number.isFinite(deltaMilliseconds)) falsePositiveMeasurementsMilliseconds.push(deltaMilliseconds);
    }

    stereoTapNode.port.postMessage({type: 'disarm'});
    pendingReadyResolve = null;
    pendingResultResolve = null;
  }

  // Toggle loop: arm, rotate, wait for result or timeout, disarm.
  for (let i = 0; i < toggleCount; i++) {
    const target = i % 2 === 0 ? 180 : 0;
    const measurementId = nextMeasurementId++;

    const readyPromise = waitForReady();
    const resultPromise = waitForResult();

    stereoTapNode.port.postMessage({
      type: 'arm',
      measurementId,
    });

    const readyMessage = await Promise.race([
      readyPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 200)),
    ]);

    if (!readyMessage || readyMessage.measurementId !== measurementId) {
      stereoTapNode.port.postMessage({type: 'disarm'});
      pendingReadyResolve = null;
      pendingResultResolve = null;
      continue;
    }


    const orientationSetTimeSeconds = audioContext.currentTime;
    stereoTapNode.port.postMessage({
      type: 'mark',
      measurementId,
      orientationSetTimeSeconds,
    });
    applyAzimuthDegrees(target);

    const message = await Promise.race([
      resultPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), toggleIntervalMilliseconds)),
    ]);

    // Ignore timeouts (null) and unrelated messages.
    if (message && message.type === 'result' && message.measurementId === measurementId) {
      const deltaMilliseconds = Number(message.deltaMilliseconds);
      if (Number.isFinite(deltaMilliseconds)) latencyMeasurementsMilliseconds.push(deltaMilliseconds);
    }

    stereoTapNode.port.postMessage({type: 'disarm'});
    pendingReadyResolve = null;
    pendingResultResolve = null;
  }

  // Cleanup
  try {
    stereoTapNode.disconnect();
  } catch {
  }
  try {
    stereoTapNode.port.onmessage = null;
  } catch {
  }
  try {
    ambisonicRenderer.output.disconnect();
  } catch {
  }
  try {
    testSignalSource.node.disconnect();
  } catch {
  }
  try {
    ambisonicRenderer.input.disconnect();
  } catch {
  }
  try {
    ambisonicRenderer.dispose?.();
  } catch {
  }
  try {
    testSignalSource.stop();
  } catch {
  }
  testSignalSource.dispose();

  // Stats
  const sorted = latencyMeasurementsMilliseconds.slice().sort((a, b) => a - b);
  const pick = (pick) => {
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(pick * (sorted.length - 1))));
    return sorted[index];
  };

  const sampleRateHertz = audioContext.sampleRate;

  const toSamples = (milliseconds) => (milliseconds * sampleRateHertz) / 1000;

  const quantumHistogram = (valuesMs) => {
    const histogram = {};
    for (const v of valuesMs) {
      const samples = toSamples(v);
      const quantumIndex = Math.max(0, Math.floor(samples / renderQuantumFrames));
      histogram[quantumIndex] = (histogram[quantumIndex] || 0) + 1;
    }
    return histogram;
  };

  return {
    count: sorted.length,
    median: pick(0.5),
    p90: pick(0.9),
    p95: pick(0.95),
    max: sorted.length ? sorted[sorted.length - 1] : null,
    bufferSizeFrames: stereoTapBufferSizeFrames,
    sampleRateHertz,
    renderQuantumFrames,
    renderQuantumHistogram: quantumHistogram(sorted),
    controlTrialCount,
    falsePositiveCount: falsePositiveMeasurementsMilliseconds.length,
    falsePositiveHistogram: quantumHistogram(falsePositiveMeasurementsMilliseconds),
  };
}

export function formatSoundfieldRotationLatencyStatistics(label, statistics) {
  if (!statistics || !statistics.count) return `${label}: no measurements`;

  const histogramToString = (hist) => {
    const keys = Object.keys(hist || {})
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (!keys.length) return 'n/a';
    return keys.map((k) => `${k}q=${hist[k]}`).join(' ');
  };

  const falsePositiveRate = statistics.controlTrialCount
    ? (statistics.falsePositiveCount / statistics.controlTrialCount)
    : 0;

  return (
    `${label}: n=${statistics.count} (buffer size=${statistics.bufferSizeFrames} frames, quantum=${statistics.renderQuantumFrames} frames)` +
    ` | median=${statistics.median.toFixed(2)}ms` +
    ` p90=${statistics.p90.toFixed(2)}ms` +
    ` p95=${statistics.p95.toFixed(2)}ms` +
    ` max=${statistics.max.toFixed(2)}ms` +
    ` | quanta histogram: ${histogramToString(statistics.renderQuantumHistogram)}` +
    ` | control false positives: ${statistics.falsePositiveCount}/${statistics.controlTrialCount} (${(falsePositiveRate * 100).toFixed(1)}%), hist: ${histogramToString(statistics.falsePositiveHistogram)}`
  );
}
