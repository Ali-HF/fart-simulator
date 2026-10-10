// Pure Audio Engine with authentic isolated recorded fart sound effects.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

// 12 Pure, isolated cartoon & real fart sound effects (no laughter, no talking)
const PURE_FART_FILES = [
  "/sounds/pure_fart_2889.mp3",
  "/sounds/pure_fart_2890.mp3",
  "/sounds/pure_fart_2891.mp3",
  "/sounds/pure_fart_3041.mp3",
  "/sounds/pure_fart_3043.mp3",
  "/sounds/pure_fart_3050.mp3",
  "/sounds/pure_fart_3051.mp3",
  "/sounds/pure_fart_3052.mp3",
  "/sounds/pure_fart_3053.mp3",
  "/sounds/pure_fart_3054.mp3",
  "/sounds/pure_fart_3055.mp3",
  "/sounds/pure_fart_3056.mp3",
];

const audioBuffers: AudioBuffer[] = [];
let audioLoaded = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Preload all isolated pure fart audio files into Web Audio memory buffers */
export async function preloadFartSounds() {
  const c = ac();
  if (!c || audioLoaded) return;
  audioLoaded = true;

  await Promise.all(
    PURE_FART_FILES.map(async (url) => {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const decoded = await c.decodeAudioData(arrayBuf);
          audioBuffers.push(decoded);
        }
      } catch {
        // ignore fetch/decode failures
      }
    })
  );
}

// Automatically begin fetching and decoding audio as soon as script runs
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => unlockAudio(), { once: true });
  window.addEventListener("keydown", () => unlockAudio(), { once: true });
  setTimeout(() => preloadFartSounds(), 100);
}

export function unlockAudio() {
  ac();
  preloadFartSounds();
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.8;
}

export function isMuted() {
  return muted;
}

export function triggerHaptic(type: "light" | "medium" | "heavy" | "bean") {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      if (type === "light") navigator.vibrate(12);
      else if (type === "medium") navigator.vibrate(35);
      else if (type === "heavy") navigator.vibrate([60, 40, 80]);
      else if (type === "bean") navigator.vibrate([20, 30, 25]);
    } catch {
      /* ignore vibration failures */
    }
  }
}

// Track active fart voices so releasing click/touch stops them cleanly
interface ActiveVoice {
  src: AudioBufferSourceNode | OscillatorNode;
  gain: GainNode;
  startedAt: number;
}

const activeVoices: ActiveVoice[] = [];

function cleanOldVoices() {
  const now = ac()?.currentTime ?? 0;
  for (let i = activeVoices.length - 1; i >= 0; i--) {
    if (now - activeVoices[i].startedAt > 4) {
      activeVoices.splice(i, 1);
    }
  }
}

/** Stop or quickly fade out any active continuous thrust fart sounds */
export function stopThrustFart(fadeTime = 0.12) {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;

  for (const voice of activeVoices) {
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);
      setTimeout(() => {
        try {
          voice.src.stop();
        } catch {
          /* ignore already stopped */
        }
      }, (fadeTime + 0.05) * 1000);
    } catch {
      /* ignore */
    }
  }
  activeVoices.length = 0;
}

/** Play pure isolated real fart sound with maximum duration limit and cutoff support */
export function playFart(duration = 0.45, pitch = 0.5, vol = 0.85, isThrust = true) {
  triggerHaptic("medium");
  const c = ac();
  if (!c || muted) return;
  cleanOldVoices();

  // If real recorded buffers are loaded into memory
  if (audioBuffers.length > 0) {
    const idx = Math.floor(Math.random() * audioBuffers.length);
    const buffer = audioBuffers[idx];
    const src = c.createBufferSource();
    src.buffer = buffer;

    // Subtle pitch variation so every toot sounds fresh
    const rate = 0.95 + pitch * 0.25 + (Math.random() * 0.15 - 0.075);
    src.playbackRate.setValueAtTime(rate, c.currentTime);

    const gain = c.createGain();
    const t = c.currentTime;
    gain.gain.setValueAtTime(vol * 1.15, t);
    
    // Natural fade-out after duration (~0.45s) so long audio tracks don't linger forever
    const maxDur = Math.min(duration, 0.55);
    gain.gain.setValueAtTime(vol * 1.15, t + maxDur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + maxDur);

    src.connect(gain).connect(master!);
    src.start(t);
    src.stop(t + maxDur + 0.05);

    if (isThrust) {
      activeVoices.push({ src, gain, startedAt: t });
    }
    return;
  }

  // Backup synthesized sound if files are still loading
  playSynthesizedFart(c, duration, pitch, vol, isThrust);
}

function playSynthesizedFart(c: AudioContext, duration: number, pitch: number, vol: number, isThrust: boolean) {
  const t = c.currentTime;
  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  const baseFreq = 50 + pitch * 100;
  const playDur = Math.min(duration, 0.5);

  osc1.type = "sawtooth";
  osc2.type = "triangle";

  osc1.frequency.setValueAtTime(baseFreq * 1.6, t);
  osc1.frequency.exponentialRampToValueAtTime(Math.max(30, baseFreq * 0.4), t + playDur);

  osc2.frequency.setValueAtTime(baseFreq * 0.9, t);
  osc2.frequency.exponentialRampToValueAtTime(Math.max(25, baseFreq * 0.3), t + playDur);

  const flutterLfo = c.createOscillator();
  flutterLfo.type = "sine";
  flutterLfo.frequency.setValueAtTime(26, t);
  flutterLfo.frequency.exponentialRampToValueAtTime(10, t + playDur);

  const flutterGain = c.createGain();
  flutterGain.gain.setValueAtTime(baseFreq * 0.8, t);
  flutterLfo.connect(flutterGain);
  flutterGain.connect(osc1.frequency);

  const formantFilter = c.createBiquadFilter();
  formantFilter.type = "bandpass";
  formantFilter.frequency.setValueAtTime(baseFreq * 3.5, t);
  formantFilter.frequency.exponentialRampToValueAtTime(120, t + playDur);
  formantFilter.Q.value = 4.5;

  const toneEnv = c.createGain();
  toneEnv.gain.setValueAtTime(0.0001, t);
  toneEnv.gain.linearRampToValueAtTime(vol * 0.85, t + 0.02);
  toneEnv.gain.exponentialRampToValueAtTime(0.0001, t + playDur);

  osc1.connect(formantFilter);
  osc2.connect(formantFilter);
  formantFilter.connect(toneEnv).connect(master!);

  osc1.start(t);
  osc2.start(t);
  flutterLfo.start(t);

  const stopTime = t + playDur + 0.05;
  osc1.stop(stopTime);
  osc2.stop(stopTime);
  flutterLfo.stop(stopTime);

  if (isThrust) {
    activeVoices.push({ src: osc1, gain: toneEnv, startedAt: t });
  }
}

export function playBlip(freq = 740, dur = 0.12, type: OscillatorType = "triangle", vol = 0.25) {
  triggerHaptic("light");
  const c = ac();
  if (!c || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 1.8, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Crash / Splat sound when player hits an obstacle */
export function playCrash() {
  triggerHaptic("heavy");
  const c = ac();
  if (!c || muted) return;
  
  // Big explosive toot
  playFart(0.85, 0.1, 1.0);
}
