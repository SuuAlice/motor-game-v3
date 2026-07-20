import { describe, expect, it } from 'vitest';
import { encodeWavMono } from '../wavEncoder';

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

describe('encodeWavMono', () => {
  it('RIFF/WAVE/fmt /dataの各チャンク識別子が正しい位置に書き込まれる(既知値)', () => {
    const bytes = encodeWavMono(new Float32Array([0, 0.5, -0.5, 1, -1]), 44100);
    expect(readAscii(bytes, 0, 4)).toBe('RIFF');
    expect(readAscii(bytes, 8, 4)).toBe('WAVE');
    expect(readAscii(bytes, 12, 4)).toBe('fmt ');
    expect(readAscii(bytes, 36, 4)).toBe('data');
  });

  it('ファイルサイズはヘッダ44byte+サンプル数*2byte(PCM16)になる(既知値)', () => {
    const samples = new Float32Array(100);
    const bytes = encodeWavMono(samples, 44100);
    expect(bytes.length).toBe(44 + 100 * 2);
  });

  it('sampleRateがヘッダへ正しく書き込まれる(リトルエンディアン、既知値)', () => {
    const bytes = encodeWavMono(new Float32Array([0]), 22050);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(24, true)).toBe(22050);
  });

  it('モノラル・PCM16・16bitの固定フォーマットフィールドが書き込まれる', () => {
    const bytes = encodeWavMono(new Float32Array([0]), 44100);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // モノラル
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it('1.0は32767(0x7fff)、-1.0は-32768(0x8000)へ量子化される(既知値)', () => {
    const bytes = encodeWavMono(new Float32Array([1, -1]), 44100);
    const view = new DataView(bytes.buffer);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('範囲外(-1..1超)の値はクランプされる', () => {
    const bytes = encodeWavMono(new Float32Array([2, -2]), 44100);
    const view = new DataView(bytes.buffer);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('sampleRateが0以下は拒否する', () => {
    expect(() => encodeWavMono(new Float32Array([0]), 0)).toThrow();
  });
});
