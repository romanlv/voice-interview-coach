export class TTSPlayer {
  constructor() {
    this.playbackCtx = null;
    this.analyser = null;
    this.nextPlayTime = 0;
    this.sources = [];
    this.remainder = null;
    this.onPlayStart = null;
    this.onPlayStop = null;
    this._started = false;
  }

  async init() {
    if (!this.playbackCtx) {
      this.playbackCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (this.playbackCtx.state === 'suspended') {
      await this.playbackCtx.resume();
    }
    return this.playbackCtx;
  }

  _ensureContext() {
    if (!this.playbackCtx) {
      this.playbackCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (this.playbackCtx.state === 'suspended') {
      this.playbackCtx.resume();
    }
    if (!this.analyser) {
      this.analyser = this.playbackCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.playbackCtx.destination);
    }
    return this.playbackCtx;
  }

  getAnalyser() {
    return this.analyser;
  }

  playChunk(arrayBuffer) {
    if (!this._chunkCount) this._chunkCount = 0;
    this._chunkCount++;
    if (this._chunkCount <= 3) {
      console.log(`TTS chunk #${this._chunkCount}: ${arrayBuffer.byteLength} bytes, ctx state: ${this.playbackCtx?.state}`);
    }
    const ctx = this._ensureContext();

    // Prepend any leftover byte from the previous chunk
    let bytes;
    if (this.remainder) {
      const combined = new Uint8Array(this.remainder.length + arrayBuffer.byteLength);
      combined.set(this.remainder, 0);
      combined.set(new Uint8Array(arrayBuffer), this.remainder.length);
      bytes = combined;
      this.remainder = null;
    } else {
      bytes = new Uint8Array(arrayBuffer);
    }

    // Int16 requires 2-byte alignment — save any trailing odd byte
    const usable = bytes.length - (bytes.length % 2);
    if (usable === 0) {
      this.remainder = bytes;
      return;
    }
    if (bytes.length % 2 !== 0) {
      this.remainder = bytes.slice(usable);
    }

    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, usable / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser || ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + audioBuffer.duration;

    this.sources.push(source);

    if (!this._started && this.onPlayStart) {
      this._started = true;
      this.onPlayStart();
    }

    source.onended = () => {
      const idx = this.sources.indexOf(source);
      if (idx !== -1) this.sources.splice(idx, 1);
      if (this.sources.length === 0 && this._started) {
        this._started = false;
        if (this.onPlayStop) this.onPlayStop();
      }
    };
  }

  stop() {
    console.warn(`[TTS] stop() called — ${this.sources.length} active sources, ${this._chunkCount} chunks received so far`);
    console.trace('[TTS] stop() stacktrace');
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources = [];
    this.nextPlayTime = 0;
    this.remainder = null;
    this._chunkCount = 0;
    this._started = false;
    if (this.onPlayStop) this.onPlayStop();
  }
}
