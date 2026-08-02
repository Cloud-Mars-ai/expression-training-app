export type AudioMeter = {
  supported: boolean;
  dispose: () => Promise<void>;
};

export type AudioMeterFactory = (stream: MediaStream, onLevel: (level: number) => void) => Promise<AudioMeter>;

type AudioContextConstructor = new () => AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  const browserGlobal = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  return globalThis.AudioContext ?? browserGlobal.webkitAudioContext;
}

export const createAudioMeter: AudioMeterFactory = async (stream, onLevel) => {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) return { supported: false, dispose: async () => undefined };

  const context = new AudioContextCtor();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  source.connect(analyser);
  if (context.state === "suspended") await context.resume();

  const samples = new Float32Array(analyser.fftSize);
  let animationFrame = 0;
  let disposed = false;

  const readLevel = () => {
    if (disposed) return;
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rootMeanSquare = Math.sqrt(energy / samples.length);
    onLevel(Math.min(1, Math.max(0, rootMeanSquare * 4)));
    animationFrame = requestAnimationFrame(readLevel);
  };
  animationFrame = requestAnimationFrame(readLevel);

  return {
    supported: true,
    async dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      source.disconnect();
      analyser.disconnect();
      if (context.state !== "closed") await context.close();
    },
  };
};
