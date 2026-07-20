// PHASE1-PLAN-01-REV2【9】(f): 生成物の保存/再生成手順。ブラウザにはAudioBufferを
// 直接WAVファイル化するAPIがないため、PCM16のWAVヘッダ+データを手続きで組み立てる
// 小さなエンコーダを自前実装する(新規依存を追加しないため)。純関数(Float32Array
// →Uint8Array)としてNode環境でもバイト単位でテストできる。

const BITS_PER_SAMPLE = 16;

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function floatTo16BitPcm(view: DataView, offset: number, samples: Float32Array): void {
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset + i * 2, Math.round(value), true);
  }
}

// モノラルPCM16のWAVファイルをバイト列として組み立てる純関数。
export function encodeWavMono(samples: Float32Array, sampleRate: number): Uint8Array {
  if (sampleRate <= 0) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}`);
  }
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmtチャンクサイズ
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // モノラル
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // バイトレート
  view.setUint16(32, bytesPerSample, true); // ブロックアライン
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  floatTo16BitPcm(view, 44, samples);

  return new Uint8Array(buffer);
}
