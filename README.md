# A new binaural renderer for ambisonics.market (reference integration)

[Live Demo](https://renderer.ambisonics.market)

## Local installation

1. Clone Repo
2. `cd public`
2. Start a local server e.g. `npx http-server --cors -p 8888`
3. Open https://127.0.0.1:8888 in your prefered browser are tested


## Introduction

* This repository is a pragmatic reference implementation demonstrating the usage of the
  contract class `OmnitoneWrapper`. It was designed, to act as a facade around the audio engine.
  The class is intended to be replaced by an `AtmokyWrapper` with identical external behavior.

* The product operates on lossless FLAC assets and supports sample rates up to 96 kHz.
  This is required to meet latency and head-tracking responsiveness targets.

* We adapt to `AmbiX ACN/SN3D`, `RH coordinate system` and `+X: front | +Y: left | +Z: up` in the
  reference integration.

  Note: Omnitone applies a sign flip in the FOARenderer that results in a mirrored image.
        This behavior is not compensated in this reference implementation.


## Integration expectations (non-DSP)

The new renderer implementation is expected to support the following
integration-level behaviors when embedded in a production WebAudio app:

- Abortable async loading of audio assets (e.g. via XHR or equivalent)
- Progress reporting during loading of audio assets (e.g. via XHR or equivalent)
- Deterministic lifecycle (initialize > use > dispose)
- Safe re-initialization without page reload (for SPA-like usage, e.g. Django + HTMX)
- Integration via the WebAudio graph, supporting both buffer-based playback
  and a streaming mode driven by a connected source node
- The renderer is consumable from a plain JavaScript + JSDoc codebase (ES modules)
  without requiring TypeScript in the host application


These requirements are currently fulfilled by OmnitoneWrapper and relied upon
by the host application.
