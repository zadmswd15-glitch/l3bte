class HorrorAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private muted = false;
  private started = false;
  private lastStepTime = 0;
  private lastHeartbeatTime = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.45, this.ctx.currentTime, 0.08);
    }
  }

  public ensureStarted(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.45;
    this.masterGain.connect(this.ctx.destination);

    // Eerie sub-bass ambient corridor drone
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;

    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.22;

    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.value = 41.2; // Low E1

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.value = 42.1; // Slight detune beat

    this.droneOsc1.connect(filter);
    this.droneOsc2.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(this.masterGain);

    this.droneOsc1.start();
    this.droneOsc2.start();
    this.started = true;
  }

  public playFootstep(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStepTime < 0.36) return;
    this.lastStepTime = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 + Math.random() * 18, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.09);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playHeartbeat(tension: number): void {
    if (!this.ctx || !this.masterGain || this.muted || tension < 0.25) return;
    const now = this.ctx.currentTime;
    const interval = Math.max(0.42, 1.15 - tension * 0.72);
    if (now - this.lastHeartbeatTime < interval) return;
    this.lastHeartbeatTime = now;

    const pulse = (offset: number, vol: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(62, now + offset);
      osc.frequency.exponentialRampToValueAtTime(26, now + offset + 0.12);
      gain.gain.setValueAtTime(vol * tension, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    };

    pulse(0, 0.35);
    pulse(0.16, 0.22);
  }

  public playKeyPickup(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [1320, 1760, 2110].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);
      gain.gain.setValueAtTime(0.15, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.3);
    });
  }

  public playSmsSting(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    // Dissonant phone-vibration + eerie harmonic alert
    [220, 233.08, 659.25].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i < 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.14, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.06);
      osc.stop(now + 0.7);
    });
  }

  public playDoorUnlock(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.45);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  public playFlickerBuzz(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public dispose(): void {
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      void this.ctx?.close();
    } catch {
      // ignore cleanup errors
    }
    this.started = false;
  }
}

export const horrorAudio = new HorrorAudioEngine();
