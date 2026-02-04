/**
 * Transport implementation for buffered audio using the Omnitone pipeline.
 *
 * This class wraps an OmnitoneWrapper instance to control playback of preloaded audio content.
 * It is intended to be controlled exclusively by the PlayerFsm and must not be used directly by the UI.
 *
 * All time-based controls (_play, _pause, _seek, etc.) are routed through Omnitone's buffer system.
 *
 * @implements {import("@/audio/audioTransport.js").default}
 *
 * @typedef {Object} TransportProgress
 * @property {number} fileIndex - Index of the chunk or segment being loaded.
 * @property {number} loaded - Number of bytes loaded so far.
 * @property {number} total - Total number of bytes to load.
 * @property {OmnitoneWrapper} #omnitoneWrapper - Controls low-level buffer playback and decoding.
 */

import AudioContextService from './audioContextService.js';

class AudioTransportBuffer {
  /** @type {OmnitoneWrapper} Controls low-level buffer playback and decoding. */
  #omnitoneWrapper;
  /** @type {Function} */
  #onEnded;
  /** @type {boolean} */
  #suppressNextEnded;

  /**
   * @param {OmnitoneWrapper} omnitoneWrapper
   */
  constructor(omnitoneWrapper) {
    this.#omnitoneWrapper = omnitoneWrapper;
    this.#onEnded = null;
    // bindSource will hook omnitoneWrapper’s internal AudioBufferSourceNode to the renderer

    this.#omnitoneWrapper.onEnded(() => {
      if (this.#suppressNextEnded) {
        this.#suppressNextEnded = false;
        return;
      }

      if (this.#onEnded) {
        try {
          this.#onEnded();
        } catch (error) {
          console.error('[AudioTransportBuffer] onEnded callback failed', error);
        }
      }
    });
  }

  /**
   * Factory: uses a pre-decoded AudioBuffer (e.g. local WAV) and wires the standard
   * Omnitone output chain (incl. sample-rate compensation) to the destination.
   * No ReplayGain is applied.
   *
   * @param {AudioBuffer} audioBuffer
   * @param {OmnitoneWrapper} omnitoneWrapper
   * @returns {Promise<AudioTransportBuffer>}
   */
  static async createFromAudioBuffer(audioBuffer, omnitoneWrapper) {
    if (!omnitoneWrapper) {
      throw new Error(
        'OmnitoneWrapper instance is null in AudioTransportBuffer.createFromAudioBuffer()',
      );
    }
    if (!audioBuffer) {
      throw new Error('AudioBuffer is null in AudioTransportBuffer.createFromAudioBuffer()');
    }
    if (typeof omnitoneWrapper.loadFromAudioBuffer !== 'function') {
      throw new Error("OmnitoneWrapper is missing 'loadFromAudioBuffer' method.");
    }

    await omnitoneWrapper.loadFromAudioBuffer(audioBuffer);
    const context = await AudioContextService.ensureRunning();

    // --- Sample-rate compensation (binaural) ---
    const referenceImpulseResponseSampleRate = 48000;
    const deviceSampleRate = context.sampleRate;
    const sampleRateCompensationGain =
      Number.isFinite(deviceSampleRate) && deviceSampleRate > 0
        ? Math.min(1.0, referenceImpulseResponseSampleRate / deviceSampleRate)
        : 1.0;

    const sampleRateCompensation = new GainNode(context, {
      gain: sampleRateCompensationGain,
      channelCount: 16,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });

    const postGain = new GainNode(context, {
      gain: 1.0,
      channelCount: 16,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });

    try {
      omnitoneWrapper.output.disconnect();
    } catch {}

    omnitoneWrapper.output
      .connect(sampleRateCompensation)
      .connect(postGain)
      .connect(context.destination);

    return new AudioTransportBuffer(omnitoneWrapper);
  }

  /**
   * Factory: fully loads the werck, decodes via Omnitone, and returns a transport.
   * @param {string[]} fileList  – full URLs of FLAC files (or 1 URL for 1OA).
   * @param {OmnitoneWrapper} omnitoneWrapper
   * @param {function(TransportProgress): void} progressCallback
   * @param {FlacMeta[]} meta - Parsed FLAC metadata for each file
   * @returns {Promise<AudioTransportBuffer>}
   */
  static async create(fileList, omnitoneWrapper, progressCallback, meta) {
    if (!omnitoneWrapper) {
      throw new Error('OmnitoneWrapper instance is null in AudioTransportBuffer.create()');
    }
    if (typeof omnitoneWrapper.initialize !== 'function') {
      throw new Error("OmnitoneWrapper is missing 'initialize' method.");
    }

    await omnitoneWrapper.load(fileList, progressCallback);
    const context = await AudioContextService.ensureRunning();

    // --- Add ReplayGain post-processing stage after Omnitone renderer output ---
    const replayGainWerckGainInDecibel = meta[0].vorbisComment.REPLAYGAIN_WERCK_GAIN;
    console.log('[Transport Layer Buffer] ReplayGain:', replayGainWerckGainInDecibel);
    const replayGainWerckGainInDecibelFloat = parseFloat(
      replayGainWerckGainInDecibel.replace('dB', '').trim(),
    );
    const replayGainWerckGainInLinear = Math.pow(10, replayGainWerckGainInDecibelFloat / 20);

    // Apply ReplayGain post-renderer
    const postGain = new GainNode(context, {
      gain: replayGainWerckGainInLinear,
      channelCount: 16,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });

    // --- Sample-rate compensation (binaural) ---
    // Omnitone's binaural HRIR convolution can become sample-rate dependent when Convolver normalization is disabled.
    // To keep output level stable across device sample rates (e.g. 48k → 192k), apply an attenuation factor.
    // We deliberately never boost when device sample rate is below the reference.
    const referenceImpulseResponseSampleRate = 48000;
    const deviceSampleRate = context.sampleRate;
    const sampleRateCompensationGain =
      Number.isFinite(deviceSampleRate) && deviceSampleRate > 0
        ? Math.min(1.0, referenceImpulseResponseSampleRate / deviceSampleRate)
        : 1.0;

    const sampleRateCompensation = new GainNode(context, {
      gain: sampleRateCompensationGain,
      channelCount: 16,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });

    // Disconnect Omnitone renderer from destination, re-route via sampleRateCompensation -> postGain
    try {
      omnitoneWrapper.output.disconnect();
    } catch {
      // May not be connected yet
    }
    omnitoneWrapper.output
      .connect(sampleRateCompensation)
      .connect(postGain)
      .connect(context.destination);

    return new AudioTransportBuffer(omnitoneWrapper, postGain);
  }

  /**
   * Exposes the internal OmnitoneWrapper instance (for PlayerFsm).
   * @returns {OmnitoneWrapper}
   */
  get omnitoneWrapper() {
    return this.#omnitoneWrapper;
  }

  /**
   * Duration of the loaded audio in seconds.
   * @returns {number}
   */
  get duration() {
    return this.#omnitoneWrapper.durationInSeconds;
  }

  /**
   * Current playback time in seconds.
   * @returns {number}
   */
  get currentTime() {
    return this.#omnitoneWrapper.elapsedTimeInSeconds;
  }

  /**
   * Begins playback from the current prepared position.
   * Contract: PlayerFsm is responsible for calling _seek(t) before _play()
   * when a specific start position is desired.
   * @private
   */
  _play() {
    this.#omnitoneWrapper.resume();
  }

  /**
   * Pauses playback by clearing the current AudioBufferSourceNode.
   * This method is intended for internal use.
   * @private
   */
  _pause() {
    this.#omnitoneWrapper.clearCurrentBufferSource();
  }

  /**
   * Resumes playback from the current position.
   * This method is intended for internal use.
   * @private
   */
  _resume() {
    this.#omnitoneWrapper.resume();
  }

  /**
   * Seeks to a specific time in the werck by clearing and preparing a new buffer.
   * This method is intended for internal use.
   * @param {number} timeInSeconds - Target seek position in seconds.
   * @private
   */
  async _seek(timeInSeconds) {
    try {
      this.#suppressNextEnded = true;
      this.#omnitoneWrapper.clearCurrentBufferSource();
      this.#omnitoneWrapper.prepare(timeInSeconds);
    } catch (error) {
      console.error('[AudioTransportBuffer] _seek failed:', error);
      throw error;
    }
  }

  /**
   * Stops playback and resets the transport state.
   * This method is intended for internal use.
   * @private
   */
  _stop() {
    this.#omnitoneWrapper.stop();
  }

  /**
   * Registers a callback to be invoked when playback of the current werck ends.
   *
   * The callback is triggered by the internal OmnitoneWrapper's `onEnded` event.
   * `AudioTransportBuffer` intercepts this event to optionally suppress it
   * (during seeks or stops) before forwarding it to the registered callback.
   *
   * @param {() => void} callback - Function to be called when playback ends. No arguments are passed.
   *
   * @example
   * const transport = await AudioTransportBuffer.create(files, omnitoneWrapper, progress => { ... });
   * transport.onEnded(() => {
   *     console.log("Werck finished playing!");
   * });
   */
  onEnded(callback) {
    console.debug('Transport buffer layer: dispatching onEnded callback...');
    this.#onEnded = callback;
  }

  /**
   * Fully tears down the transport, disconnects nodes and releases memory.
   */
  dispose() {
    // 1) Ensure playback and Omnitone graph are halted
    if (this.#omnitoneWrapper) {
      try {
        this.#omnitoneWrapper.dispose();
      } catch (error) {
        console.warn('[AudioTransportBuffer] Failed to dispose OmnitoneWrapper', error);
      }
      this.#omnitoneWrapper = null;
    }

    // 3) Break strong references so GC can reclaim memory
    this.#omnitoneWrapper = null;
    this.#onEnded = null;
  }
}

export default AudioTransportBuffer;
