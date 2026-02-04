/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Utils = {};
Utils.log = function() {
  const message = `[Omnitone] \
${Array.prototype.slice.call(arguments).join(' ')} \
(${performance.now().toFixed(2)}ms)`;
  window.console.log(message);
};
Utils.throw = function() {
  const message = `[Omnitone] \
${Array.prototype.slice.call(arguments).join(' ')} \
(${performance.now().toFixed(2)}ms)`;
  throw new Error(message);
};
let a00;
let a01;
let a02;
let a03;
let a10;
let a11;
let a12;
let a13;
let a20;
let a21;
let a22;
let a23;
let a30;
let a31;
let a32;
let a33;
let b00;
let b01;
let b02;
let b03;
let b04;
let b05;
let b06;
let b07;
let b08;
let b09;
let b10;
let b11;
let det;
Utils.invertMatrix4 = function(out, a) {
  a00 = a[0];
  a01 = a[1];
  a02 = a[2];
  a03 = a[3];
  a10 = a[4];
  a11 = a[5];
  a12 = a[6];
  a13 = a[7];
  a20 = a[8];
  a21 = a[9];
  a22 = a[10];
  a23 = a[11];
  a30 = a[12];
  a31 = a[13];
  a32 = a[14];
  a33 = a[15];
  b00 = a00 * a11 - a01 * a10;
  b01 = a00 * a12 - a02 * a10;
  b02 = a00 * a13 - a03 * a10;
  b03 = a01 * a12 - a02 * a11;
  b04 = a01 * a13 - a03 * a11;
  b05 = a02 * a13 - a03 * a12;
  b06 = a20 * a31 - a21 * a30;
  b07 = a20 * a32 - a22 * a30;
  b08 = a20 * a33 - a23 * a30;
  b09 = a21 * a32 - a22 * a31;
  b10 = a21 * a33 - a23 * a31;
  b11 = a22 * a33 - a23 * a32;
  det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) {
    return null;
  }
  det = 1.0 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
};
Utils.isDefinedENUMEntry = function(enumDictionary, entryValue) {
  for (const enumKey in enumDictionary) {
    if (entryValue === enumDictionary[enumKey]) {
      return true;
    }
  }
  return false;
};
Utils.isAudioContext = function(context) {
  return context instanceof AudioContext ||
    context instanceof OfflineAudioContext;
};
Utils.isAudioBuffer = function(audioBuffer) {
  return audioBuffer instanceof AudioBuffer;
};
Utils.mergeBufferListByChannel = function(context, bufferList) {
  const bufferLength = bufferList[0].length;
  const bufferSampleRate = bufferList[0].sampleRate;
  let bufferNumberOfChannel = 0;
  for (let i = 0; i < bufferList.length; ++i) {
    if (bufferNumberOfChannel > 32) {
      Utils.throw('Utils.mergeBuffer: Number of channels cannot exceed 32.' +
          '(got ' + bufferNumberOfChannel + ')');
    }
    if (bufferLength !== bufferList[i].length) {
      Utils.throw('Utils.mergeBuffer: AudioBuffer lengths are ' +
          'inconsistent. (expected ' + bufferLength + ' but got ' +
          bufferList[i].length + ')');
    }
    if (bufferSampleRate !== bufferList[i].sampleRate) {
      Utils.throw('Utils.mergeBuffer: AudioBuffer sample rates are ' +
          'inconsistent. (expected ' + bufferSampleRate + ' but got ' +
          bufferList[i].sampleRate + ')');
    }
    bufferNumberOfChannel += bufferList[i].numberOfChannels;
  }
  const buffer = context.createBuffer(
      bufferNumberOfChannel, bufferLength, bufferSampleRate);
  let destinationChannelIndex = 0;
  for (let i = 0; i < bufferList.length; ++i) {
    for (let j = 0; j < bufferList[i].numberOfChannels; ++j) {
      buffer.getChannelData(destinationChannelIndex++).set(
          bufferList[i].getChannelData(j));
    }
  }
  return buffer;
};
Utils.splitBufferbyChannel = function(context, audioBuffer, splitBy) {
  if (audioBuffer.numberOfChannels <= splitBy) {
    Utils.throw('Utils.splitBuffer: Insufficient number of channels. (' +
        audioBuffer.numberOfChannels + ' splitted by ' + splitBy + ')');
  }
  let sourceChannelIndex = 0;
  const numberOfSplittedBuffer =
      Math.ceil(audioBuffer.numberOfChannels / splitBy);
  for (let i = 0; i < numberOfSplittedBuffer; ++i) {
    const buffer = context.createBuffer(
        splitBy, audioBuffer.length, audioBuffer.sampleRate);
    for (let j = 0; j < splitBy; ++j) {
      if (sourceChannelIndex < audioBuffer.numberOfChannels) {
        buffer.getChannelData(j).set(
            audioBuffer.getChannelData(sourceChannelIndex++));
      }
    }
  }
  return bufferList;
};
Utils.getArrayBufferFromBase64String = function(base64String) {
  const binaryString = window.atob(base64String);
  const byteArray = new Uint8Array(binaryString.length);
  byteArray.forEach(
      (value, index) => byteArray[index] = binaryString.charCodeAt(index));
  return byteArray.buffer;
};

