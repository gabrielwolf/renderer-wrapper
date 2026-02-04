// MOCKUP: UI glue code. Prioritizes speed over elegance.
// Expect duplication.

import OmnitoneWrapper from './omnitoneWrapper.js';
import AudioTransportBuffer from './audioTransportBuffer.js';
import AudioContextService from './audioContextService.js';
import {
  formatSoundfieldRotationLatencyStatistics,
  measureOmnitoneSoundfieldRotationLatencyInMilliseconds
} from './test.js';

/**
 * Example key identifiers used throughout the UI.
 * @typedef {'1oa'|'2oa'|'3oa'} ExampleKey
 */

/**
 * File URL list per example.
 * @typedef {Record<ExampleKey, string[]>} FileUrlMap
 */

/**
 * A small, mutable state container for one example instance.
 *
 * @typedef {Object} ExampleState
 * @property {number} order - Render/order index used by the wrapper.
 * @property {number[]} channelMap - Channel map passed to the wrapper.
 * @property {OmnitoneWrapper|null} omnitoneWrapper - Active wrapper instance (if initialized).
 * @property {AudioTransportBuffer|null} transport - Active transport instance (if loaded).
 * @property {number|null} uiTimer - Interval id used to update UI while playing.
 * @property {boolean} uiWasReset - Whether the UI is currently in a reset/ended state.
 * @property {number} pausedAt - Last known playback time when paused.
 * @property {boolean} isPlaying - Whether playback is currently active.
 * @property {boolean} pausedByContext - Whether pause was achieved by suspending AudioContext.
 * @property {number} suppressEndedCount - Counter to suppress `ended` callbacks after manual stop/seek.
 */

/**
 * Convenience type for the examples map.
 * @typedef {Record<ExampleKey, ExampleState>} ExamplesMap
 */

/** @type {FileUrlMap} */
const FILE_URLS = {
  "1oa": ['media/1oa/ch01-04.flac'],
  "2oa": ['media/2oa/ch01-04.flac', 'media/2oa/ch05-09.flac'],
  "3oa": ['media/3oa/ch01-04.flac', 'media/3oa/ch05-09.flac', 'media/3oa/ch10-16.flac'],
};

/**
 * Time window used to decrement the `suppressEndedCount` counter.
 * Intended to suppress spurious `ended` callbacks produced by stop/seek implementations.
 * @type {number}
 */
const SUPPRESS_ENDED_FALLBACK_MS = 500;

/**
 * Increment a per-player counter that suppresses the next `ended` callback(s).
 * Some WebAudio transports implement stop/seek by recreating buffer sources which may fire `ended`.
 *
 * @param {ExampleState} playerInstance
 * @returns {void}
 */
function suppressEndedOnce(playerInstance) {
  playerInstance.suppressEndedCount += 1;
  setTimeout(() => {
    playerInstance.suppressEndedCount = Math.max(0, playerInstance.suppressEndedCount - 1);
  }, SUPPRESS_ENDED_FALLBACK_MS);
}

/** @type {ExamplesMap} */
const examples = {
  "1oa": {
    order: 1,
    channelMap: [0, 1, 2, 3],
    omnitoneWrapper: null,
    transport: null,
    uiTimer: null,
    uiWasReset: true,
    pausedAt: 0,
    isPlaying: false,
    pausedByContext: false,
    suppressEndedCount: 0,
  },
  "2oa": {
    order: 2,
    channelMap: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    omnitoneWrapper: null,
    transport: null,
    uiTimer: null,
    uiWasReset: true,
    pausedAt: 0,
    isPlaying: false,
    pausedByContext: false,
    suppressEndedCount: 0,
  },
  "3oa": {
    order: 3,
    channelMap: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    omnitoneWrapper: null,
    transport: null,
    uiTimer: null,
    uiWasReset: true,
    pausedAt: 0,
    isPlaying: false,
    pausedByContext: false,
    suppressEndedCount: 0,
  },
};

