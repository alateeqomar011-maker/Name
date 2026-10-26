// Captures raw microphone samples (mono) and posts them to the main thread in blocks,
// together with a peak level for the meter. Runs on the audio rendering thread.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = true;
    this.buf = new Float32Array(4096);
    this.n = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }
  flush() {
    if (this.n > 0) {
      const out = this.buf.slice(0, this.n);
      let peak = 0;
      for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
      this.port.postMessage({ type: 'data', samples: out, peak }, [out.buffer]);
      this.n = 0;
    }
  }
  process(inputs) {
    if (!this.recording) return false;
    const input = inputs[0];
    if (input && input.length) {
      const ch0 = input[0];
      const ch1 = input.length > 1 ? input[1] : null;
      for (let i = 0; i < ch0.length; i++) {
        this.buf[this.n++] = ch1 ? 0.5 * (ch0[i] + ch1[i]) : ch0[i];
        if (this.n === this.buf.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('murattil-recorder', RecorderProcessor);