const BufferDataType = {
  BASE64: 'base64',
  URL: 'url',
};
function BufferList(context, bufferData, options, progressCallback) {
  this._context = Utils.isAudioContext(context) ?
      context :
      Utils.throw('BufferList: Invalid BaseAudioContext.');
  this._options = {
    dataType: BufferDataType.BASE64,
    verbose: false,
  };
  if (options) {
    if (options.dataType &&
        Utils.isDefinedENUMEntry(BufferDataType, options.dataType)) {
      this._options.dataType = options.dataType;
    }
    if (options.verbose) {
      this._options.verbose = Boolean(options.verbose);
    }
  }
  this._progressCallback = progressCallback || null;
  this._bufferList = [];
  this._bufferData = this._options.dataType === BufferDataType.BASE64
      ? bufferData
      : bufferData.slice(0);
  this._numberOfTasks = this._bufferData.length;
  this._resolveHandler = null;
  this._rejectHandler = new Function();
  this._requests = [];
  this._xhrs = [];
  this._aborted = false;
  this._hasSettled = false;
}
BufferList.prototype.load = function() {
  return new Promise(this._promiseGenerator.bind(this));
};
BufferList.prototype.abort = function() {
  if (this._aborted) return;
  this._aborted = true;
  for (let i = 0; i < this._xhrs.length; i++) {
    const xhr = this._xhrs[i];
    try { xhr && xhr.abort(); } catch {}
  }
  if (!this._hasSettled) {
    this._hasSettled = true;
    try { this._rejectHandler('BufferList: aborted.'); } catch {}
  }
};
BufferList.prototype._promiseGenerator = function(resolve, reject) {
  if (typeof resolve !== 'function') {
    Utils.throw('BufferList: Invalid Promise resolver.');
  } else {
    this._resolveHandler = resolve;
  }
  if (typeof reject === 'function') {
    this._rejectHandler = reject;
  }
  this._aborted = false;
  this._hasSettled = false;
  this._requests = new Array(this._bufferData.length);
  for (let i = 0; i < this._bufferData.length; ++i) {
    if (this._aborted) return;
    this._options.dataType === BufferDataType.BASE64
        ? this._launchAsyncLoadTask(i)
        : this._launchAsyncLoadTaskXHR(i);
  }
};
BufferList.prototype._launchAsyncLoadTask = function(taskId) {
  const that = this;
  this._context.decodeAudioData(
      Utils.getArrayBufferFromBase64String(this._bufferData[taskId]),
      function(audioBuffer) {
        that._updateProgress(taskId, audioBuffer);
      },
      function(errorMessage) {
        that._updateProgress(taskId, null);
        const message = 'BufferList: decoding ArrayByffer("' + taskId +
            '" from Base64-encoded data failed. (' + errorMessage + ')';
        that._rejectHandler(message);
        Utils.throw(message);
      });
};
BufferList.prototype._launchAsyncLoadTaskXHR = function(taskId) {
  const xhr = new XMLHttpRequest();
  this._requests[taskId] = xhr;
  xhr.open('GET', this._bufferData[taskId]);
  xhr.responseType = 'arraybuffer';
  this._xhrs[taskId] = xhr;
  const that = this;
  xhr.onprogress = (event) => {
    if (this._aborted) {
      return;
    }
    if (event.lengthComputable) {
      const progressData = {
        fileIndex: taskId,
        loaded: event.loaded,
        total: event.total,
      };
      if (typeof this._progressCallback === 'function') {
        this._progressCallback(progressData);
      }
    }
  };
  xhr.onload = function() {
    if (that._aborted) {
      return;
    }
    if (xhr.status === 200) {
      that._context.decodeAudioData(
          xhr.response,
          function(audioBuffer) {
            that._updateProgress(taskId, audioBuffer);
          },
          function(errorMessage) {
            that._updateProgress(taskId, null);
            const message = 'BufferList: decoding "' +
                that._bufferData[taskId] + '" failed. (' + errorMessage + ')';
            that._rejectHandler(message);
            Utils.log(message);
          });
    } else {
      const message = 'BufferList: XHR error while loading "' +
          that._bufferData[taskId] + '". (' + xhr.status + ' ' +
          xhr.statusText + ')';
      that._rejectHandler(message);
      Utils.log(message);
    }
  };
  xhr.onerror = function(event) {
    if (that._aborted) {
      return;
    }
    that._updateProgress(taskId, null);
    that._rejectHandler();
    Utils.log(
        'BufferList: XHR network failed on loading "' +
        that._bufferData[taskId] + '".');
  };
  xhr.onabort = function() {
    Utils.log(
        'BufferList: XHR aborted while loading "' +
        that._bufferData[taskId] + '".');
  };
  xhr.send();
};
BufferList.prototype._updateProgress = function(taskId, audioBuffer) {
  if (this._hasSettled) return;
  if (this._aborted) return;
  this._bufferList[taskId] = audioBuffer;
  if (this._options.verbose) {
    const messageString = this._options.dataType === BufferDataType.BASE64
        ? 'ArrayBuffer(' + taskId + ') from Base64-encoded HRIR'
        : '"' + this._bufferData[taskId] + '"';
    Utils.log('BufferList: ' + messageString + ' successfully loaded.');
  }
  if (--this._numberOfTasks === 0) {
    const messageString = this._options.dataType === BufferDataType.BASE64
        ? this._bufferData.length + ' AudioBuffers from Base64-encoded HRIRs'
        : this._bufferData.length + ' files via XHR';
    Utils.log('BufferList: ' + messageString + ' loaded successfully.');
    this._hasSettled = true;
    this._resolveHandler(this._bufferList);
  }
};
BufferList.prototype.abort = function() {
  if (this._aborted) {
    return;
  }
  this._aborted = true;
  for (let i = 0; i < this._requests.length; ++i) {
    const xhr = this._requests[i];
    if (xhr && xhr.readyState !== XMLHttpRequest.DONE) {
      try {
        xhr.abort();
      } catch (e) {
        Utils.log('BufferList: abort failed for task ' + i + ' (' + e + ')');
      }
    }
  }
  this._requests = [];
  if (typeof this._rejectHandler === 'function') {
    this._rejectHandler(new Error('BufferList: loading aborted'));
  }
  this._numberOfTasks = 0;
};

const ChannelMap = {
  DEFAULT: [0, 1, 2, 3],
  SAFARI: [2, 0, 1, 3],
  FUMA: [0, 3, 1, 2],
};
function FOARouter(context, channelMap) {
  this._context = context;
  this._splitter = this._context.createChannelSplitter(4);
  this._merger = this._context.createChannelMerger(4);
  this.input = this._splitter;
  this.output = this._merger;
  this.setChannelMap(channelMap || ChannelMap.DEFAULT);
}
FOARouter.prototype.setChannelMap = function(channelMap) {
  if (!Array.isArray(channelMap)) {
    return;
  }
  this._channelMap = channelMap;
  this._splitter.disconnect();
  this._splitter.connect(this._merger, 0, this._channelMap[0]);
  this._splitter.connect(this._merger, 1, this._channelMap[1]);
  this._splitter.connect(this._merger, 2, this._channelMap[2]);
  this._splitter.connect(this._merger, 3, this._channelMap[3]);
};
FOARouter.ChannelMap = ChannelMap;

