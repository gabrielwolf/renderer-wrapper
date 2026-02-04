/**
 * OmnitoneWrapper (Engine Layer) – API Contract
 *
 * Responsibilities:
 * - Build and own the WebAudio/Omnitone graph (initialize/dispose).
 * - Load and hold decoded ambisonic buffers (buffer mode) OR bind an external source (streaming mode).
 * - Apply headtracking rotation to the renderer (best-effort).
 *
 * Call-order invariants (guaranteed by PlayerFsm/Transport):
 * 1) initialize() MUST be called before: load/loadFromAudioBuffer, bindSource, gain/volume,
 *    startPublishingAudioUpdates, playback controls.
 * 2) load()/loadFromAudioBuffer() MUST complete before buffer-mode: prepare/play/resume.
 * 3) Buffer-mode methods MUST NOT be used after bindSource() (streaming mode), and vice versa.
 *
 * Error policy:
 * - Contract violations are programmer errors → methods THROW (fail fast).
 * - rotateSoundfieldWithQuaternion() is a best-effort NO-OP until initialized (to tolerate early headtracking).
 * - stopPublishingAudioUpdates() and dispose() are idempotent.
 * - After dispose(), all methods THROW (including rotateSoundfieldWithQuaternion).
 *
 * @extends {OrientationSubscriber}
 */

import AudioContextService from './audioContextService.js';
import Omnitone from './omnitone.esm.js';
import SphericalHarmonics from "./sphericalHarmonics.js";
import {
  toOmnitoneQuaternionFromAzimuthAndElevation,
  toOmnitoneQuaternionFromRotationQuaternion
} from './quaternionAdapters.js';

// These vitejs imports are the original imports in the main app
// import AudioContextService from '@/audio/audioContextService.js';
// import Omnitone from '@/../vendor/omnitone/build/omnitone.esm';
// import OrientationSubscriber from '@/headtracking/orientationSubscriber.js';
// import SphericalHarmonics from '@/audio/sphericalHarmonics.js';
// import {
//   identityQuaternion,
//   toOmnitoneQuaternionFromRotationQuaternion,
// } from '@/core/quaternionAdapters.js';
// import audioCollectorURL from '@/audio/audio-collector.worklet.js?url';

// The Orientation concept is a generalization of head trackers. For simplicity,
// we deal only with Quaternions or 3x3 column-major rotations here.
// class OmnitoneWrapper extends OrientationSubscriber {

class OmnitoneWrapper {
  /** @type {number} */
  #order;
  /** @type {number[]|undefined} */
  #channelMap;
  /** @type {number} */
  #durationInSeconds;
  /** @type {number} */
  #playbackStartedAtTimeInMilliseconds;
  /** @type {number} */
  #playedFromPosition;
  /** @type {number} */
  #elapsedTimeInMilliSeconds;
  /** @type {boolean} */
  #loop;
  /** @type {AudioContext|null} */
  #audioContext;
  /** @type {GainNode|null} */
  #inputGain;
  /** @type {number|null} */
  #volume;
  /** @type {Object|null} */
  #ambisonicsRenderer;
  /** @type {AudioBuffer|null} */
  #contentBuffer;
  /** @type {AudioBufferSourceNode|null} */
  #currentBufferSource;
  /** @type {number|null} */
  #calcElapsedHandler;
  /** @type {string} */
  #renderingMode;
  /** @type {AudioWorkletNode} */
  #energyLoop;
  /** @type {AudioWorkletNode} */
  #audioCollectorNode;
  /** @type {number[]} */
  #sn3dToN3dConversionFactors;
  /**  @type {AudioNode|null} */
  #boundSource;
  /** @type {Function[]} */
  #endedCallbacks;
  /** @type {Function|null} */
  #progressCallback;
  /** @type {(Float32Array) => void} */
  #visualizerCallback;
  /** @type {boolean} */
  #disposed;
  /** @type {Promise<AudioBuffer[]> & { abort?: () => void } | null} */
  #currentLoadPromise;