/**
 * Enable/disable the core controls for one example.
 *
 * @param {ExampleKey} exampleKey
 * @param {boolean} disabled
 * @returns {void}
 */
function setExampleControlsDisabled(exampleKey, disabled) {
  const ids = ['load', 'play', 'position', 'stop', 'progress', 'gain', 'azimuth', 'elevation'];
  for (const id of ids) {
    const element = document.getElementById(exampleKey + '-' + id);
    if (element) element.disabled = disabled;
  }
}

/**
 * Reset all UI widgets for an example back to their default state.
 * This does not dispose audio objects; it only updates the DOM.
 *
 * @param {ExampleKey} exampleKey
 * @returns {void}
 */
function resetExampleUI(exampleKey) {
  const playBtn = document.getElementById(exampleKey + '-play');
  if (playBtn) playBtn.innerText = 'Play';

  const loadButton = document.getElementById(exampleKey + '-load');
  if (loadButton) loadButton.innerText = 'Load';

  const stopButton = document.getElementById(exampleKey + '-stop');
  if (stopButton) stopButton.disabled = true;

  const positionElement = document.getElementById(exampleKey + '-position');
  if (positionElement) positionElement.value = '0';

  const progressElement = document.getElementById(exampleKey + '-progress');
  if (progressElement) {
    progressElement.value = 0;
    // keep a sane default max when unloaded
    if (!progressElement.max || Number(progressElement.max) === 0) progressElement.max = 1;
  }

  const currentTime = document.getElementById(exampleKey + '-current-time');
  if (currentTime) currentTime.innerText = '0:00';

  const duration = document.getElementById(exampleKey + '-duration');
  if (duration) duration.innerText = '0:00';

  const gainLabel = document.getElementById(exampleKey + '-gain-label');
  if (gainLabel) gainLabel.textContent = '0';

  const azimuthLabel = document.getElementById(exampleKey + '-azimuth-label');
  if (azimuthLabel) azimuthLabel.textContent = '0';

  const elevationLabel = document.getElementById(exampleKey + '-elevation-label');
  if (elevationLabel) elevationLabel.textContent = '0';

  resetBufferIndicators(exampleKey);
}

/**
 * Dispose omnitoneWrapper/transport/timers for a single example and reset its UI and state.
 *
 * @param {ExampleKey} exampleKey
 * @returns {void}
 */
function disposeExample(exampleKey) {
  const example = examples[exampleKey];
  if (!example) return;

  if (example.pausedByContext) {
    try {
      AudioContextService.ensureRunning().then((context) => context.resume());
    } catch {
    }
  }

  if (example.uiTimer) {
    clearInterval(example.uiTimer);
    example.uiTimer = null;
  }

  if (example.transport) {
    try {
      example.transport.dispose();
    } catch {
    }
    example.transport = null;
  }

  if (example.omnitoneWrapper) {
    try {
      example.omnitoneWrapper.dispose();
    } catch {
    }
    example.omnitoneWrapper = null;
    // keep window reference in sync
    try {
      window[exampleKey] = null;
    } catch {
    }
  }

  example.uiWasReset = true;
  example.pausedAt = 0;
  example.isPlaying = false;
  example.pausedByContext = false;
  example.suppressEndedCount = 0;

  resetExampleUI(exampleKey);
  setExampleControlsDisabled(exampleKey, true);

  const initializeButton = document.getElementById(exampleKey + '-initialize');
  if (initializeButton) initializeButton.disabled = false;

  const loadButton = document.getElementById(exampleKey + '-load');
  if (loadButton) {
    loadButton.disabled = true;
    loadButton.innerText = 'Load';
  }
}

/**
 * Dispose all examples except the currently active one.
 * This enforces the single-active-track behavior for the shared AudioContext.
 *
 * @param {ExampleKey} activeKey
 * @returns {void}
 */
function disposeOtherExamples(activeKey) {
  for (const key in examples) {
    if (key !== activeKey) disposeExample(key);
  }
}