function FOARotator(context) {
  this._context = context;
  this._splitter = this._context.createChannelSplitter(4);
  this._inY = this._context.createGain();
  this._inZ = this._context.createGain();
  this._inX = this._context.createGain();
  this._m0 = this._context.createGain();
  this._m1 = this._context.createGain();
  this._m2 = this._context.createGain();
  this._m3 = this._context.createGain();
  this._m4 = this._context.createGain();
  this._m5 = this._context.createGain();
  this._m6 = this._context.createGain();
  this._m7 = this._context.createGain();
  this._m8 = this._context.createGain();
  this._outY = this._context.createGain();
  this._outZ = this._context.createGain();
  this._outX = this._context.createGain();
  this._merger = this._context.createChannelMerger(4);
  this._splitter.connect(this._inY, 1);
  this._splitter.connect(this._inZ, 2);
  this._splitter.connect(this._inX, 3);
  this._inY.gain.value = -1;
  this._inX.gain.value = -1;
  this._inY.connect(this._m0);
  this._inY.connect(this._m1);
  this._inY.connect(this._m2);
  this._inZ.connect(this._m3);
  this._inZ.connect(this._m4);
  this._inZ.connect(this._m5);
  this._inX.connect(this._m6);
  this._inX.connect(this._m7);
  this._inX.connect(this._m8);
  this._m0.connect(this._outY);
  this._m1.connect(this._outZ);
  this._m2.connect(this._outX);
  this._m3.connect(this._outY);
  this._m4.connect(this._outZ);
  this._m5.connect(this._outX);
  this._m6.connect(this._outY);
  this._m7.connect(this._outZ);
  this._m8.connect(this._outX);
  this._splitter.connect(this._merger, 0, 0);
  this._outY.connect(this._merger, 0, 1);
  this._outZ.connect(this._merger, 0, 2);
  this._outX.connect(this._merger, 0, 3);
  this._outY.gain.value = -1;
  this._outX.gain.value = -1;
  this.setRotationMatrix3(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
  this.input = this._splitter;
  this.output = this._merger;
}
FOARotator.prototype.setRotationMatrix3 = function(rotationMatrix3) {
  this._m0.gain.value = rotationMatrix3[0];
  this._m1.gain.value = rotationMatrix3[1];
  this._m2.gain.value = rotationMatrix3[2];
  this._m3.gain.value = rotationMatrix3[3];
  this._m4.gain.value = rotationMatrix3[4];
  this._m5.gain.value = rotationMatrix3[5];
  this._m6.gain.value = rotationMatrix3[6];
  this._m7.gain.value = rotationMatrix3[7];
  this._m8.gain.value = rotationMatrix3[8];
};
FOARotator.prototype.setRotationMatrix4 = function(rotationMatrix4) {
  this._m0.gain.value = rotationMatrix4[0];
  this._m1.gain.value = rotationMatrix4[1];
  this._m2.gain.value = rotationMatrix4[2];
  this._m3.gain.value = rotationMatrix4[4];
  this._m4.gain.value = rotationMatrix4[5];
  this._m5.gain.value = rotationMatrix4[6];
  this._m6.gain.value = rotationMatrix4[8];
  this._m7.gain.value = rotationMatrix4[9];
  this._m8.gain.value = rotationMatrix4[10];
};
FOARotator.prototype.getRotationMatrix3 = function() {
  return [
    this._m0.gain.value, this._m1.gain.value, this._m2.gain.value,
    this._m3.gain.value, this._m4.gain.value, this._m5.gain.value,
    this._m6.gain.value, this._m7.gain.value, this._m8.gain.value,
  ];
};
FOARotator.prototype.getRotationMatrix4 = function() {
  const rotationMatrix4 = new Float32Array(16);
  rotationMatrix4[0] = this._m0.gain.value;
  rotationMatrix4[1] = this._m1.gain.value;
  rotationMatrix4[2] = this._m2.gain.value;
  rotationMatrix4[4] = this._m3.gain.value;
  rotationMatrix4[5] = this._m4.gain.value;
  rotationMatrix4[6] = this._m5.gain.value;
  rotationMatrix4[8] = this._m6.gain.value;
  rotationMatrix4[9] = this._m7.gain.value;
  rotationMatrix4[10] = this._m8.gain.value;
  return rotationMatrix4;
};

function FOAConvolver(context, hrirBufferList) {
  this._context = context;
  this._active = false;
  this._isBufferLoaded = false;
  this._buildAudioGraph();
  if (hrirBufferList) {
    this.setHRIRBufferList(hrirBufferList);
  }
  this.enable();
}
FOAConvolver.prototype._buildAudioGraph = function() {
  this._splitterWYZX = this._context.createChannelSplitter(4);
  this._mergerWY = this._context.createChannelMerger(2);
  this._mergerZX = this._context.createChannelMerger(2);
  this._convolverWY = this._context.createConvolver();
  this._convolverZX = this._context.createConvolver();
  this._splitterWY = this._context.createChannelSplitter(2);
  this._splitterZX = this._context.createChannelSplitter(2);
  this._inverter = this._context.createGain();
  this._mergerBinaural = this._context.createChannelMerger(2);
  this._summingBus = this._context.createGain();
  this._splitterWYZX.connect(this._mergerWY, 0, 0);
  this._splitterWYZX.connect(this._mergerWY, 1, 1);
  this._splitterWYZX.connect(this._mergerZX, 2, 0);
  this._splitterWYZX.connect(this._mergerZX, 3, 1);
  this._mergerWY.connect(this._convolverWY);
  this._mergerZX.connect(this._convolverZX);
  this._convolverWY.connect(this._splitterWY);
  this._convolverZX.connect(this._splitterZX);
  this._splitterWY.connect(this._mergerBinaural, 0, 0);
  this._splitterWY.connect(this._mergerBinaural, 0, 1);
  this._splitterWY.connect(this._mergerBinaural, 1, 0);
  this._splitterWY.connect(this._inverter, 1, 0);
  this._inverter.connect(this._mergerBinaural, 0, 1);
  this._splitterZX.connect(this._mergerBinaural, 0, 0);
  this._splitterZX.connect(this._mergerBinaural, 0, 1);
  this._splitterZX.connect(this._mergerBinaural, 1, 0);
  this._splitterZX.connect(this._mergerBinaural, 1, 1);
  this._convolverWY.normalize = false;
  this._convolverZX.normalize = false;
  this._inverter.gain.value = -1;
  this.input = this._splitterWYZX;
  this.output = this._summingBus;
};
FOAConvolver.prototype.setHRIRBufferList = function(hrirBufferList) {
  if (this._isBufferLoaded) {
    return;
  }
  this._convolverWY.buffer = hrirBufferList[0];
  this._convolverZX.buffer = hrirBufferList[1];
  this._isBufferLoaded = true;
};
FOAConvolver.prototype.enable = function() {
  this._mergerBinaural.connect(this._summingBus);
  this._active = true;
};
FOAConvolver.prototype.disable = function() {
  this._mergerBinaural.disconnect();
  this._active = false;
};

const OmnitoneFOAHrirBase64 = [
"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",
];

const RenderingMode$1 = {
  AMBISONIC: 'ambisonic',
  BYPASS: 'bypass',
  OFF: 'off',
};
function FOARenderer(context, config) {
  this._context = Utils.isAudioContext(context) ?
      context :
      Utils.throw('FOARenderer: Invalid BaseAudioContext.');
  this._config = {
    channelMap: FOARouter.ChannelMap.DEFAULT,
    renderingMode: RenderingMode$1.AMBISONIC,
  };
  if (config) {
    if (config.channelMap) {
      if (Array.isArray(config.channelMap) && config.channelMap.length === 4) {
        this._config.channelMap = config.channelMap;
      } else {
        Utils.throw(
            'FOARenderer: Invalid channel map. (got ' + config.channelMap
            + ')');
      }
    }
    if (config.hrirPathList) {
      if (Array.isArray(config.hrirPathList) &&
          config.hrirPathList.length === 2) {
        this._config.pathList = config.hrirPathList;
      } else {
        Utils.throw(
            'FOARenderer: Invalid HRIR URLs. It must be an array with ' +
            '2 URLs to HRIR files. (got ' + config.hrirPathList + ')');
      }
    }
    if (config.renderingMode) {
      if (Object.values(RenderingMode$1).includes(config.renderingMode)) {
        this._config.renderingMode = config.renderingMode;
      } else {
        Utils.log(
            'FOARenderer: Invalid rendering mode order. (got' +
            config.renderingMode + ') Fallbacks to the mode "ambisonic".');
      }
    }
  }
  this._buildAudioGraph();
  this._tempMatrix4 = new Float32Array(16);
  this._isRendererReady = false;
}
FOARenderer.prototype._buildAudioGraph = function() {
  this.input = this._context.createGain();
  this.output = this._context.createGain();
  this._bypass = this._context.createGain();
  this._foaRouter = new FOARouter(this._context, this._config.channelMap);
  this._foaRotator = new FOARotator(this._context);
  this._foaConvolver = new FOAConvolver(this._context);
  this.input.connect(this._foaRouter.input);
  this.input.connect(this._bypass);
  this._foaRouter.output.connect(this._foaRotator.input);
  this._foaRotator.output.connect(this._foaConvolver.input);
  this._foaConvolver.output.connect(this.output);
  this.input.channelCount = 4;
  this.input.channelCountMode = 'explicit';
  this.input.channelInterpretation = 'discrete';
};
FOARenderer.prototype._initializeCallback = function(resolve, reject) {
  const bufferList = this._config.pathList
      ? new BufferList(this._context, this._config.pathList, {dataType: 'url'})
      : new BufferList(this._context, OmnitoneFOAHrirBase64);
  bufferList.load().then(
      function(hrirBufferList) {
        this._foaConvolver.setHRIRBufferList(hrirBufferList);
        this.setRenderingMode(this._config.renderingMode);
        this._isRendererReady = true;
        Utils.log('FOARenderer: HRIRs loaded successfully. Ready.');
        resolve();
      }.bind(this),
      function() {
        const errorMessage = 'FOARenderer: HRIR loading/decoding failed.';
        reject(errorMessage);
        Utils.throw(errorMessage);
      });
};
FOARenderer.prototype.initialize = function() {
  Utils.log(
      'FOARenderer: Initializing... (mode: ' + this._config.renderingMode +
      ')');
  return new Promise(this._initializeCallback.bind(this));
};
FOARenderer.prototype.setChannelMap = function(channelMap) {
  if (!this._isRendererReady) {
    return;
  }
  if (channelMap.toString() !== this._config.channelMap.toString()) {
    Utils.log(
        'Remapping channels ([' + this._config.channelMap.toString() +
        '] -> [' + channelMap.toString() + ']).');
    this._config.channelMap = channelMap.slice();
    this._foaRouter.setChannelMap(this._config.channelMap);
  }
};
FOARenderer.prototype.setRotationMatrix3 = function(rotationMatrix3) {
  if (!this._isRendererReady) {
    return;
  }
  this._foaRotator.setRotationMatrix3(rotationMatrix3);
};
FOARenderer.prototype.setRotationMatrix4 = function(rotationMatrix4) {
  if (!this._isRendererReady) {
    return;
  }
  this._foaRotator.setRotationMatrix4(rotationMatrix4);
};
FOARenderer.prototype.setRotationMatrixFromCamera = function(cameraMatrix) {
  if (!this._isRendererReady) {
    return;
  }
  Utils.invertMatrix4(this._tempMatrix4, cameraMatrix.elements);
  this._foaRotator.setRotationMatrix4(this._tempMatrix4);
};
FOARenderer.prototype.setRenderingMode = function(mode) {
  if (mode === this._config.renderingMode) {
    return;
  }
  switch (mode) {
    case RenderingMode$1.AMBISONIC:
      this._foaConvolver.enable();
      this._bypass.disconnect();
      break;
    case RenderingMode$1.BYPASS:
      this._foaConvolver.disable();
      this._bypass.connect(this.output);
      break;
    case RenderingMode$1.OFF:
      this._foaConvolver.disable();
      this._bypass.disconnect();
      break;
    default:
      Utils.log(
          'FOARenderer: Rendering mode "' + mode + '" is not ' +
          'supported.');
      return;
  }
  this._config.renderingMode = mode;
  Utils.log('FOARenderer: Rendering mode changed. (' + mode + ')');
};

function HOAConvolver(context, ambisonicOrder, hrirBufferList) {
  this._context = context;
  this._active = false;
  this._isBufferLoaded = false;
  this._ambisonicOrder = ambisonicOrder;
  this._numberOfChannels =
      (this._ambisonicOrder + 1) * (this._ambisonicOrder + 1);
  this._buildAudioGraph();
  if (hrirBufferList) {
    this.setHRIRBufferList(hrirBufferList);
  }
  this.enable();
}
HOAConvolver.prototype._buildAudioGraph = function() {
  const numberOfStereoChannels = Math.ceil(this._numberOfChannels / 2);
  this._inputSplitter =
      this._context.createChannelSplitter(this._numberOfChannels);
  this._stereoMergers = [];
  this._convolvers = [];
  this._stereoSplitters = [];
  this._positiveIndexSphericalHarmonics = this._context.createGain();
  this._negativeIndexSphericalHarmonics = this._context.createGain();
  this._inverter = this._context.createGain();
  this._binauralMerger = this._context.createChannelMerger(2);
  this._outputGain = this._context.createGain();
  for (let i = 0; i < numberOfStereoChannels; ++i) {
    this._stereoMergers[i] = this._context.createChannelMerger(2);
    this._convolvers[i] = this._context.createConvolver();
    this._stereoSplitters[i] = this._context.createChannelSplitter(2);
    this._convolvers[i].normalize = false;
  }
  for (let l = 0; l <= this._ambisonicOrder; ++l) {
    for (let m = -l; m <= l; m++) {
      const acnIndex = l * l + l + m;
      const stereoIndex = Math.floor(acnIndex / 2);
      this._inputSplitter.connect(
          this._stereoMergers[stereoIndex], acnIndex, acnIndex % 2);
      this._stereoMergers[stereoIndex].connect(this._convolvers[stereoIndex]);
      this._convolvers[stereoIndex].connect(this._stereoSplitters[stereoIndex]);
      if (m >= 0) {
        this._stereoSplitters[stereoIndex].connect(
            this._positiveIndexSphericalHarmonics, acnIndex % 2);
      } else {
        this._stereoSplitters[stereoIndex].connect(
            this._negativeIndexSphericalHarmonics, acnIndex % 2);
      }
    }
  }
  this._positiveIndexSphericalHarmonics.connect(this._binauralMerger, 0, 0);
  this._positiveIndexSphericalHarmonics.connect(this._binauralMerger, 0, 1);
  this._negativeIndexSphericalHarmonics.connect(this._binauralMerger, 0, 0);
  this._negativeIndexSphericalHarmonics.connect(this._inverter);
  this._inverter.connect(this._binauralMerger, 0, 1);
  this._inverter.gain.value = -1;
  this.input = this._inputSplitter;
  this.output = this._outputGain;
};
HOAConvolver.prototype.setHRIRBufferList = function(hrirBufferList) {
  if (this._isBufferLoaded) {
    return;
  }
  for (let i = 0; i < hrirBufferList.length; ++i) {
    this._convolvers[i].buffer = hrirBufferList[i];
  }
  this._isBufferLoaded = true;
};
HOAConvolver.prototype.enable = function() {
  this._binauralMerger.connect(this._outputGain);
  this._active = true;
};
HOAConvolver.prototype.disable = function() {
  this._binauralMerger.disconnect();
  this._active = false;
};

function getKroneckerDelta(i, j) {
  return i === j ? 1 : 0;
}
function setCenteredElement(matrix, l, i, j, gainValue) {
  const index = (j + l) * (2 * l + 1) + (i + l);
  matrix[l - 1][index].gain.value = gainValue;
}
function getCenteredElement(matrix, l, i, j) {
  const index = (j + l) * (2 * l + 1) + (i + l);
  return matrix[l - 1][index].gain.value;
}
function getP(matrix, i, a, b, l) {
  if (b === l) {
    return getCenteredElement(matrix, 1, i, 1) *
        getCenteredElement(matrix, l - 1, a, l - 1) -
        getCenteredElement(matrix, 1, i, -1) *
        getCenteredElement(matrix, l - 1, a, -l + 1);
  } else if (b === -l) {
    return getCenteredElement(matrix, 1, i, 1) *
        getCenteredElement(matrix, l - 1, a, -l + 1) +
        getCenteredElement(matrix, 1, i, -1) *
        getCenteredElement(matrix, l - 1, a, l - 1);
  } else {
    return getCenteredElement(matrix, 1, i, 0) *
        getCenteredElement(matrix, l - 1, a, b);
  }
}
function getU(matrix, m, n, l) {
  return getP(matrix, 0, m, n, l);
}
function getV(matrix, m, n, l) {
  if (m === 0) {
    return getP(matrix, 1, 1, n, l) + getP(matrix, -1, -1, n, l);
  } else if (m > 0) {
    const d = getKroneckerDelta(m, 1);
    return getP(matrix, 1, m - 1, n, l) * Math.sqrt(1 + d) -
        getP(matrix, -1, -m + 1, n, l) * (1 - d);
  } else {
    const d = getKroneckerDelta(m, -1);
    return getP(matrix, 1, m + 1, n, l) * (1 - d) +
        getP(matrix, -1, -m - 1, n, l) * Math.sqrt(1 + d);
  }
}
function getW(matrix, m, n, l) {
  if (m === 0) {
    return 0;
  }
  return m > 0 ? getP(matrix, 1, m + 1, n, l) + getP(matrix, -1, -m - 1, n, l) :
                 getP(matrix, 1, m - 1, n, l) - getP(matrix, -1, -m + 1, n, l);
}
function computeUVWCoeff(m, n, l) {
  const d = getKroneckerDelta(m, 0);
  const reciprocalDenominator =
      Math.abs(n) === l ? 1 / (2 * l * (2 * l - 1)) : 1 / ((l + n) * (l - n));
  return [
    Math.sqrt((l + m) * (l - m) * reciprocalDenominator),
    0.5 * (1 - 2 * d) * Math.sqrt((1 + d) *
                                  (l + Math.abs(m) - 1) *
                                  (l + Math.abs(m)) *
                                  reciprocalDenominator),
    -0.5 * (1 - d) * Math.sqrt((l - Math.abs(m) - 1) * (l - Math.abs(m))) *
        reciprocalDenominator,
  ];
}
function computeBandRotation(matrix, l) {
  for (let m = -l; m <= l; m++) {
    for (let n = -l; n <= l; n++) {
      const uvwCoefficients = computeUVWCoeff(m, n, l);
      if (Math.abs(uvwCoefficients[0]) > 0) {
        uvwCoefficients[0] *= getU(matrix, m, n, l);
      }
      if (Math.abs(uvwCoefficients[1]) > 0) {
        uvwCoefficients[1] *= getV(matrix, m, n, l);
      }
      if (Math.abs(uvwCoefficients[2]) > 0) {
        uvwCoefficients[2] *= getW(matrix, m, n, l);
      }
      setCenteredElement(
          matrix, l, m, n,
          uvwCoefficients[0] + uvwCoefficients[1] + uvwCoefficients[2]);
    }
  }
}
function computeHOAMatrices(matrix) {
  for (let i = 2; i <= matrix.length; i++) {
    computeBandRotation(matrix, i);
  }
}
function HOARotator(context, ambisonicOrder) {
  this._context = context;
  this._ambisonicOrder = ambisonicOrder;
  const numberOfChannels = (ambisonicOrder + 1) * (ambisonicOrder + 1);
  this._splitter = this._context.createChannelSplitter(numberOfChannels);
  this._merger = this._context.createChannelMerger(numberOfChannels);
  this._gainNodeMatrix = [];
  let orderOffset;
  let rows;
  let inputIndex;
  let outputIndex;
  let matrixIndex;
  for (let i = 1; i <= ambisonicOrder; i++) {
    orderOffset = i * i;
    rows = (2 * i + 1);
    this._gainNodeMatrix[i - 1] = [];
    for (let j = 0; j < rows; j++) {
      inputIndex = orderOffset + j;
      for (let k = 0; k < rows; k++) {
        outputIndex = orderOffset + k;
        matrixIndex = j * rows + k;
        this._gainNodeMatrix[i - 1][matrixIndex] = this._context.createGain();
        this._splitter.connect(
            this._gainNodeMatrix[i - 1][matrixIndex], inputIndex);
        this._gainNodeMatrix[i - 1][matrixIndex].connect(
            this._merger, 0, outputIndex);
      }
    }
  }
  this._splitter.connect(this._merger, 0, 0);
  this.setRotationMatrix3(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
  this.input = this._splitter;
  this.output = this._merger;
}
HOARotator.prototype.setRotationMatrix3 = function(rotationMatrix3) {
  this._gainNodeMatrix[0][0].gain.value = -rotationMatrix3[0];
  this._gainNodeMatrix[0][1].gain.value = rotationMatrix3[1];
  this._gainNodeMatrix[0][2].gain.value = -rotationMatrix3[2];
  this._gainNodeMatrix[0][3].gain.value = -rotationMatrix3[3];
  this._gainNodeMatrix[0][4].gain.value = rotationMatrix3[4];
  this._gainNodeMatrix[0][5].gain.value = -rotationMatrix3[5];
  this._gainNodeMatrix[0][6].gain.value = -rotationMatrix3[6];
  this._gainNodeMatrix[0][7].gain.value = rotationMatrix3[7];
  this._gainNodeMatrix[0][8].gain.value = -rotationMatrix3[8];
  computeHOAMatrices(this._gainNodeMatrix);
};
HOARotator.prototype.setRotationMatrix4 = function(rotationMatrix4) {
  this._gainNodeMatrix[0][0].gain.value = -rotationMatrix4[0];
  this._gainNodeMatrix[0][1].gain.value = rotationMatrix4[1];
  this._gainNodeMatrix[0][2].gain.value = -rotationMatrix4[2];
  this._gainNodeMatrix[0][3].gain.value = -rotationMatrix4[4];
  this._gainNodeMatrix[0][4].gain.value = rotationMatrix4[5];
  this._gainNodeMatrix[0][5].gain.value = -rotationMatrix4[6];
  this._gainNodeMatrix[0][6].gain.value = -rotationMatrix4[8];
  this._gainNodeMatrix[0][7].gain.value = rotationMatrix4[9];
  this._gainNodeMatrix[0][8].gain.value = -rotationMatrix4[10];
  computeHOAMatrices(this._gainNodeMatrix);
};
HOARotator.prototype.getRotationMatrix3 = function() {
  const rotationMatrix3 = new Float32Array(9);
  rotationMatrix3[0] = -this._gainNodeMatrix[0][0].gain.value;
  rotationMatrix3[1] = this._gainNodeMatrix[0][1].gain.value;
  rotationMatrix3[2] = -this._gainNodeMatrix[0][2].gain.value;
  rotationMatrix3[4] = -this._gainNodeMatrix[0][3].gain.value;
  rotationMatrix3[5] = this._gainNodeMatrix[0][4].gain.value;
  rotationMatrix3[6] = -this._gainNodeMatrix[0][5].gain.value;
  rotationMatrix3[8] = -this._gainNodeMatrix[0][6].gain.value;
  rotationMatrix3[9] = this._gainNodeMatrix[0][7].gain.value;
  rotationMatrix3[10] = -this._gainNodeMatrix[0][8].gain.value;
  return rotationMatrix3;
};
HOARotator.prototype.getRotationMatrix4 = function() {
  const rotationMatrix4 = new Float32Array(16);
  rotationMatrix4[0] = -this._gainNodeMatrix[0][0].gain.value;
  rotationMatrix4[1] = this._gainNodeMatrix[0][1].gain.value;
  rotationMatrix4[2] = -this._gainNodeMatrix[0][2].gain.value;
  rotationMatrix4[4] = -this._gainNodeMatrix[0][3].gain.value;
  rotationMatrix4[5] = this._gainNodeMatrix[0][4].gain.value;
  rotationMatrix4[6] = -this._gainNodeMatrix[0][5].gain.value;
  rotationMatrix4[8] = -this._gainNodeMatrix[0][6].gain.value;
  rotationMatrix4[9] = this._gainNodeMatrix[0][7].gain.value;
  rotationMatrix4[10] = -this._gainNodeMatrix[0][8].gain.value;
  return rotationMatrix4;
};
HOARotator.prototype.getAmbisonicOrder = function() {
  return this._ambisonicOrder;
};

const OmnitoneTOAHrirBase64 = [
"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",
];

const OmnitoneSOAHrirBase64 = [
"UklGRuQDAABXQVZFZm10IBAAAAABAAIAgLsAAADuAgAEABAAZGF0YcADAAAAAAAA/f/9/wAAAAD9//3/AgABAPz//P8AAAEA/P/8/wAAAgD7//3/+//6////AwAAAAQA+//9//v///8GAAoAAAAHAAMAAAD6//X/BwAGAA0ADgD3//3/8v/v/xYAFwARAA4A+v/m/xIA+f8SAPz/CwAPAOj/1v/p/8n/DAATAAcAFAD1//T/zP/O/wgAOwDf/wYAq/+0/9f/6v/J/+T/GABgAM7/4v/1////TwB4ADAASgAXABYAQgALAI0AkwBUAB8APQCq/+j/ZP9eABIAUwA+AO3/jf/v/83/TQBPANT/qv/s/vD+kP+H/53/DACk/1wAUv+w/8T/IwA8ALsADACGAGP/rP/f/4AARgAIAXf/p/8oAF0ANAAiAPAAwAAsAPD/CAA7/64Azv++AOL/iwC8//L/rf4YAQQAvQABAFIAnP8OALb/4f9b/6r/HgDJ/30APP+d/4X/SgCk/6kAIP6R/4/+nf+z/hQAG/+6AAr/VAC4/9QA9QCgAeAB/gKuANgAkv8q/v4AZwBlAAoAfwCu/5YAGf+kADj/9QAAAPv/RP2b/mn89v9l/lgDZQIZAb4A2v88/XUATP6O/qj/lv98AgYB5wEMASoFvAGnB3YDwQPMAzgGvAeRDXgE9gVOBNsDZgfbDZ8DVQoyCjwMLwLgAmkOShBDJfUwCzMfNtohbwTc8qDQCA/9A4UKPP4t7H7eW/oz93v6sfGNCBsDQQdFAqoBOfky//H4K/0t9OwFTAC0BOD9owIu+dIB6vjYA1D9lAMKANYB1PvyAgj71wQS/Q0Cxv1QAML7+QDx+hcB3fyZAab8xAHk/GMAX/yX/1f8+wB+/rv+Pfy6AM39TwIW/yYBhf4yAL/9WAAb/pMAiv+i/0L+YAAZ/qgAy/5aAVoA4ADd/3MAeP6TAEj/1gHtANEAef8DAIb+nwB2/0sB9gCHAb0AlgBW/x0Bs//dAOj/wADd/+T/jP7mAHIAIQG2AHcAuv9QAN3/OQD5/7QA8wDw//D/DQDh/zQAUADHAM0ANgAyABwAAgCGAOwAOwCtAKz/3f+O/+z/AwA4AA0AfgAgAF4A4//T/0AAVgAjACwAFgDU/+T/hf87ADgAdgBQAB4A5v9JABUAbgASAKkAdABBAPb/OgDN/3wAHABhAB0AHQDM/xcApv8rAO3/LQD4/wcAuv8HAMn/IwD0/y4AJAAEAOb/+P/a/zMALQAZAP//DgD8//r/2v8eABAABQADAPv/5v/5/+r/AgD3/wsACQDx/+f/AQD8//v/AAA=",
"UklGRuQDAABXQVZFZm10IBAAAAABAAIAgLsAAADuAgAEABAAZGF0YcADAAAAAAAAAAD///3/AAADAP//+////wUAAAD5/wAABAD9//n//P8EAAAA9v/+/////P/5/wEA+f8CAP3/AQD0///////8//j/CQAEAAMA5//5/xoA/v8DAAgAAAD8/xQA5v8MAP7/DAD8/xQA9P8aAPD/FQDz/zwAHgAEABoACQAMAAoALwDc/y0ApP8IANb/6P+3/+L/0f8JANz/0P+6/7P/NwDL/////f8PAPz/LwDM/1AAMwDo/zQA2P8sAMX/BgCl/w0AGwBEALP/6/9AANj/uwAtAHcAcQCpAO3/8QDo/1IA6/+u/6v/uv9l/1X/PP9f//v/yf8aAID/BQC5/28A9v/1AHT/qwDd/xEADwD8//r/4f8xAKr/jv+p/7n/ff9qAL7/KABOAGEAuf/6ABcAogAOAC4A/v/oADQADwDa/8v/iABXAFkAhf86AAEAyP8dAAUAjf84APH+U//F/4X/CP9//yP/tP+j/3j///6K/18AnQDu/ssAAv/u//0ARwCxARMB7QB9ACUBFQAEAe7/egCUALwAqwAqAQH/9AGS/jABDwHd/g0A6vy5/cgAZv7//7H/MQHfAQABYAA6/AUA6/3xAQn7VgPa+tv+kP9M/jT+8QHy+nn6twOc+3gH/f3DANsBBwR1AeQOmv5RBo0Hy/l+CAv0IAQm7aXxFg3OCDEV+R1DBXHvJPeD7+XiEgY1/IT0mwVg7DoHIfspAsUC7+0zBtQBqg2PBwwIjgNEAIIKm/zqBCT9Gf9T/7D/tgG0ABT9sf1M+4IBcAEpAUMAvPseAX7+PwHc/S0Cd//3AAkB6f52/+kAPAC5AMT+OgG4/8P/6wGW/6kBTAAmADr/AQHz/wEBSgHP/4UAiQEHALoBFgCjAOIApwBrAVT/VwBf/g0ANQD3/7//CwDq/in/Nf+r//T+kwD0/goAYP8E/03/pP79/mj/U/9r/67+UP/V/3z/OwAuAMj/qP+0AFj/5wAOAAwBXwCKAG8AVgDy/xoAm/8yAMz/jQCJ/ygAYP/JABEAtAA3AGcAgADqAHEAgACfACgAlgDB/0MAPf8oADX/uv+G/x8Al/+o/8P/a/8jANH/6v/K/+P/x/8UAIX/EwCC/wcA2//P//b/hf/V/7T/EQCD/0oAl/8iAN7/3P/h//7/CAAbAAIA/P///+L/5v/Q/zUA7f/i/9n/3P/B/xcA8v/g/xkA+P8NAPv/FAAMACgA9v8oAAoAGQADAPz/DgAFABUADwAHAPj/BwD6/w8A+/8HAAAA/v/8/wgA9f8=",
"UklGRuQDAABXQVZFZm10IBAAAAABAAIAgLsAAADuAgAEABAAZGF0YcADAAAAAAAA//8BAP7//P///wMA/v/5////BAD+//n//f8DAP3/+P8CAAMA/f/1//r/AQABAP7/BAD6/wEAAQD+//7/AgAFAAoA+f///woA8P/0/wMAGwAOAPr/+f8FAOv/GQD//wQAAAAKAPv/GQD3/wwADgD8/zUAGAASANX/8//q/xcA4v8PAKr/0f+k/8r/5v/L/73/+f8NANL/KgCr/wQABgCIADkAKQAPADEA7P9YAFkAPgBXALf/HADl//H/xP8eAIj/ewBIAPr/3P+y/zwARwCpAFEAOgCA/08Aof9kANn/lP+Y/xT/Tv84/3f/Lv8+ANn/TgBBAAEA8/90AH8AQgFPAHEAT/+A/yAAmf9PAM7/yP/S/08Akf8QALn/IQA5ALoAbgBvAL//ewAgAMAAdAD8/wQAe/8KAEoA4/+S/4YAxv9/APD/xv/+/qP/JAA5AMH/BwAN//r+cv9d/yQAqP+e/pD/l/+U/6MA3v9o/wQBIAEmAcT/if+y/08A5wGaAcIBcACfAM7/iwGT/zIAVgAt/5n/swAr/osAy/6CAPcAWgByAGn+nP2o/Ef/2wB4Aez+NAKAALEA8ABpAEH7EwIQ/iwBQPxZ/Nr7rP3fAaICfAJx/Dz9Jfz4BfYAQgpaBVMA/QC2Agr9KAySBpwBFgr49cYB5/QQ7tfv9wRFDY4WWBHG8I78AfKZ8sL/9eQ68TcAcvO3CucDHAsRBxIF+gf98X4NWQWuB6sKof3CBbn6cQk+/qECqf+d+xMAHv0L/Kz/Ov0M/OEClf+OAPX+aQGq+zICTf5NAlj8VQAOAPD+zAKEAJX/zP9gAM7/ZQAl/w0At//fAZ0ATgJQ/3EArv9kATcBTAFGAKT/ov8hAeT/8wC6AIj/AgGU/zL/gf4s/zT+bgDL/z8A3f44/xX/z//c/5EAuv4BABb/H/9BAD//fP83ADT/aQBcAMn/lv/c/3cA6ADgAEIASACf/zsBLgAgAV8A+wDy/4UAQP8BAC3/pv+6/8H/if/n/0P/mf8sAIEAmABIAHgADwBFAOMAhQBbAHoABwDo/9v/h/9j/3//i////xcAuP8zAI7/qwAKAA0BOACGAOv/pgCq/8cA3f+AAD0AfAAkAC0A6//B/1YAFABrANn/HADN/9//PAAIADYALQAPAOb/BADC/xYA2P/T/wAACgDd/8r/0v/a/x4ADwA3AND/FwAHABcAEAAlAA0AHwD//wAAGADo/wkAAAAQAAkADwDu/wEA8P8KAPz/CQABAPv//P/7//j/BQA=",
"UklGRuQDAABXQVZFZm10IBAAAAABAAIAgLsAAADuAgAEABAAZGF0YcADAAD//wAAAAD//////////wAA///+/wEAAAD+//3//v8BAP7/+/8BAAEA/f////z/AAD7/wEA/v///wAAAAD1/wIAAAACAAgA9f8AAP7/9//6/wwA7/8KAPn/AgAEAAoAAQAGABQADwAFAAoAFwDu/xkA7v/0/wgA///y//j/4v/w//3/4v8VAPf/BQDy/+X/AQAHAAgAIQDy/+D/JwDN/x8ABwDm//b/+f/p/+v/8//I/wEA8P8zAPH/AAABAMb/LwApAA8AfgAEAA4AVgD1//3/TwDt/wkAPADj//r/7v///wsA4f83ANr/zP/q/3L/9f+v/8v/wf/e/33/QgCq/wEACQAVABsAPADY/+r/4P/5/5sAxP/sAOT/IAAiAA4AgP+gAM3/LQD8/97/7v/y/xwANQBXAHEAQABTAEsA4//PAAsAFgDW/wQA8f7m/23/iP+3/+b/fP/O/y3/qf92/+n/8/+a/6X/ef+L/zgAKwDt/+wApv9vAPgAoP/IAPr/s//3ANQATQGZ/8MAcv/+/08AuQGz/mEB2f+J/wMBQQFzAG8Bl//I/80ABf76ALr9If8R/RIAlP7B/wcAf/7A/fr+2f6x/kf/4P6z/UkAov61AWMBoQKv/WcBgfpIAdoANAE+AEn+zfgTAS/5PwHuBKH51AkR/U/75QMG9IADGf0d/KoMjPhGFAYEeQKMBff47/o2Ahb4/AUWADQE0gdw/IkHp/95ABEI4f4FBW8CPwBb/u79JgO0AyUDqQZu+j7/c/0J/OYAx/3h/q7+8/3g/tD/vP2Y/n38GQBj/j4BCADM/m/+aABm/4IAcQAJ/p/+1P8+/0QA4//M/un+NQEf/8IA4v+R/6D/XQBo/8gAcP8uAPb+IQHo/7gAtwAR/2n//gBB/0kARwBo/1kAPwDJ/zUAL/97//D/jP9yAJn/qP/2/8v/1wCBABcAKQBlAKf/gAC4/7D/4v/f/zcAagDl//j/x//v/14A5v8sAMr/f/8JANv/xP+EAJT/GACd/7r/4P+5/3n/rf/f/6T/zv9A/5T/Wv/x/0YAkv9TAPP/FgAWAF8A1/9pABsASQBEABQAEgAVAEMAVgBpADoAQwDS/20ADQBdAEoAAQDq/x4A6v8MACEA0v/8/xgA9v8NAPD////e/xkAIgDl/yEAzf/m///////V/x0Avv/r//z/0//h/+f/0//t//3/6f/7/+D/DQD5/xgAEAAIAAcAGAD//xEACwAEAA8A9f8KAAQA/P/3//3/9P8HAAAA+//4//P/BgA=",
"UklGRuQDAABXQVZFZm10IBAAAAABAAIAgLsAAADuAgAEABAAZGF0YcADAAD//wAAAAAAAP//AAD+/wAA//8AAAAAAAAAAAAA//8AAP7/AAD+/wAAAQAAAPz/AAAAAAAAAQAAAP//AAAEAAAA+/8AAAQAAAAHAAAA//8AAPf/AAD2/wAAAAAAAPT/AAD+/wAACAAAAP//AAAHAAAA9P8AAAQAAAASAAAA8f8AAPX/AADz/wAA/P8AAOH/AADm/wAA/f8AABAAAAAmAAAA6P8AADIAAAAnAAAABQAAABEAAAD5/wAAPwAAAA0AAAAfAAAALAAAACsAAADq/wAAjP8AAPv/AAC9/wAAkv8AAK3/AACA/wAA2/8AALv/AACh/wAAKwAAAEgAAABLAAAAJgAAAD4AAAAFAAAA1/8AAEMAAAAiAAAAqQAAAGIAAAAvAAAAxgAAAIgAAABlAAAACQAAAD4AAADo/wAAsf8AAJP/AAAt/wAAmv8AAMb+AAD5/gAAgf8AAFX/AAB7/wAAFv8AALf/AACx/wAAx/8AAHwAAAB+AAAANwEAAKUAAABEAQAARgIAANQAAAAXAQAAYAAAAPAAAADvAAAAYP8AAJsBAABQAAAAHwAAAFn/AADA/QAAWQAAAO/+AAAN/AAA1/oAACD9AADH+gAA3/gAAB39AACO+gAAovgAAEj+AACS/wAAmvsAAED/AADy/gAAmwEAAA4EAACF9wAAUf8AAJMYAABWFQAAb/8AALwHAACgCAAAl/sAACwDAAApAAAAeAIAAEoDAAA0AgAARwcAAPv+AABoAAAASAEAAHoAAAArAAAAT/sAAIr+AABoAAAAhv8AAGP9AACp/QAAc/4AALb8AAC3/QAAkv0AAJH9AADa/QAAZf0AAF/+AAA6/wAAY/8AAHL/AACZ/wAATf8AACz/AADN/wAAVwAAALcAAAAEAAAA2v8AAMkAAAAcAAAAOAAAAMoAAAC1AAAAuAAAAOH/AAAVAAAAewAAAKkAAABiAAAAKwAAAJ0AAADP/wAA7P8AAOr/AACp/wAAHAAAAHT/AAB//wAA2v8AAML/AAC7/wAAt/8AAPP/AAC3/wAAzf8AAOD/AADE/wAAAwAAAJ3/AADK/wAAGAAAAOn/AADt/wAA//8AACoAAADs/wAA2/8AANX/AAD5/wAACAAAALf/AAD+/wAADwAAAPH/AADs/wAA5v8AABEAAAD1/wAA6P8AAAAAAAADAAAACQAAAOj/AAAGAAAACAAAAPX/AAAQAAAA+f8AAA4AAAD7/wAA7P8AAAIAAAD9/wAAAwAAAPr/AAABAAAAAgAAAP//AAA=",
];

const RenderingMode = {
  AMBISONIC: 'ambisonic',
  BYPASS: 'bypass',
  OFF: 'off',
};
const SupportedAmbisonicOrder = [2, 3];
function HOARenderer(context, config) {
  this._context = Utils.isAudioContext(context) ?
      context :
      Utils.throw('HOARenderer: Invalid BaseAudioContext.');
  this._config = {
    ambisonicOrder: 3,
    renderingMode: RenderingMode.AMBISONIC,
  };
  if (config && config.ambisonicOrder) {
    if (SupportedAmbisonicOrder.includes(config.ambisonicOrder)) {
      this._config.ambisonicOrder = config.ambisonicOrder;
    } else {
      Utils.log(
          'HOARenderer: Invalid ambisonic order. (got ' +
          config.ambisonicOrder + ') Fallbacks to 3rd-order ambisonic.');
    }
  }
  this._config.numberOfChannels =
      (this._config.ambisonicOrder + 1) * (this._config.ambisonicOrder + 1);
  this._config.numberOfStereoChannels =
      Math.ceil(this._config.numberOfChannels / 2);
  if (config && config.hrirPathList) {
    if (Array.isArray(config.hrirPathList) &&
        config.hrirPathList.length === this._config.numberOfStereoChannels) {
      this._config.pathList = config.hrirPathList;
    } else {
      Utils.throw(
          'HOARenderer: Invalid HRIR URLs. It must be an array with ' +
          this._config.numberOfStereoChannels + ' URLs to HRIR files.' +
          ' (got ' + config.hrirPathList + ')');
    }
  }
  if (config && config.renderingMode) {
    if (Object.values(RenderingMode).includes(config.renderingMode)) {
      this._config.renderingMode = config.renderingMode;
    } else {
      Utils.log(
          'HOARenderer: Invalid rendering mode. (got ' +
          config.renderingMode + ') Fallbacks to "ambisonic".');
    }
  }
  this._buildAudioGraph();
  this._isRendererReady = false;
}
HOARenderer.prototype._buildAudioGraph = function() {
  this.input = this._context.createGain();
  this.output = this._context.createGain();
  this._bypass = this._context.createGain();
  this._hoaRotator = new HOARotator(this._context, this._config.ambisonicOrder);
  this._hoaConvolver =
      new HOAConvolver(this._context, this._config.ambisonicOrder);
  this.input.connect(this._hoaRotator.input);
  this.input.connect(this._bypass);
  this._hoaRotator.output.connect(this._hoaConvolver.input);
  this._hoaConvolver.output.connect(this.output);
  this.input.channelCount = this._config.numberOfChannels;
  this.input.channelCountMode = 'explicit';
  this.input.channelInterpretation = 'discrete';
};
HOARenderer.prototype._initializeCallback = function(resolve, reject) {
  let bufferList;
  if (this._config.pathList) {
    bufferList =
        new BufferList(this._context, this._config.pathList, {dataType: 'url'});
  } else {
    bufferList = this._config.ambisonicOrder === 2
        ? new BufferList(this._context, OmnitoneSOAHrirBase64)
        : new BufferList(this._context, OmnitoneTOAHrirBase64);
  }
  bufferList.load().then(
      function(hrirBufferList) {
        this._hoaConvolver.setHRIRBufferList(hrirBufferList);
        this.setRenderingMode(this._config.renderingMode);
        this._isRendererReady = true;
        Utils.log('HOARenderer: HRIRs loaded successfully. Ready.');
        resolve();
      }.bind(this),
      function() {
        const errorMessage = 'HOARenderer: HRIR loading/decoding failed.';
        reject(errorMessage);
        Utils.throw(errorMessage);
      });
};
HOARenderer.prototype.initialize = function() {
  Utils.log(
      'HOARenderer: Initializing... (mode: ' + this._config.renderingMode +
      ', ambisonic order: ' + this._config.ambisonicOrder + ')');
  return new Promise(this._initializeCallback.bind(this));
};
HOARenderer.prototype.setRotationMatrix3 = function(rotationMatrix3) {
  if (!this._isRendererReady) {
    return;
  }
  this._hoaRotator.setRotationMatrix3(rotationMatrix3);
};
HOARenderer.prototype.setRotationMatrix4 = function(rotationMatrix4) {
  if (!this._isRendererReady) {
    return;
  }
  this._hoaRotator.setRotationMatrix4(rotationMatrix4);
};
HOARenderer.prototype.setRenderingMode = function(mode) {
  if (mode === this._config.renderingMode) {
    return;
  }
  switch (mode) {
    case RenderingMode.AMBISONIC:
      this._hoaConvolver.enable();
      this._bypass.disconnect();
      break;
    case RenderingMode.BYPASS:
      this._hoaConvolver.disable();
      this._bypass.connect(this.output);
      break;
    case RenderingMode.OFF:
      this._hoaConvolver.disable();
      this._bypass.disconnect();
      break;
    default:
      Utils.log(
          'HOARenderer: Rendering mode "' + mode + '" is not ' +
          'supported.');
      return;
  }
  this._config.renderingMode = mode;
  Utils.log('HOARenderer: Rendering mode changed. (' + mode + ')');
};

const Polyfill = {};
Polyfill.getBrowserInfo = function() {
  const ua = navigator.userAgent;
  let M = ua.match(
      /(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*([\d\.]+)/i) ||
      [];
  let tem;
  if (/trident/i.test(M[1])) {
    tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
    return {name: 'IE', version: (tem[1] || '')};
  }
  if (M[1] === 'Chrome') {
    tem = ua.match(/\bOPR|Edge\/(\d+)/);
    if (tem != null) {
      return {name: 'Opera', version: tem[1]};
    }
  }
  M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
  if ((tem = ua.match(/version\/([\d.]+)/i)) != null) {
    M.splice(1, 1, tem[1]);
  }
  let platform = ua.match(/android|ipad|iphone/i);
  if (!platform) {
    platform = ua.match(/cros|linux|mac os x|windows/i);
  }
  return {
    name: M[0],
    version: M[1],
    platform: platform ? platform[0] : 'unknown',
  };
};
Polyfill.patchSafari = function() {
  if (window.webkitAudioContext && window.webkitOfflineAudioContext) {
    window.AudioContext = window.webkitAudioContext;
    window.OfflineAudioContext = window.webkitOfflineAudioContext;
  }
};

const Version = '1.3.0';

const Omnitone = {};
Omnitone.browserInfo = Polyfill.getBrowserInfo();
Omnitone.createBufferList = function(context, bufferData, options, progressCallback) {
  const bufferList = new BufferList(
    context,
    bufferData,
    options || { dataType: 'url' },
    progressCallback
  );
  const promise = bufferList.load();
  promise.abort = function() {
    bufferList.abort();
  };
  return promise;
};
Omnitone.mergeBufferListByChannel = Utils.mergeBufferListByChannel;
Omnitone.splitBufferbyChannel = Utils.splitBufferbyChannel;
Omnitone.createFOAConvolver = function(context, hrirBufferList) {
  return new FOAConvolver(context, hrirBufferList);
};
Omnitone.createFOARouter = function(context, channelMap) {
  return new FOARouter(context, channelMap);
};
Omnitone.createFOARotator = function(context) {
  return new FOARotator(context);
};
Omnitone.createHOARotator = function(context, ambisonicOrder) {
  return new HOARotator(context, ambisonicOrder);
};
Omnitone.createHOAConvolver = function(
    context, ambisonicOrder, hrirBufferList) {
  return new HOAConvolver(context, ambisonicOrder, hrirBufferList);
};
Omnitone.createFOARenderer = function(context, config) {
  return new FOARenderer(context, config);
};
Omnitone.createHOARenderer = function(context, config) {
  return new HOARenderer(context, config);
};
(function() {
  Utils.log(`Version ${Version} (running ${Omnitone.browserInfo.name} \
${Omnitone.browserInfo.version} on ${Omnitone.browserInfo.platform})`);
  if (Omnitone.browserInfo.name.toLowerCase() === 'safari') {
    Polyfill.patchSafari();
    Utils.log(`${Omnitone.browserInfo.name} detected. Polyfill applied.`);
  }
})();

export { Omnitone as default };