  /**
   * Constructs an OmnitoneWrapper instance for a given Ambisonic order and optional channel map.
   * @param {number} order - Ambisonics order (1, 2, or 3).
   * @param {number[]} [channelMap] - Optional custom channel map.
   */
  constructor(order, channelMap) {
    // super();
    this.#order = order;
    this.#channelMap = channelMap;
    this.#durationInSeconds = 0;
    this.#playbackStartedAtTimeInMilliseconds = 0;
    this.#playedFromPosition = 0;
    this.#elapsedTimeInMilliSeconds = 0;
    this.#loop = false;
    this.#audioContext = null;
    this.#inputGain = null;
    this.#volume = 1.0;
    this.#ambisonicsRenderer = null;
    this.#contentBuffer = null;
    this.#currentBufferSource = null;
    this.#calcElapsedHandler = null;
    this.#renderingMode = 'ambisonic'; // ambisonic, bypass or off
    this.#energyLoop = null;
    this.#sn3dToN3dConversionFactors = SphericalHarmonics.convertShCoefficientsSn3dToN3d(
      this.#order,
    );
    this.#boundSource = null;
    this.#endedCallbacks = [];
    this.#progressCallback = null;
    this.#visualizerCallback = null;
    this.#disposed = false;
    this.#currentLoadPromise = null;
  }

  /**
   * Gets the estimated playback time in seconds since playback began.
   * Only valid in buffer mode (before bindSource() is called).
   * @returns {number}
   * @throws {Error} If called in streaming mode (after bindSource()).
   */
  get elapsedTimeInSeconds() {
    if (this.#boundSource) {
      throw new Error(
        '[OmnitoneWrapper] elapsedTimeInSeconds is only valid in buffer mode (before bindSource is called)',
      );
    }
    return this.#elapsedTimeInMilliSeconds / 1000;
  }

  /**
   * Gets the total duration of the loaded audio buffer in seconds.
   * Only valid in buffer mode (before bindSource() is called).
   * @returns {number}
   * @throws {Error} If called in streaming mode (after bindSource()).
   */
  get durationInSeconds() {
    if (this.#boundSource) {
      throw new Error(
        '[OmnitoneWrapper] durationInSeconds is only valid in buffer mode (before bindSource is called)',
      );
    }
    return this.#durationInSeconds;
  }

  /**
   * Gets the sample rate of the loaded buffer.
   * Only valid in buffer mode (before bindSource() is called).
   * @returns {number}
   * @throws {Error} If called in streaming mode (after bindSource()).
   */
  get sampleRate() {
    if (this.#boundSource) {
      throw new Error(
        '[OmnitoneWrapper] sampleRate is only valid in buffer mode (before bindSource is called)',
      );
    }
    return this.#contentBuffer?.sampleRate ?? 0;
  }

  /**
   * Gets the total number of samples in the loaded buffer.
   * Only valid in buffer mode (before bindSource() is called).
   * @returns {number}
   * @throws {Error} If called in streaming mode (after bindSource()).
   */
  get totalSamples() {
    if (this.#boundSource) {
      throw new Error(
        '[OmnitoneWrapper] totalSamples is only valid in buffer mode (before bindSource is called)',
      );
    }
    return this.#contentBuffer?.length ?? 0;
  }

  /**
   * Gets whether the playback is set to loop.
   * @returns {boolean}
   */
  get loop() {
    return this.#loop;
  }

  /**
   * Sets whether the playback should loop (unused yet, and no UI button representation).
   * @param {boolean} value
   */
  set loop(value) {
    this.#loop = value;
  }

  /**
   * Gets the internal gain AudioParam.
   * @returns {AudioParam}
   */
  get gain() {
    this.#assertInitialized();

    return this.#inputGain.gain;
  }

  /**
   * Sets the gain level using decibel input.
   * @param {number} gain - Gain value in decibels.
   */
  set gain(gain) {
    this.#assertInitialized();

    if (typeof gain !== 'number') {
      console.warn('[OmnitoneWrapper] Invalid gain type, expected number:', gain);
      return;
    }

    this.#inputGain.gain.exponentialRampToValueAtTime(
      Math.pow(10, gain / 20),
      this.#audioContext.currentTime + 0.2,
    );
  }

  /**
   * Sets the volume using a normalized value [0.0, 1.0].
   * @param {number} volume
   */
  set volume(volume) {
    this.#assertInitialized();

    this.gain = OmnitoneWrapper.volumeToGain(volume);
  }

  /**
   * Exposes the renderer output node for external routing (read-only).
   * Safe to use after initialize().
   * @returns {AudioNode}
   */
  get output() {
    this.#assertInitialized();

    return this.#ambisonicsRenderer.output;
  }

  /**
   * Updates the ambisonic order.
   * @param {number} value
   */
  set order(value) {
    this.#order = value;
  }

  /**
   * Sets a new channel map for Ambisonic decoding.
   * @param {number[]} value
   */
  set channelMap(value) {
    this.#channelMap = value;
  }

  /**
   * Sets the rendering mode of the Omnitone renderer.
   * @param {string} mode - One of 'ambisonic', 'bypass', or 'off'.
   */
  set renderingMode(mode) {
    this.#renderingMode = mode;
    if (this.#ambisonicsRenderer) {
      this.#ambisonicsRenderer.setRenderingMode(mode);
    } else {
      console.warn('[OmnitoneWrapper] Renderer not initialized; storing rendering mode =', mode);
    }
  }

  static #MAX_DB = -10;
  static #MIN_DB = -80;

  /**
   * Converts a linear volume (0–1) to a gain in decibels.
   * @param {number} volume A number between 0.0 and 1.0
   * @returns {number} Decibels between -10 and -80
   */
  static volumeToGain(volume) {
    if (volume <= 0) return OmnitoneWrapper.#MIN_DB;

    const shapedVolume = Math.pow(volume, 0.2); // perceptual shaping
    const gain =
      OmnitoneWrapper.#MIN_DB + (OmnitoneWrapper.#MAX_DB - OmnitoneWrapper.#MIN_DB) * shapedVolume;

    return Math.max(OmnitoneWrapper.#MIN_DB, Math.min(OmnitoneWrapper.#MAX_DB, gain));
  }

  /**
   * @param {Quaternion} quaternion
   * @returns {Float32Array} - 3x3 rotation matrix in column-major order.
   */
  static quaternionToRotationMatrix3(quaternion) {
    const {w, x, y, z} = quaternion;

    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const wx = w * x;
    const wy = w * y;
    const wz = w * z;

    // Omnitone expects Column-Major: [col0, col1, col2]
    return new Float32Array([
      1 - 2 * (yy + zz), // m00 (Col 0, Row 0)
      2 * (xy - wz), // m10 (Col 0, Row 1)
      2 * (xz + wy), // m20 (Col 0, Row 2)

      2 * (xy + wz), // m01 (Col 1, Row 0)
      1 - 2 * (xx + zz), // m11 (Col 1, Row 1)
      2 * (yz - wx), // m21 (Col 1, Row 2)

      2 * (xz - wy), // m02 (Col 2, Row 0)
      2 * (yz + wx), // m12 (Col 2, Row 1)
      1 - 2 * (xx + yy), // m22 (Col 2, Row 2)
    ]);
  }

  static #workletReady = null;

  #onEndedInternal = () => {
    for (const callback of this.#endedCallbacks) {
      try {
        console.debug('OmnitoneWrapper: executing onEnded callback...');
        callback();
      } catch (error) {
        console.error('[OmnitoneWrapper] onEnded callback failed', error);
      }
    }
  };

  #assertNotDisposed() {
    if (this.#disposed) {
      throw new Error('[OmnitoneWrapper] Instance disposed. Create a new instance.');
    }
  }

  #assertInitialized() {
    this.#assertNotDisposed();
    if (!this.#audioContext || !this.#inputGain || !this.#ambisonicsRenderer) {
      throw new Error('[OmnitoneWrapper] Not initialized. Call initialize() first.');
    }
  }

  #assertContentBufferPresent() {
    this.#assertInitialized();
    if (!this.#contentBuffer) {
      throw new Error(
        '[OmnitoneWrapper] No AudioBuffer loaded. Call load()/loadFromAudioBuffer() first.',
      );
    }
  }

  #assertBufferLoaded() {
    this.#assertInitialized();
    if (!this.#contentBuffer) {
      throw new Error(
        '[OmnitoneWrapper] No AudioBuffer loaded. Call load()/loadFromAudioBuffer() first.',
      );
    }
    if (!Number.isFinite(this.#durationInSeconds) || this.#durationInSeconds <= 0) {
      throw new Error(
        '[OmnitoneWrapper] Invalid duration. finalizeLoading() must run after loading.',
      );
    }
  }

  /**
   * Subscribe to audio end events (fires when buffer/playback ends naturally).
   * @param {Function} callback
   */
  onEnded(callback) {
    console.log('omnitoneWrapper: onEnded Callback');
    if (typeof callback === 'function') {
      this.#endedCallbacks.push(callback);
    }
  }

  /**
   * Applies an Omnitone-ready orientation quaternion to the ambisonic renderer.
   *
   * This design keeps the engine layer "dumb": conversion from RotationQuaternion → Omnitone quaternion
   * happens at the boundary where headtracking enters the wrapper (see notify()).
   *
   * @param {OmnitoneQuaternion} quaternion
   */
  rotateSoundfieldWithQuaternion(quaternion) {
    this.#assertNotDisposed();
    // Head tracking can fire before initialize() that would be a no-op until the renderer is online.
    if (!this.#ambisonicsRenderer) return;

    const rotationMatrix3 = OmnitoneWrapper.quaternionToRotationMatrix3(quaternion);
    this.#ambisonicsRenderer.setRotationMatrix3(rotationMatrix3);
  }

  /**
   * Rotates the ambisonic soundfield using azimuth and elevation angles.
   *
   * This is the preferred high-level rotation API.
   * The given angles are interpreted in AmbiX space and then converted
   * into Omnitone's internal coordinate system.
   *
   * Semantics:
   * - azimuth   : rotation around the AmbiX +Z axis (up), in degrees
   * - elevation : rotation around the AmbiX +Y axis (left), in degrees
   *
   * Notes:
   * - It defines the semantic boundary between UI-level orientation
   *   and Omnitone’s internal rotation conventions.
   * - Internally performs the required basis conversion.
   *
   * Important:
   * - Calling this method with (0, 0) is the canonical way to initialize
   *   the renderer orientation.
   * - Replacing this with an identity quaternion will reintroduce incorrect
   *   orientation assumptions in Omnitone (here in the audio Engine, we live
   *   in Ambisonics world, not OpenGL/Three.js world).
   *
   * @param {number} azimuth   Rotation around the vertical axis in degrees.
   * @param {number} elevation Rotation around the lateral axis in degrees.
   */
  rotateSoundfieldWithAzimuthAndElevationAngles(azimuth, elevation) {
    this.#assertNotDisposed();

    if (!this.#ambisonicsRenderer) return;

    const omnitoneQuaternion = toOmnitoneQuaternionFromAzimuthAndElevation(azimuth, elevation);

    const rotationMatrix3 = OmnitoneWrapper.quaternionToRotationMatrix3(omnitoneQuaternion);
    this.#ambisonicsRenderer.setRotationMatrix3(rotationMatrix3);
  }

  /**
   * Finalizes loading and calculates Werck duration.
   * Omnitone warm-up: apply a rotation once after initialize() so the renderer latches state. Omnitone Issue #102
   */
  finalizeLoading = () => {
    this.#assertContentBufferPresent();

    this.rotateSoundfieldWithAzimuthAndElevationAngles(0, 0);
    this.#durationInSeconds = this.#contentBuffer.length / this.#contentBuffer.sampleRate;
  };

  /**
   * Loads an already-decoded AudioBuffer (e.g. from a locally selected WAV file).
   * Keeps OmnitoneWrapper in buffer mode (no bindSource()).
   * @param {AudioBuffer} audioBuffer
   */
  loadFromAudioBuffer = async (audioBuffer) => {
    this.#assertInitialized();

    if (!audioBuffer) {
      throw new Error('[OmnitoneWrapper] loadFromAudioBuffer: audioBuffer is null');
    }

    // Validate channel count vs ambisonics order (full 3D: (N+1)^2)
    const expectedChannels = (this.#order + 1) * (this.#order + 1);
    if (audioBuffer.numberOfChannels !== expectedChannels) {
      throw new Error(
        `[OmnitoneWrapper] loadFromAudioBuffer: channel mismatch. ` +
          `Expected ${expectedChannels}ch for order ${this.#order}, got ${audioBuffer.numberOfChannels}ch.`,
      );
    }

    // Reset playback state (buffer mode)
    this.#boundSource = null;
    this.clearCurrentBufferSource();
    this.#contentBuffer = audioBuffer;
    this.#playedFromPosition = 0;
    this.#elapsedTimeInMilliSeconds = 0;

    this.finalizeLoading();
  };

  /**
   * Stops and disconnects current buffer source.
   */
  clearCurrentBufferSource = () => {
    if (this.#currentBufferSource) {
      this.#currentBufferSource.stop();
      this.#currentBufferSource.disconnect();
      this.#currentBufferSource = null;
    }
    clearInterval(this.#calcElapsedHandler);
    this.#calcElapsedHandler = null;
  };

  /**
   * Starts publishing Ambisonics packages of B-Format raw audio to the provided callback.
   * Intended for driving a real-time soundfield visualizer using decoded directional energy.
   *
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.interval=1000 / 60] - Update interval in milliseconds (default is ~60Hz).
   * @param {function(Float32Array): void} options.callback - Callback to receive the smoothed directional energies.
   *
   * @example
   * omnitoneWrapper.startPublishingAudioUpdates({
   *   interval: 1000 / 60,
   *   callback: (energies) => updateHeatmapTexture(energies)
   * });
   */
  async startPublishingAudioUpdates({interval = 1000 / 60, callback = () => {}} = {}) {
    this.#assertInitialized();

    console.log('Audio updates to the visualizer started');
    // Ensure we always have a callable callback before the worklet starts emitting messages.
    this.#visualizerCallback = callback;

    // Throttle UI/visualizer updates to the requested interval (ms).
    let lastEmitMs = 0;
    try {
      if (this.#energyLoop) {
        this.stopPublishingAudioUpdates();
      }

      if (!this.#audioContext.audioWorklet) {
        console.warn('AudioWorklet not supported in this environment');
        return;
      }

      if (!OmnitoneWrapper.#workletReady) {
        OmnitoneWrapper.#workletReady =
          this.#audioContext.audioWorklet.addModule(audioCollectorURL);
      }

      console.log('[Omnitone] Adding worklet module...');
      await OmnitoneWrapper.#workletReady;
      console.log('[Omnitone] Worklet ready.');

      const inputChannelCount = (this.#order + 1) ** 2;
      const publishedChannelCount = 16; // For 1OA and 2OA this is a wrapper, the visualizer needs 16 channels.
      const framesPerMessage = 960;

      const preGainFactor = 1.0;
      for (let inputChannel = 0; inputChannel < inputChannelCount; inputChannel++) {
        this.#sn3dToN3dConversionFactors[inputChannel] *= preGainFactor;
      }

      console.log('[Omnitone] Creating AudioWorkletNode...');
      const audioCollectorNode = new AudioWorkletNode(this.#audioContext, 'audio-collector', {
        processorOptions: {
          inputChannelCount: inputChannelCount,
          publishedChannelCount: publishedChannelCount,
          sn3dToN3dConversionFactors: this.#sn3dToN3dConversionFactors,
          framesPerMessage: framesPerMessage,
        },
        numberOfInputs: 1,
        numberOfOutputs: 1,
      });

      this.#audioCollectorNode = audioCollectorNode;
      // Connect the worklet node to a silent sink so it gets processed
      const silentGain = new GainNode(this.#audioContext, {gain: 0});
      audioCollectorNode.connect(silentGain);
      silentGain.connect(this.#audioContext.destination);

      this.#audioCollectorNode.port.onmessage = (event) => {
        const data = event.data;
        if (data instanceof Float32Array) {
          const expectedSize = framesPerMessage * publishedChannelCount;
          if (data.length !== expectedSize) {
            console.warn(`Unexpected audio data size: ${data.length} (expected ${expectedSize})`);
          }
          const nowMs =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          if (interval > 0 && nowMs - lastEmitMs < interval) return;
          lastEmitMs = nowMs;
          this.#visualizerCallback(data);
        } else {
          console.warn('Unexpected data from audioCollector:', data);
        }
      };

      this.#energyLoop = this.#audioCollectorNode;

      // Hook whatever is driving the renderer right now
      if (this.#currentBufferSource) {
        this.#currentBufferSource.connect(this.#audioCollectorNode);
      } else if (this.#boundSource) {
        this.#boundSource.connect(this.#audioCollectorNode);
      }
    } catch (error) {
      console.error('[OmnitoneWrapper] Failed to startPublishingAudioUpdates:', error);
    }
  }

  /** Clean audio updates meant for Visualizer */
  stopPublishingAudioUpdates() {
    // Idempotent: safe to call even if never started.
    if (typeof this.#visualizerCallback !== 'function') {
      this.#visualizerCallback = () => {};
    }

    if (!this.#energyLoop) return;

    try {
      this.#energyLoop.port.close();
    } catch {}

    // Emit a zeroed frame to reset visualizer.
    const framesPerMessage = 960;
    const publishedChannelCount = 16;
    const zeroedEnergy = new Float32Array(framesPerMessage * publishedChannelCount);

    try {
      this.#visualizerCallback(zeroedEnergy);
    } catch {}
    try {
      this.#energyLoop.disconnect();
    } catch {}
    try {
      if (this.#currentBufferSource && this.#audioCollectorNode) {
        this.#currentBufferSource.disconnect(this.#audioCollectorNode);
      }
      if (this.#boundSource && this.#audioCollectorNode) {
        this.#boundSource.disconnect(this.#audioCollectorNode);
      }
    } catch {}
    this.#energyLoop = null;
  }

  /**
   * Releases every resource created by this wrapper (buffers, nodes, worklets).
   * Safe to call multiple times.
   */
  dispose = () => {
    if (this.#disposed) return;
    this.#disposed = true;

    // 1) Stop visualizer loop and worklet
    this.stopPublishingAudioUpdates();

    // 2) Teardown buffer‑mode source
    this.clearCurrentBufferSource();

    // 3) Disconnect streaming source, if any
    if (this.#boundSource) {
      try {
        this.#boundSource.disconnect();
      } catch {}
      this.#boundSource = null;
    }

    // 4) Disconnect Omnitone processing graph
    if (this.#ambisonicsRenderer) {
      if (typeof this.#ambisonicsRenderer.dispose === 'function') {
        this.#ambisonicsRenderer.dispose();
      } else {
        try {
          this.#ambisonicsRenderer.output.disconnect();
        } catch {}
      }
      this.#ambisonicsRenderer = null;
    }

    // 5) Disconnect input gain
    if (this.#inputGain) {
      try {
        this.#inputGain.disconnect();
      } catch {}
      this.#inputGain = null;
    }

    // 6) Release heavy decoded buffer
    this.#contentBuffer = null;

    // 7) Drop worklet/node refs
    this.#audioCollectorNode = null;
  };

  // ---------------- Main functions ----------------

  /**
   * Initializes Omnitone rendering pipeline based on Ambisonic order.
   * @returns {Promise<void>}
   */
  async initialize() {
    this.#assertNotDisposed();

    if (this.#audioContext && this.#inputGain && this.#ambisonicsRenderer) return;

    this.#audioContext = await AudioContextService.ensureRunning();
    this.#inputGain = this.#audioContext.createGain();

    if (this.#order === 1) {
      this.#ambisonicsRenderer = await Omnitone.createFOARenderer(this.#audioContext, {
        channelMap: this.#channelMap,
      });
    } else if (this.#order === 2 || this.#order === 3) {
      this.#ambisonicsRenderer = await Omnitone.createHOARenderer(this.#audioContext, {
        ambisonicOrder: this.#order,
      });
    }

    if (!this.#ambisonicsRenderer) {
      throw new Error('[OmnitoneWrapper] Failed to initialize: ambisonicsRenderer is null');
    }

    this.#ambisonicsRenderer.initialize();

    this.#inputGain.connect(this.#ambisonicsRenderer.input);
    this.#ambisonicsRenderer.output.connect(this.#audioContext.destination);
    this.#ambisonicsRenderer.setRenderingMode(this.#renderingMode);

    this.volume = this.#volume;
  }

  /**
   * Aborts an in-flight load() operation (buffer mode) if one is currently running.
   * Idempotent and safe to call even when nothing is loading.
   */
  abortLoad() {
    // Best-effort; createBufferList promise is augmented with abort() in our omnitone fork.
    const currentLoadPromise = this.#currentLoadPromise;
    if (!currentLoadPromise) return;
    try {
      if (typeof currentLoadPromise.abort === 'function') currentLoadPromise.abort();
    } catch (error) {
      console.warn('[OmnitoneWrapper] abortLoad failed', error);
    }
  }

  /**
   * Loads one or more fully-qualified file URLs and decodes them into a single
   * interleaved buffer. The caller is responsible for providing the
   * correct list of chunk URLs.
   *
   * @param {string|string[]} fileUrls – A single URL (1OA) or an array of URLs (HOA chunks).
   * @param {function(TransportProgress):void} progressCallback
   */
  async load(fileUrls, progressCallback) {
    this.#assertInitialized();
    this.#progressCallback = progressCallback;

    // Decode all chunks and merge them channel-wise.
    this.#currentLoadPromise = Omnitone.createBufferList(
      this.#audioContext,
      fileUrls,
      {dataType: 'url'},
      this.#progressCallback,
    );
    let decoded;
    try {
      decoded = await this.#currentLoadPromise;
    } finally {
      this.#currentLoadPromise = null;
    }

    this.#contentBuffer = await Omnitone.mergeBufferListByChannel(this.#audioContext, decoded);

    this.finalizeLoading();
  }

  /**
   * Starts audio playback from a given position.
   * Only valid in buffer mode (before bindSource() is called).
   * @param {number} from - A number between 0 and 1 (0 = start, 1 = end).
   * @throws {Error} If called in streaming mode (after bindSource()).
   */
  play = async (from) => {
    this.#assertBufferLoaded();

    if (this.#boundSource) {
      throw new Error(
        '[OmnitoneWrapper] play() is only valid in buffer mode (before bindSource is called)',
      );
    }
    // tear down any previous source
    if (this.#currentBufferSource) {
      this.clearCurrentBufferSource();
      clearInterval(this.#calcElapsedHandler);
    }
    this.#playedFromPosition = from;
    this.#playbackStartedAtTimeInMilliseconds = Date.now();

    this.#currentBufferSource = this.#audioContext.createBufferSource();
    this.#currentBufferSource.buffer = this.#contentBuffer;
    this.#currentBufferSource.loop = this.#loop;
    this.#currentBufferSource.connect(this.#inputGain);

    this.#currentBufferSource.onended = () => this.#onEndedInternal();

    // Connect to audioCollectorNode if present (for visualizer)
    if (this.#audioCollectorNode) {
      this.#currentBufferSource.connect(this.#audioCollectorNode);
    }

    // recalc elapsed @ 60 Hz
    this.#calcElapsedHandler = setInterval(() => {
      const offset = this.#playedFromPosition * this.#durationInSeconds * 1000;
      this.#elapsedTimeInMilliSeconds =
        Date.now() - this.#playbackStartedAtTimeInMilliseconds + offset;
    }, 17);

    this.#currentBufferSource.start(0, from * this.#durationInSeconds);
  };

  /**
   * Resumes playback from the last known elapsed position.
   * Only valid in buffer mode (before bindSource() is called).
   * Calculates fraction and delegates to `play()`.
   * @throws {Error} If called in streaming mode (after bindSource()).
   */
  resume = () => {
    this.#assertBufferLoaded();

    if (this.#boundSource) {
      throw new Error(
        '[OmnitoneWrapper] resume() is only valid in buffer mode (before bindSource is called)',
      );
    }
    const fraction = this.#elapsedTimeInMilliSeconds / 1000 / this.#durationInSeconds;
    this.play(fraction);
  };

  /**
   * Prepares playback state by seeking to the given time without starting playback.
   * Only valid in buffer mode (before bindSource() is called).
   * @param {number} timeInSeconds - Time position to seek to, in seconds.
   * @throws {Error} If called in streaming mode (after bindSource()).
   */
  prepare(timeInSeconds) {
    this.#assertBufferLoaded();

    if (this.#boundSource) {
      throw new Error(
        '[OmnitoneWrapper] prepare() is only valid in buffer mode (before bindSource is called)',
      );
    }
    this.#elapsedTimeInMilliSeconds = timeInSeconds * 1000;
    this.#playedFromPosition = timeInSeconds / this.#durationInSeconds;
  }

  /**
   * Stops and resets playback position and elapsed time counters.
   * Only valid in buffer mode (before bindSource() is called).
   * @throws {Error} If called in streaming mode (after bindSource()).
   */
  stop = () => {
    this.#assertInitialized();

    if (this.#boundSource) {
      throw new Error(
        '[OmnitoneWrapper] stop() is only valid in buffer mode (before bindSource is called)',
      );
    }
    this.clearCurrentBufferSource();
    this.#playedFromPosition = 0;
    this.#elapsedTimeInMilliSeconds = 0;
  };

  /**
   * @param {RotationQuaternion} rotationQuaternion
   * @returns {void}
   * @override
   */
  notify(rotationQuaternion) {
    if (!rotationQuaternion) return;
    const omnitoneQuaternion = toOmnitoneQuaternionFromRotationQuaternion(rotationQuaternion);
    this.rotateSoundfieldWithQuaternion(omnitoneQuaternion);
  }

  /**
   * Connects a 16 channel source (ACN / SN3D) with the internal HOA renderer input.
   * Intended for streaming mode. Once called, disables all buffer mode control methods
   * (play, stop, resume, prepare, elapsedTimeInSeconds, durationInSeconds, etc.).
   * Existing sources are being disconnected.
   *
   * @param {AudioNode} sourceNode – e.g., a 16 channel gain proxy from createFlacStream
   */
  bindSource(sourceNode) {
    if (!sourceNode) throw new Error('bindSource called with undefined node!');
    if (this.#boundSource) {
      try {
        this.#boundSource.disconnect();
      } catch (error) {
        console.error(error);
      }
    }

    this.#boundSource = sourceNode;
    this.#boundSource.channelCountMode = 'explicit';
    this.#boundSource.channelInterpretation = 'discrete';
    this.#boundSource.connect(this.#inputGain);

    // If the visualiser worklet is alive, tap the stream into it as well
    if (this.#audioCollectorNode) {
      this.#boundSource.connect(this.#audioCollectorNode);
    }
  }
}

export default OmnitoneWrapper;
