import type { AudioProcessorOptions, Track, TrackProcessor } from "livekit-client";
import { GtcrnWorkletNode, RnnoiseWorkletNode, loadGtcrn, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorklet from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasm from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasm from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import gtcrnWorklet from "@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url";
import gtcrnWasm from "@sapphi-red/web-noise-suppressor/gtcrn.wasm?url";

/**
 * Supressão de ruído no próprio navegador, sem serviço pago:
 * - "strong": RNNoise (leve, ótimo para teclado, ventilador e ruído constante);
 * - "max": GTCRN (rede neural mais nova, limpa melhor vozes ao fundo e ruído variável; usa mais CPU).
 * A voz passa pelo filtro antes de sair do computador: quem ouve recebe o som já limpo.
 */

export type StrongNoise = "strong" | "max";

const wasm = new Map<StrongNoise, Promise<ArrayBuffer>>();
const modules = new WeakMap<AudioContext, Map<StrongNoise, Promise<void>>>();

function binary(mode: StrongNoise): Promise<ArrayBuffer> {
  let p = wasm.get(mode);
  if (!p) {
    p = mode === "strong" ? loadRnnoise({ url: rnnoiseWasm, simdUrl: rnnoiseSimdWasm }) : loadGtcrn({ url: gtcrnWasm });
    wasm.set(mode, p);
  }
  return p;
}

function addModule(ctx: AudioContext, mode: StrongNoise): Promise<void> {
  let m = modules.get(ctx);
  if (!m) {
    m = new Map();
    modules.set(ctx, m);
  }
  let p = m.get(mode);
  if (!p) {
    p = ctx.audioWorklet.addModule(mode === "strong" ? rnnoiseWorklet : gtcrnWorklet);
    m.set(mode, p);
  }
  return p;
}

export interface NoiseNode {
  node: AudioWorkletNode;
  destroy(): void;
}

/** Cria o nó de supressão (carrega o WebAssembly e o worklet na primeira vez). */
export async function createNoiseNode(ctx: AudioContext, mode: StrongNoise): Promise<NoiseNode> {
  const [bin] = await Promise.all([binary(mode), addModule(ctx, mode)]);
  const node = mode === "strong" ? new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: bin }) : new GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary: bin });
  return {
    node,
    destroy: () => {
      node.disconnect();
      node.destroy();
    },
  };
}

/** Processador de microfone para o LiveKit (entra com `track.setProcessor`). */
export function noiseProcessor(mode: StrongNoise): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  let source: MediaStreamAudioSourceNode | null = null;
  let noise: NoiseNode | null = null;
  let dest: MediaStreamAudioDestinationNode | null = null;

  const teardown = () => {
    source?.disconnect();
    noise?.destroy();
    dest?.disconnect();
    source = null;
    noise = null;
    dest = null;
  };

  const proc: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
    name: `infinity-noise-${mode}`,
    async init(opts) {
      teardown();
      const ctx = opts.audioContext;
      noise = await createNoiseNode(ctx, mode);
      source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
      dest = ctx.createMediaStreamDestination();
      dest.channelCount = 1;
      source.connect(noise.node).connect(dest);
      proc.processedTrack = dest.stream.getAudioTracks()[0];
    },
    async restart(opts) {
      await proc.init(opts);
    },
    async destroy() {
      teardown();
      proc.processedTrack = undefined;
    },
  };
  return proc;
}
