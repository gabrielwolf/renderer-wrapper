// noinspection JSUnusedGlobalSymbols

/**
 * AudioTransport interface.
 *
 * This interface defines the AudioTransport to be implemented by all audio transport classes
 * (such as streaming and buffered transports).
 *
 * Note: This interface is intended to be consumed exclusively by the PlayerFsm.
 * It defines internal playback controls and must not be invoked directly by UI or other systems.
 * (if you do, you end up in hell)
 *
 * To implement a transport, provide a subclass that implements all methods and properties below.
 *
 * @interface AudioTransport
 * @typedef {Object} TransportProgress
 * @property {number} fileIndex - Index of the chunk or segment being loaded.
 * @property {number} loaded - Number of bytes loaded so far.
 * @property {number} total - Total number of bytes to load.
 */
class AudioTransport {
  /**
   * @constructor
   * @param {number} sampleRate - Sample rate in Hz.
   * @param {number} totalSamples - Total PCM samples in the werck.
   * @throws {Error} If called directly.
   */
  constructor(sampleRate, totalSamples) {
    void sampleRate;
    void totalSamples;
    if (new.target === AudioTransport) {
      throw new Error('AudioTransport is an interface and cannot be instantiated directly.');
    }
  }

  /**
   * Sample rate of the current werck.
   * @returns {number}
   */
  get sampleRate() {
    throw new Error('sampleRate getter must be implemented by subclass');
  }

  /**
   * Playback position in seconds.
   * @returns {number}
   */
  get currentTime() {
    throw new Error('currentTime getter must be implemented by subclass');
  }

  /**
   * Total duration in seconds.
   * @returns {number}
   */
  get duration() {
    throw new Error('duration getter must be implemented by subclass');
  }

  /**
   * Seek the transport to a given playback position.
   * @param {number} timeInSeconds - Position in seconds.
   * @throws {Error} If not implemented by subclass.
   */
  _seek(timeInSeconds) {
    void timeInSeconds;
    throw new Error('_seek(timeInSeconds) must be implemented by subclass');
  }

  /**
   * Pause playback.
   * @throws {Error} If not implemented by subclass.
   */
  _pause() {
    throw new Error('_pause() must be implemented by subclass');
  }

  /**
   * Resume playback from the current position.
   * @throws {Error} If not implemented by subclass.
   */
  _resume() {
    throw new Error('_resume() must be implemented by subclass');
  }

  /**
   * Start or restart playback.
   * @throws {Error} If not implemented by subclass.
   */
  _play() {
    throw new Error('_play() must be implemented by subclass');
  }

  /**
   * Stop playback completely and reset position.
   * @throws {Error} If not implemented by subclass.
   */
  _stop() {
    throw new Error('_stop() must be implemented by subclass');
  }
}

export default AudioTransport;
