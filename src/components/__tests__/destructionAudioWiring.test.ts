// P3-4 G7-D: SE層が実再生へ接続されていることの構造テスト。
// Web Audioを動かせる環境が無いため、実音の確認はG8の実ブラウザ試遊項目とする。
// ここで固定するのは「未使用コードになっていないこと」と「gateの内側であること」。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const audio = readFileSync(new URL('../MotorAudioControl.tsx', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../DestructionHud.tsx', import.meta.url), 'utf8');
// 禁止文言の検査では、規律を説明しているコメント自体を実装と数えないよう除去する。
const hudCode = hud.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const testRun = readFileSync(new URL('../../modes/TestRunMode.tsx', import.meta.url), 'utf8');
const course = readFileSync(new URL('../../modes/CourseMode.tsx', import.meta.url), 'utf8');
const lab = readFileSync(new URL('../../modes/LabMode.tsx', import.meta.url), 'utf8');

describe('SEの実再生接続', () => {
  it('schedulerが実際に呼ばれ、状態がフレーム間で持ち越される(テスト専用にしない)', () => {
    expect(audio).toContain('advanceDestructionSeScheduler(');
    expect(audio).toContain('schedulerState = result.next');
    expect(audio).toContain('smokingOnsetOneShots(');
    expect(audio).toContain('extraOneShotSes:');
  });

  it('handle同期は純関数へ委ね、起こす/追従/止めるを画面側で組み直さない', () => {
    expect(audio).toContain('syncSeVoiceHandles(nodes.seVoices, result.voices,');
  });

  it('ADSRとmix gainは別のAudioParamへ分かれている(同一paramへ混載しない)', () => {
    // envelopeGainは0..1の包絡を開始時に一度だけ予約する。正規化倍率の変化で
    // 再予約しない形になっていること。
    expect(audio).toContain('envelopeGain.gain.linearRampToValueAtTime(1,');
    expect(audio).toContain('envelopeGain.gain.linearRampToValueAtTime(spec.sustainLevel,');
    expect(audio).not.toMatch(/linearRampToValueAtTime\(gain[ ,]/);
    expect(audio).not.toMatch(/linearRampToValueAtTime\(gain \*/);
  });

  it('鳴っているvoiceの実効gainはmixGainだけへ毎フレーム追従する', () => {
    expect(audio).toContain('handle.mixGain.gain.setTargetAtTime(voice.gain * modulation');
    // envelopeGainへ毎フレーム書き込む経路が無いこと。
    expect(audio).not.toMatch(/envelopeGain\.gain\.setTargetAtTime/);
  });

  it('source→envelopeGain→mixGain→seBusの順に繋がっている', () => {
    expect(audio).toContain('envelopeGain.connect(mixGain)');
    expect(audio).toContain('mixGain.connect(nodes.seBus)');
    expect(audio).toContain('source.connect(envelopeGain)');
  });

  it('音声OFF/unmountで実handleを止めてmapを空にする(rAF停止だけにしない)', () => {
    expect(audio).toContain('cancelAnimationFrame(frame)');
    expect(audio).toContain('stopSeVoice(handle)');
    expect(audio).toContain('nodes.seVoices.delete(key)');
  });

  it('結果から消えたvoiceは実handleごと停止する(stop予約任せにしない)', () => {
    expect(audio).toContain('stop: (handle) => stopSeVoice(handle)');
    expect(audio).toContain('handle.source.disconnect()');
    expect(audio).toContain('handle.mixGain.disconnect()');
  });

  it('handleのキーはvoice keyであり、idではない(D05同時3本の取り違え防止)', () => {
    expect(audio).toContain('seVoices: Map<number, SeVoiceHandle>');
    expect(audio).not.toMatch(/Map<DestructionSeId/);
  });

  it('D09の2音切替が実際に周波数へ反映されている(R20、API拡張なし)', () => {
    expect(audio).toContain('computeD09OnsetToneHz(t)');
    expect(audio).toContain('osc.frequency.setValueAtTime(');
  });

  it('run境界の検知はscheduler側にあり、再生側で独自判定しない', () => {
    expect(audio).toContain('replaySnapshot: accumulator.replaySnapshot');
    expect(audio).not.toMatch(/lastRun|prevSnapshot|runChanged/);
  });

  it('波形・ADSRはSE表から引く(再生側で数値を直書きしない)', () => {
    expect(audio).toContain('findDestructionSeSpec(id)');
    expect(audio).toMatch(/spec\.attackSec/);
    expect(audio).toMatch(/spec\.durationSec/);
  });

  it('D01の決定論的gain変調が実際に適用されている(C-1)', () => {
    expect(audio).toContain('computeD01GainModulation(');
  });

  it('SEは単一のSEバスへ合流する(voiceごとにmasterへ直結しない)', () => {
    expect(audio).toContain('mixGain.connect(nodes.seBus)');
    // voiceがmasterやdestinationへ直結していないこと。
    expect(audio).not.toMatch(/mixGain\.connect\(nodes\.master\)/);
  });
});

describe('HUDの実画面接続', () => {
  it('HUDは走行画面すべてにマウントされている', () => {
    expect(testRun).toContain('<DestructionHud />');
    expect(course).toContain('<DestructionHud />');
    // G8: 実験室は2ペインあり、それぞれの走行文脈に1回ずつ置く。
    expect((lab.match(/<DestructionHud \/>/g) ?? []).length).toBe(2);
  });

  it('run未開始のときは描画しない(accumulatorがnullの間は何も出さない)', () => {
    expect(hud).toContain('if (accumulator === null) return null;');
  });

  it('HUDは純関数の導出結果を使い、症状判定を画面側で再実装しない', () => {
    expect(hud).toContain('deriveDestructionHudState(accumulator.destructionState)');
    expect(hudCode).not.toMatch(/modes\.D0\d/);
  });

  it('HUDは原因を断定しない(三段開示、spec §7.3)', () => {
    expect(hudCode).not.toMatch(/磁石が弱|ベアリングが|交換してください|原因は/);
  });

  it('色だけに依存しない(非機能要件): アイコンに文言を併記する', () => {
    expect(hud).toContain('性能が落ちています');
    expect(hud).toContain('煙が出ています');
    expect(hud).toContain('aria-hidden="true"');
  });
});

describe('パーティクルの実画面接続(§8.2のparticle層)', () => {
  const effects = readFileSync(new URL('../../render/RaceEffects.tsx', import.meta.url), 'utf8');
  const raceCanvas = readFileSync(new URL('../../render/RaceCanvas.tsx', import.meta.url), 'utf8');
  const courseCanvas = readFileSync(new URL('../../render/CourseRaceCanvas.tsx', import.meta.url), 'utf8');
  const effectsCode = effects.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('既存のRaceEffectsを描画枠として使い、新しい描画器を作っていない', () => {
    expect(raceCanvas).toContain('<RaceEffects');
    expect(courseCanvas).toContain('<RaceEffects');
  });

  it('パーティクル表と写像層を実際に消費している(dead tableにしない)', () => {
    expect(effectsCode).toContain('toPresentationTrigger(event).particles');
    expect(effectsCode).toContain('deriveDestructionHudState(accumulator.destructionState).activeLoops');
    expect(effectsCode).toContain('spawnParticles(');
    expect(effectsCode).toContain('stepParticles(');
  });

  it('run未開始のときは破壊パーティクルを出さない', () => {
    expect(effectsCode).toContain('const accumulator = state._runAccumulator;');
    expect(effectsCode).toContain('if (accumulator === null) {');
  });

  it('描画はパーティクル層のdrawParticlesへ委ね、画面側で色や形を書かない', () => {
    expect(effectsCode).toContain('drawParticles(context,');
    expect(effectsCode).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(effectsCode).not.toContain('fillRect');
  });

  it('描画先は単一の低解像度overlay Canvas(DOM要素を毎フレーム作り直さない)', () => {
    expect(effectsCode).toContain('<canvas');
    expect(effectsCode).toContain('PARTICLE_FIELD_WIDTH');
    // 粒子ごとのDOM要素を並べる方式に戻っていないこと。
    expect(effectsCode).not.toMatch(/particles\.(slice|map)\(/);
  });

  it('時間は走行時刻由来の60fps tickで進む(rAF回数依存にしない)', () => {
    // motor-onlyは_elapsedSec、車体走行はvehicle elapsed。vehicleだけを見ると
    // 実験室の浮かせ走行で時計が0のまま固まり、発煙粒子が進まない。
    expect(effectsCode).toContain('presentationElapsedSeconds({');
    expect(effectsCode).toContain('motorElapsedS: state._elapsedSec');
    expect(effectsCode).toContain('vehicleElapsedS: state.vehicleState.elapsedTimeS');
    expect(effectsCode).toContain('ticksToAdvance(field.lastTick, currentTick)');
    expect(effectsCode).toContain("'D02_smoke'");
  });

  it('run終了・run切替・非active・unmountでfieldとcursorを消す', () => {
    expect(effectsCode).toContain('const clearField = ()');
    expect(effectsCode).toContain('fieldRef.current = EMPTY_FIELD');
    expect(effectsCode).toContain('if (!active) {');
    expect(effectsCode).toContain('cancelAnimationFrame(frame);');
  });

  it('D06の素材色は正典入力(run開始時装備snapshot)から解決する', () => {
    expect(effectsCode).toContain('resolveGearMaterialColorKey(saveState.pendingRunEquipmentSnapshot, saveState.inventory)');
    // 生きたequipmentLoadoutを直接読んでいないこと(走行中の装備変更で色が変わらない)。
    expect(effectsCode).not.toMatch(/equipmentLoadout/);
    // 解決した色はspawnへ渡して焼き付ける。
    expect(effectsCode).toContain('BURST_ORIGIN[burstId], gearColorKey)');
  });

  it('legacy overlayを抑止しても破壊パーティクルは残る(G8、案C)', () => {
    // 抑止対象は既存3種のlegacy overlayだけであることをソースで確認する。
    expect(effectsCode).toMatch(/legacyOverlays && vehicle\.isSlipping/);
    expect(effectsCode).toMatch(/legacyOverlays && heat >= 0\.45/);
    expect(effectsCode).toMatch(/legacyOverlays && vehicle\.status === 'derailed'/);
    // 破壊パーティクルの描画経路(canvasとdrawParticles)はlegacyOverlaysで条件付けられていない。
    expect(effectsCode).not.toMatch(/legacyOverlays &&[^\n]*canvas/);
    expect(effectsCode).not.toMatch(/legacyOverlays[^\n]*drawParticles/);
    // 既定はtrueで、既存の走行画面(RaceCanvas/CourseRaceCanvas)は従来どおり出す。
    expect(effectsCode).toContain('legacyOverlays = true');
    const raceCanvas = readFileSync(new URL('../../render/RaceCanvas.tsx', import.meta.url), 'utf8');
    expect(raceCanvas).not.toContain('legacyOverlays');
    // 実験室のmotor-only側はRaceEffectsを単体で置く(RaceCanvasはstepTestRunを回すため
    // 持ち込まない=二重step防止)。grounded側はRaceCanvas内に既にあるので1件だけ。
    const labCode = lab.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(labCode).toContain('<RaceEffects vehicle={vehicle} active={true} legacyOverlays={false} />');
    expect((labCode.match(/<RaceEffects/g) ?? []).length).toBe(1);
    expect(labCode).not.toMatch(/<RaceCanvas[^>]*\/>\s*<RaceEffects/);
  });

  it('D07/D09専用パーティクルを追加していない(R18)', () => {
    expect(effectsCode).not.toMatch(/D07_|D09_/);
  });

  it('継続系は現象が止まったら残りを落とす(走行後まで残さない)', () => {
    expect(effectsCode).toContain('clearBurst(');
  });

  it('既存のスリップ煙・熱ムラ・コースアウト表示は残っている(既存演出を壊さない)', () => {
    expect(effects).toContain('slip-smoke');
    expect(effects).toContain('コースアウト');
  });
});
