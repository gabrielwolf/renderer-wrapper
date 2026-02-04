/**
 * Singleton wrapper around the Web Audio API's AudioContext.
 * Ensures a single, consistently configured AudioContext instance is used throughout the app.
 * Configures the output to use maximum available discrete channels.
 */

class AudioContextService {
  /** @type {AudioContext|null} */
  static #audioContext = null;

  static #init() {
    if (this.#audioContext) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContext.destination.channelCount = audioContext.destination.maxChannelCount;
    audioContext.destination.channelCountMode = 'explicit';
    audioContext.destination.channelInterpretation = 'discrete';
    this.#audioContext = audioContext;
  }

  /**
   * Returns the shared AudioContext, creating it on first call.
   * @returns {AudioContext}
   */
  static get context() {
    this.#init();
    return this.#audioContext;
  }

  /**
   * Resumes the AudioContext if it is currently suspended.
   * Safe to call multiple times; does nothing if the audio context is already running.
   *
   * @returns {Promise<AudioContext>} A promise that resolves with the resumed AudioContext.
   */
  static async ensureRunning() {
    const context = this.context;
    if (context.state === 'suspended') {
      await context.resume();
    }
    return context;
  }
}

export default AudioContextService;