/**
 * Update the buffer indicator spans (next to render-mode select) for an example.
 * Expects spans like: [data-example="1oa"][data-buffer-index="0"].
 *
 * @param {ExampleKey} exampleKey
 * @param {number} fileIndex
 * @param {number} loaded
 * @param {number} total
 */
function updateBufferIndicators(exampleKey, fileIndex, loaded, total) {
  const idx = Number(fileIndex);
  const span = document.querySelector(
    `.buffer-indicator[data-example="${exampleKey}"][data-buffer-index="${idx}"]`,
  );
  if (!span) return;

  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const safeLoaded = Number.isFinite(loaded) && loaded > 0 ? loaded : 0;
  const pct = safeTotal > 0 ? Math.max(0, Math.min(100, Math.round((safeLoaded / safeTotal) * 100))) : 0;
  span.textContent = pct + '%';
}

/**
 * Reset buffer indicator spans for an example to "0%".
 * @param {ExampleKey} exampleKey
 */
function resetBufferIndicators(exampleKey) {
  const spans = document.querySelectorAll(`.buffer-indicator[data-example="${exampleKey}"]`);
  for (const s of spans) s.textContent = '0%';
}

/**
 * Mark buffer indicators as complete ("100%") for an example.
 * @param {ExampleKey} exampleKey
 */
function completeBufferIndicators(exampleKey) {
  const spans = document.querySelectorAll(`.buffer-indicator[data-example="${exampleKey}"]`);
  for (const s of spans) s.textContent = '100%';
}

