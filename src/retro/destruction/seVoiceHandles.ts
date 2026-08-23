// P3-4 G7-D: SE voiceの実handle同期。AudioNodeそのものは触らず、
// 「起こす・gainを追従させる・止めて捨てる」の3操作へ抽象化して純関数に閉じる
// ——Web Audioを動かせない環境でも、鳴り続け/取り違え/止め忘れを挙動で固定するため。
import type { ScheduledSeVoice } from './destructionPresentation';

/** 再生側が渡す3操作。実装はAudioNodeでもテスト用の記録器でもよい。 */
export interface SeVoiceOps<H> {
  /** voiceを1本起こしてhandleを返す。 */
  readonly start: (voice: ScheduledSeVoice) => H;
  /** 既に鳴っているvoiceの実効gainを追従させる。 */
  readonly updateGain: (handle: H, voice: ScheduledSeVoice) => void;
  /** voiceを止めて切り離す。自然終了・run終了・run切替のいずれでも呼ぶ。 */
  readonly stop: (handle: H, voice: { readonly key: number }) => void;
}

/**
 * schedulerの結果へ実handle集合を合わせる。
 *
 * - 新しく現れたvoiceは起こす
 * - 鳴り続けているvoiceはgainを追従させる(後発voiceで正規化結果が変わるため)
 * - 結果から消えたvoiceは止めて捨てる(scheduler stateを空にするだけでは音は止まらない)
 *
 * **キーはvoice key**であってidではない——D05は同時3本鳴るため、idで引くと
 * handleを取り違えて片方が止まらなくなる。
 */
export function syncSeVoiceHandles<H>(
  handles: Map<number, H>,
  voices: readonly ScheduledSeVoice[],
  ops: SeVoiceOps<H>,
): void {
  const liveKeys = new Set(voices.map((v) => v.key));

  for (const voice of voices) {
    const existing = handles.get(voice.key);
    if (existing === undefined) handles.set(voice.key, ops.start(voice));
    else ops.updateGain(existing, voice);
  }

  for (const [key, handle] of [...handles]) {
    if (liveKeys.has(key)) continue;
    ops.stop(handle, { key });
    handles.delete(key);
  }
}