for (const example in examples) {
  const playerInstance = examples[example];

  /**
   * Ensure an OmnitoneWrapper exists for this example and keep it mirrored on `window[example]`.
   * @returns {OmnitoneWrapper}
   */
  const ensureOmnitoneWrapper = () => {
    if (!playerInstance.omnitoneWrapper) {
      playerInstance.omnitoneWrapper = new OmnitoneWrapper(playerInstance.order, playerInstance.channelMap);
      try {
        window[example] = playerInstance.omnitoneWrapper;
      } catch {
      }
    }
    return playerInstance.omnitoneWrapper;
  };

  /**
   * @returns {OmnitoneWrapper|null}
   */
  const getOmnitoneWrapper = () => playerInstance.omnitoneWrapper;

  /**
   * Reset azimuth/elevation UI and apply a neutral rotation in the omnitoneWrapper.
   * @returns {void}
   */
  const resetRotation = () => {
    const azimuthElement = document.getElementById(example + '-azimuth');
    const elevationElement = document.getElementById(example + '-elevation');
    if (azimuthElement) azimuthElement.value = '0';
    if (elevationElement) elevationElement.value = '0';
    document.getElementById(example + '-azimuth-label').textContent = '0';
    document.getElementById(example + '-elevation-label').textContent = '0';
    const omnitoneWrapper = getOmnitoneWrapper();
    if (omnitoneWrapper) omnitoneWrapper.rotateSoundfieldWithAzimuthAndElevationAngles(0, 0);
  };

  /**
   * Reset gain UI and apply a zero gain in the omnitoneWrapper.
   * @returns {void}
   */
  const resetGain = () => {
    const gainElement = document.getElementById(example + '-gain');
    if (gainElement) gainElement.value = '0';
    document.getElementById(example + '-gain-label').textContent = '0';
    const omnitoneWrapper = getOmnitoneWrapper();
    if (omnitoneWrapper) omnitoneWrapper.gain = 0;
  };

  document.getElementById(example + '-initialize').addEventListener('click', () => {
    // Only one active track (shared AudioContext). Discard the other tracks when one is initialized.
    disposeOtherExamples(example);

    const omnitoneWrapper = ensureOmnitoneWrapper();
    omnitoneWrapper.initialize().then(() => {
      document.getElementById(example + '-initialize').disabled = true;
      document.getElementById(example + '-load').disabled = false;
    });
  });

  document.getElementById(example + '-load').addEventListener('click', () => {
    const omnitoneWrapper = ensureOmnitoneWrapper();

    document.getElementById(example + '-load').disabled = true;
    document.getElementById(example + '-load').innerText = 'Loading...';

    // Clean up any previous timer/transport
    if (playerInstance.uiTimer) {
      clearInterval(playerInstance.uiTimer);
      playerInstance.uiTimer = null;
    }
    if (playerInstance.transport) {
      try {
        playerInstance.transport.dispose();
      } catch {
      }
      playerInstance.transport = null;
    }

    // Reset state tracking
    playerInstance.uiWasReset = true;
    playerInstance.pausedAt = 0;
    playerInstance.isPlaying = false;
    playerInstance.pausedByContext = false;
    playerInstance.suppressEndedCount = 0;
    const playButton = document.getElementById(example + '-play');
    if (playButton) playButton.innerText = 'Play';

    const fileUrls = FILE_URLS[example];

    omnitoneWrapper
      .load(fileUrls, (p) => {
        // p = {fileIndex, loaded, total}
        if (!p) return;
        updateBufferIndicators(example, p.fileIndex, p.loaded, p.total);
      })
      .then(() => {
        playerInstance.transport = new AudioTransportBuffer(omnitoneWrapper);

        document.getElementById(example + '-play').disabled = false;
        document.getElementById(example + '-position').disabled = false;
        document.getElementById(example + '-gain').disabled = false;
        document.getElementById(example + '-progress').disabled = false;
        document.getElementById(example + '-azimuth').disabled = false;
        document.getElementById(example + '-elevation').disabled = false;
        document.getElementById(example + '-load').innerText = 'Loaded';
        document.getElementById(example + '-render-mode').disabled = false;

        document.getElementById(example + '-duration').innerText = secondsToReadableTime(
          playerInstance.transport.duration,
        );
        document.getElementById(example + '-progress').max = playerInstance.transport.duration;

        // Init button state for stop
        document.getElementById(example + '-stop').disabled = true;
        const playBtn = document.getElementById(example + '-play');
        if (playBtn) playBtn.innerText = 'Play';

        // Ensure UI shows fully buffered once load resolves.
        completeBufferIndicators(example);

        // Shared ended handler
        const handleEnded = () => {
          playerInstance.uiWasReset = true;
          playerInstance.pausedAt = 0;
          playerInstance.isPlaying = false;
          playerInstance.pausedByContext = false;
          const playBtn = document.getElementById(example + '-play');
          if (playBtn) playBtn.innerText = 'Play';
          document.getElementById(example + '-stop').disabled = true;

          document.getElementById(example + '-position').value = '0';
          document.getElementById(example + '-progress').value = 0;
          document.getElementById(example + '-current-time').innerText = '0:00';

          if (playerInstance.uiTimer) {
            clearInterval(playerInstance.uiTimer);
            playerInstance.uiTimer = null;
          }
        };

        playerInstance.transport.onEnded(() => {
          // Suppress ended events caused by manual stop/seek.
          if (playerInstance.suppressEndedCount > 0) {
            playerInstance.suppressEndedCount -= 1;
            return;
          }
          handleEnded();
        });
      })
      .catch((error) => {
        console.error(error);
        document.getElementById(example + '-load').innerText = 'Load failed';
        document.getElementById(example + '-load').disabled = false;
        resetBufferIndicators(example);
      });
  });

  const renderModeSelect = document.getElementById(example + '-render-mode');
  if (renderModeSelect) {
    renderModeSelect.addEventListener('change', () => {
      const omnitoneWrapper = getOmnitoneWrapper();
      if (!omnitoneWrapper) return;

      omnitoneWrapper.renderingMode = renderModeSelect.value;
    });
  }

  document.getElementById(example + '-play').addEventListener('click', () => {
    if (!playerInstance.transport) return;

    const playButton = document.getElementById(example + '-play');

    // Toggle: if currently playing, pause.
    if (playerInstance.isPlaying) {
      const t = playerInstance.transport.currentTime;
      playerInstance.pausedAt = t;
      playerInstance.uiWasReset = false;
      playerInstance.isPlaying = false;

      // Stop UI updates while paused
      if (playerInstance.uiTimer) {
        clearInterval(playerInstance.uiTimer);
        playerInstance.uiTimer = null;
      }

      try {
        AudioContextService.ensureRunning().then((context) => context.suspend());
        playerInstance.pausedByContext = true;
      } catch (error) {
        console.warn('AudioContext suspend failed; falling back to stop+seek pause', error);
        try {
          suppressEndedOnce(playerInstance);
          playerInstance.transport._stop();
          playerInstance.transport._seek(t);
          playerInstance.pausedByContext = false;
        } catch (e2) {
          console.warn('Fallback pause failed', e2);
        }
      }

      // Keep UI showing the paused position
      document.getElementById(example + '-progress').value = t;
      document.getElementById(example + '-current-time').innerText = secondsToReadableTime(t);

      if (playButton) playButton.innerText = 'Play';
      document.getElementById(example + '-stop').disabled = false;
      return;
    }

    // Otherwise, start/resume playback.
    // If we paused by suspending the AudioContext, resume simply means resuming the context.
    if (playerInstance.pausedByContext) {
      try {
        AudioContextService.ensureRunning().then((context) => context.resume());
      } catch (error) {
        console.warn('AudioContext resume failed; falling back to transport resume', error);
      }

      // Restart UI timer
      if (!playerInstance.uiTimer) {
        playerInstance.uiTimer = setInterval(() => {
          const now = playerInstance.transport.currentTime;
          const dur = playerInstance.transport.duration;
          const t = Math.min(now, dur);

          document.getElementById(example + '-progress').value = t;
          document.getElementById(example + '-current-time').innerText = secondsToReadableTime(t);

          // Fallback end detection: if we've reached the end and we are playing, treat as ended.
          if (playerInstance.isPlaying && !playerInstance.pausedByContext && dur > 0 && now >= dur - 0.05) {
            // Inline handleEnded logic because handleEnded is not in this scope
            playerInstance.uiWasReset = true;
            playerInstance.pausedAt = 0;
            playerInstance.isPlaying = false;
            playerInstance.pausedByContext = false;
            const playButton = document.getElementById(example + '-play');
            if (playButton) playButton.innerText = 'Play';
            document.getElementById(example + '-stop').disabled = true;

            document.getElementById(example + '-position').value = '0';
            document.getElementById(example + '-progress').value = 0;
            document.getElementById(example + '-current-time').innerText = '0:00';

            if (playerInstance.uiTimer) {
              clearInterval(playerInstance.uiTimer);
              playerInstance.uiTimer = null;
            }
          }
        }, 50);
      }

      playerInstance.uiWasReset = false;
      playerInstance.isPlaying = true;
      playerInstance.pausedByContext = false;
      if (playButton) playButton.innerText = 'Pause';
      document.getElementById(example + '-stop').disabled = false;
      return;
    }

    // Ensure UI timer is running
    if (!playerInstance.uiTimer) {
      playerInstance.uiTimer = setInterval(() => {
        const now = playerInstance.transport.currentTime;
        const duration = playerInstance.transport.duration;
        const time = Math.min(now, duration);

        document.getElementById(example + '-progress').value = time;
        document.getElementById(example + '-current-time').innerText = secondsToReadableTime(time);

        // Fallback end detection: if we've reached the end and we are playing, treat as ended.
        if (playerInstance.isPlaying && !playerInstance.pausedByContext && duration > 0 && now >= duration - 0.05) {
          // Inline handleEnded logic because handleEnded is not in this scope
          playerInstance.uiWasReset = true;
          playerInstance.pausedAt = 0;
          playerInstance.isPlaying = false;
          playerInstance.pausedByContext = false;
          const playButton = document.getElementById(example + '-play');
          if (playButton) playButton.innerText = 'Play';
          document.getElementById(example + '-stop').disabled = true;

          document.getElementById(example + '-position').value = '0';
          document.getElementById(example + '-progress').value = 0;
          document.getElementById(example + '-current-time').innerText = '0:00';

          if (playerInstance.uiTimer) {
            clearInterval(playerInstance.uiTimer);
            playerInstance.uiTimer = null;
          }
        }
      }, 50);
    }

    const startFromPositionInput = () => {
      const fractionRaw = parseFloat(document.getElementById(example + '-position').value);
      const fraction = Number.isFinite(fractionRaw) ? Math.max(0, Math.min(1, fractionRaw)) : 0;
      return fraction * playerInstance.transport.duration;
    };

    // If we were stopped/ended (UI reset), treat Play as "play from position".
    // Otherwise treat Play as resume-from-paused.
    const playPromise = playerInstance.uiWasReset
      ? (() => {
        suppressEndedOnce(playerInstance);
        return playerInstance.transport._seek(startFromPositionInput()).then(() => playerInstance.transport._play());
      })()
      : (typeof playerInstance.transport._resume === 'function'
        ? Promise.resolve().then(() => playerInstance.transport._resume())
        : (() => {
          suppressEndedOnce(playerInstance);
          return playerInstance.transport
            ._seek(playerInstance.pausedAt || 0)
            .then(() => playerInstance.transport._play());
        })());

    playPromise.then(() => {
      playerInstance.uiWasReset = false;
      playerInstance.isPlaying = true;
      if (playButton) playButton.innerText = 'Pause';
      document.getElementById(example + '-stop').disabled = false;
    });
  });

  document.getElementById(example + '-stop').addEventListener('click', () => {
    if (!playerInstance.transport) return;
    // _stop() will trigger WebAudio `onended`; suppress the next ended callback.
    suppressEndedOnce(playerInstance);
    playerInstance.transport._stop();

    // Reset UI to start
    document.getElementById(example + '-position').value = '0';
    document.getElementById(example + '-progress').value = 0;
    document.getElementById(example + '-current-time').innerText = '0:00';

    // Stop UI updates (Resume/Play will restart the timer)
    if (playerInstance.uiTimer) {
      clearInterval(playerInstance.uiTimer);
      playerInstance.uiTimer = null;
    }

    playerInstance.uiWasReset = true;
    playerInstance.pausedAt = 0;
    playerInstance.isPlaying = false;
    playerInstance.pausedByContext = false;
    const playBtn = document.getElementById(example + '-play');
    if (playBtn) playBtn.innerText = 'Play';
    document.getElementById(example + '-stop').disabled = true;
  });

  const progressElement = document.getElementById(example + '-progress');
  const progressClickTarget = progressElement.closest('.progress-hit') || progressElement;

  progressClickTarget.addEventListener('click', function (event) {
    if (!playerInstance.transport) return;

    const rect = progressClickTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));

    // Persist the fraction for "play from position" behavior
    document.getElementById(example + '-position').value = String(percentage);

    const targetTime = percentage * playerInstance.transport.duration;

    // If currently playing, we need a real seek (not stop-like behavior).
    // Many WebAudio-based transports implement seek by stopping/restarting a buffer source,
    // which can fire `onended`. We suppress that one and restart from the new time.
    if (playerInstance.isPlaying) {
      suppressEndedOnce(playerInstance);

      try {
        playerInstance.transport._stop();
      } catch (error) {
        console.warn('Seek: stop threw; continuing with seek.', error);
      }

      // Ensure UI timer is running
      if (!playerInstance.uiTimer) {
        playerInstance.uiTimer = setInterval(() => {
          const now = playerInstance.transport.currentTime;
          const dur = playerInstance.transport.duration;
          const t = Math.min(now, dur);

          document.getElementById(example + '-progress').value = t;
          document.getElementById(example + '-current-time').innerText = secondsToReadableTime(t);

          // Fallback end detection: if we've reached the end and we are playing, treat as ended.
          if (playerInstance.isPlaying && !playerInstance.pausedByContext && dur > 0 && now >= dur - 0.05) {
            // Inline handleEnded logic because handleEnded is not in this scope
            playerInstance.uiWasReset = true;
            playerInstance.pausedAt = 0;
            playerInstance.isPlaying = false;
            playerInstance.pausedByContext = false;
            const playBtn = document.getElementById(example + '-play');
            if (playBtn) playBtn.innerText = 'Play';
            document.getElementById(example + '-stop').disabled = true;

            document.getElementById(example + '-position').value = '0';
            document.getElementById(example + '-progress').value = 0;
            document.getElementById(example + '-current-time').innerText = '0:00';

            if (playerInstance.uiTimer) {
              clearInterval(playerInstance.uiTimer);
              playerInstance.uiTimer = null;
            }
          }
        }, 50);
      }

      playerInstance.transport._seek(targetTime).then(() => {
        playerInstance.transport._play();
        playerInstance.uiWasReset = false;
        playerInstance.pausedAt = 0;
        playerInstance.isPlaying = true;
        const playBtn = document.getElementById(example + '-play');
        if (playBtn) playBtn.innerText = 'Pause';
        document.getElementById(example + '-stop').disabled = false;

        // Snap UI immediately to the seeked time
        document.getElementById(example + '-progress').value = targetTime;
        document.getElementById(example + '-current-time').innerText = secondsToReadableTime(targetTime);
      });

      return;
    }

    // Not currently playing: treat this as "prepare to play from position" and start playback.
    playerInstance.uiWasReset = true;
    playerInstance.pausedAt = 0;
    playerInstance.isPlaying = false;
    playerInstance.suppressEndedCount = 0;
    const playButton = document.getElementById(example + '-play');
    if (playButton) playButton.innerText = 'Play';
    document.getElementById(example + '-play').click();
  });

  document.getElementById(example + '-gain').addEventListener('input', () => {
    const gain = document.getElementById(example + '-gain').value;
    document.getElementById(example + '-gain-label').textContent = gain;
    const omnitoneWrapper = getOmnitoneWrapper();
    if (!omnitoneWrapper) return;
    omnitoneWrapper.gain = Number(gain);
  });

  document.getElementById(example + '-gain').addEventListener('dblclick', (event) => {
    event.preventDefault();
    resetGain();
  });

  document.getElementById(example + '-gain').addEventListener('click', (event) => {
    if (!event.altKey) return;
    event.preventDefault();
    resetGain();
  });

  document.getElementById(example + '-azimuth').addEventListener('input', () => {
    const azimuth = parseFloat(document.getElementById(example + '-azimuth').value);
    const elevation = parseFloat(document.getElementById(example + '-elevation').value);
    document.getElementById(example + '-azimuth-label').textContent = String(azimuth);
    document.getElementById(example + '-elevation-label').textContent = String(elevation);
    const omnitoneWrapper = getOmnitoneWrapper();
    if (!omnitoneWrapper) return;
    omnitoneWrapper.rotateSoundfieldWithAzimuthAndElevationAngles(azimuth, elevation);
  });

  document.getElementById(example + '-azimuth').addEventListener('dblclick', (event) => {
    event.preventDefault();
    resetRotation();
  });

  document.getElementById(example + '-azimuth').addEventListener('click', (event) => {
    if (!event.altKey) return;
    event.preventDefault();
    resetRotation();
  });

  document.getElementById(example + '-elevation').addEventListener('input', () => {
    const azimuth = parseFloat(document.getElementById(example + '-azimuth').value);
    const elevation = parseFloat(document.getElementById(example + '-elevation').value);
    document.getElementById(example + '-azimuth-label').textContent = String(azimuth);
    document.getElementById(example + '-elevation-label').textContent = String(elevation);
    const omnitoneWrapper = getOmnitoneWrapper();
    if (!omnitoneWrapper) return;
    omnitoneWrapper.rotateSoundfieldWithAzimuthAndElevationAngles(azimuth, elevation);
  });

  document.getElementById(example + '-elevation').addEventListener('dblclick', (event) => {
    event.preventDefault();
    resetRotation();
  });

  document.getElementById(example + '-elevation').addEventListener('click', (event) => {
    if (!event.altKey) return;
    event.preventDefault();
    resetRotation();
  });
}

// Start with only Initialize enabled for each track
for (const example in examples) {
  setExampleControlsDisabled(example, true);
  const initializeButton = document.getElementById(example + '-initialize');
  if (initializeButton) initializeButton.disabled = false;
}

/**
 * Convert seconds to a human-readable time string.
 * Uses `m:ss` for durations under one hour, and `h:mm:ss` for one hour or more.
 *
 * @param {number} seconds
 * @returns {string}
 */
function secondsToReadableTime(seconds) {
  let time = new Date(null);
  time.setSeconds(seconds);
  time = time.toISOString();
  time = seconds > 3600 ? time.substr(11, 8) : time.substr(14, 5);
  time = time.substr(0, 1) === '0' ? time.substring(1) : time;
  return String(time);
}

const soundfieldRotationLatencyTestButton = document.getElementById('soundfield-rotation-latency-test');
const soundfieldRotationLatencyTestOutput = document.getElementById('latency-output');

if (soundfieldRotationLatencyTestButton && soundfieldRotationLatencyTestOutput) {
  soundfieldRotationLatencyTestButton.addEventListener('click', async () => {
    soundfieldRotationLatencyTestButton.disabled = true;
    soundfieldRotationLatencyTestOutput.textContent = 'Measuring soundfield rotation latency... (real-time AudioContext)\n';

    try {
      await AudioContextService.ensureRunning();

      // Use the same channel maps as the demo
      const firstOrderAmbisonics = await measureOmnitoneSoundfieldRotationLatencyInMilliseconds({
        ambisonicOrder: 1,
        channelMap: examples["1oa"].channelMap,
      });
      const secondOrderAmbisonics = await measureOmnitoneSoundfieldRotationLatencyInMilliseconds({
        ambisonicOrder: 2,
        channelMap: examples["2oa"].channelMap,
      });
      const thirdOrderAmbisonics = await measureOmnitoneSoundfieldRotationLatencyInMilliseconds({
        ambisonicOrder: 3,
        channelMap: examples["3oa"].channelMap,
      });

      // Device latency context (informational)
      const audioContext = AudioContextService.context;
      const base = Number.isFinite(audioContext.baseLatency) ? (audioContext.baseLatency * 1000) : null;
      const out = Number.isFinite(audioContext.outputLatency) ? (audioContext.outputLatency * 1000) : null;

      soundfieldRotationLatencyTestOutput.textContent =
        'Soundfield rotation latency (rotation toggle → audible stereo change)\n' +
        `- ${formatSoundfieldRotationLatencyStatistics('1OA', firstOrderAmbisonics)}\n` +
        `- ${formatSoundfieldRotationLatencyStatistics('2OA', secondOrderAmbisonics)}\n` +
        `- ${formatSoundfieldRotationLatencyStatistics('3OA', thirdOrderAmbisonics)}\n\n` +
        'Device latency (context only)\n' +
        `- baseLatency: ${base == null ? 'n/a' : base.toFixed(2) + 'ms'}\n` +
        `- outputLatency: ${out == null ? 'n/a' : out.toFixed(2) + 'ms'}\n`;
    } catch (error) {
      console.error(error);
      soundfieldRotationLatencyTestOutput.textContent = 'Soundfield rotation latency measurement failed: ' + (error?.message || String(error));
    } finally {
      soundfieldRotationLatencyTestButton.disabled = false;
    }
  });
}
