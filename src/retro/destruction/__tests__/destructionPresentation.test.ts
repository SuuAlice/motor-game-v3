// P3-4 G7-D(UI計画§8.1〜§8.3、art-spec §5.2・§6): 演出/HUD写像層。
// art-spec §6の既存表を写しただけであることと、三段開示の規律(症状は出すが原因は出さない)、
// D07/D09の免除がここでの取りこぼしではないことを固定する。
import { describe, expect, it } from 'vitest';
import { createInitialDestructionState, type DestructionState, type UnstampedDestructionEvent } from '../../../engine/destructionModes';
import { PALETTE } from '../../palette';
import { DESTRUCTION_SE_SPECS, D09_ONSET_TWO_TONE_HZ } from '../../audio/destructionSe';
import { SE_MASTER_GAIN } from '../../audio/mixLevels';
import {
  PARTICLE_BURST_SPECS, findParticleBurstSpec, toPresentationTrigger,
  deriveDestructionHudState, PERFORMANCE_DROP_ICON, D07_D09_PARTICLE_EXEMPTION_REASON,
  advanceDestructionSeScheduler, computeD09OnsetToneHz, smokingOnsetOneShots, EMPTY_SE_SCHEDULER_STATE,
  type DestructionSeSchedulerState,
} from '../destructionPresentation';

const causeLog = { t: 1, batteryVoltageV: 3, currentA: 1 } as never;

function event(mode: string, over: Record<string, unknown> = {}): UnstampedDestructionEvent {
  return { mode, causeLog, isFirstThisSession: true, ...over } as never;
}

describe('パーティクル表(art-spec §6の写し)', () => {
  it('色はすべて実在するパレットキーである(存在しない色名を書かない)', () => {
    for (const spec of PARTICLE_BURST_SPECS) {
      if (spec.colors === 'materialColor') continue;
      for (const key of spec.colors) expect(PALETTE).toHaveProperty(key);
    }
  });

  it('寿命は下限<=上限で、継続系だけがnull(art-spec §6の「破壊中持続」「燃焼中持続」)', () => {
    for (const spec of PARTICLE_BURST_SPECS) {
      if (spec.lifetimeFrames === null) continue;
      expect(spec.lifetimeFrames[0]).toBeLessThanOrEqual(spec.lifetimeFrames[1]);
      expect(spec.lifetimeFrames[0]).toBeGreaterThan(0);
    }
    expect(findParticleBurstSpec('D01_wireLash').lifetimeFrames).toBeNull();
    expect(findParticleBurstSpec('D02_D04_flame').lifetimeFrames).toBeNull();
  });

  it('D02の煙は白→灰→黒の順で、D09の白煙とは衝突させない(却下理由の明記)', () => {
    expect(findParticleBurstSpec('D02_smoke').colors).toEqual(['N5', 'N3', 'N1']);
    expect(PARTICLE_BURST_SPECS.some((s) => s.id.startsWith('D09'))).toBe(false);
    expect(D07_D09_PARTICLE_EXEMPTION_REASON).toContain('D02発煙');
  });

  it('D06の破片は素材色を引き継ぐ(固定色を与えない)', () => {
    expect(findParticleBurstSpec('D06_debris').colors).toBe('materialColor');
  });
});

describe('イベント→演出/SEの写像(有限switch)', () => {
  it('D0xの各モードが期待どおりの演出とSEを出す', () => {
    expect(toPresentationTrigger(event('D02'))).toEqual({ particles: ['D02_smoke'], ses: ['D02_smoke'] });
    expect(toPresentationTrigger(event('D05', { isFirstThisSession: false })))
      .toEqual({ particles: ['D05_spark'], ses: ['D05_spark'] });
    expect(toPresentationTrigger(event('D06', { isFirstThisSession: false, isTotalLoss: false })))
      .toEqual({ particles: ['D06_debris'], ses: ['D06_toothChip'] });
  });

  it('D03電池破裂はSEのみ(専用パーティクルはart-spec §6に無い)', () => {
    const trigger = toPresentationTrigger(event('D03'));
    expect(trigger.particles).toEqual([]);
    expect(trigger.ses).toEqual(['D03_batteryBurst']);
  });

  it('D07は演出もSEも出さない——RPM連動モーター音との二重表現を避けるため(R19)', () => {
    expect(toPresentationTrigger(event('D07', { irreversibleDemagnetizationFraction: 0.1 })))
      .toEqual({ particles: [], ses: [] });
  });

  it('参照するSE idはすべてSE表に実在する(綴り違いで無音にならない)', () => {
    const known = new Set(DESTRUCTION_SE_SPECS.map((s) => s.id));
    for (const mode of ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D09']) {
      const extra = mode === 'D04' ? { affectedRoles: [], bodyScorchDeltaFraction: 0, magnetScorchDeltaFraction: 0 }
        : mode === 'D06' ? { isTotalLoss: false }
        : mode === 'D07' ? { irreversibleDemagnetizationFraction: 0.1 } : {};
      for (const id of toPresentationTrigger(event(mode, extra)).ses) expect(known.has(id)).toBe(true);
    }
  });

  it('参照するパーティクルidもすべて表に実在する', () => {
    const known = new Set(PARTICLE_BURST_SPECS.map((s) => s.id));
    for (const mode of ['D01', 'D02', 'D05']) {
      for (const id of toPresentationTrigger(event(mode)).particles) expect(known.has(id)).toBe(true);
    }
  });
});

describe('HUD(art-spec §5.2、spec §7.3の三段開示)', () => {
  function stateWith(mutate: (s: DestructionState) => void): DestructionState {
    const state = createInitialDestructionState('nonLipo');
    mutate(state);
    return state;
  }

  it('初期状態では性能低下アイコンも継続演出も出ない', () => {
    const hud = deriveDestructionHudState(createInitialDestructionState('nonLipo'));
    expect(hud).toEqual({ showPerformanceDropIcon: false, activeLoops: [], activeLoopSes: [] });
  });

  it('D07の可逆ダレだけでも性能低下アイコンを出す(体感できる低下を取りこぼさない)', () => {
    const hud = deriveDestructionHudState(stateWith((s) => { s.modes.D07.reversibleDroopActive = true; }));
    expect(hud.showPerformanceDropIcon).toBe(true);
  });

  it('D07不可逆・D09いずれでも同じアイコンを出す——どちらが起きたかを画面が教えない', () => {
    const d07 = deriveDestructionHudState(stateWith((s) => { s.modes.D07.irreversibleTriggered = true; }));
    const d09 = deriveDestructionHudState(stateWith((s) => { s.modes.D09.triggered = true; }));
    expect(d07.showPerformanceDropIcon).toBe(true);
    expect(d09.showPerformanceDropIcon).toBe(true);
    // 症状は同じ表示、原因の手がかりはHUDに出さない(spec §7.3)。
    expect(d07.activeLoops).toEqual(d09.activeLoops);
  });

  it('D01崩壊中は専用SEと折れ線演出が継続する', () => {
    const hud = deriveDestructionHudState(stateWith((s) => { s.modes.D01.triggered = true; }));
    expect(hud.activeLoops).toContain('D01_wireLash');
    expect(hud.activeLoopSes).toContain('D01_wireLash');
  });

  it('D09の継続音は鳴るが、専用パーティクルは出ない(R18)', () => {
    const hud = deriveDestructionHudState(stateWith((s) => { s.modes.D09.triggered = true; }));
    expect(hud.activeLoopSes).toContain('D09_seizureLoop');
    expect(hud.activeLoops).toEqual([]);
  });

  it('D02発煙latch中は煙の継続演出だけ出し、継続SEは足さない(発煙SEはoneShot)', () => {
    const hud = deriveDestructionHudState(stateWith((s) => {
      s.modes.D02.smokingStarted = true;
      s.modes.D02.smokingStartedAtT = 1;
    }));
    expect(hud.activeLoops).toContain('D02_smoke');
    expect(hud.activeLoopSes).not.toContain('D02_smoke');
    expect(smokingOnsetOneShots(false, true)).toEqual(['D02_smoke']);
    expect(smokingOnsetOneShots(true, true)).toEqual([]);
  });

  it('炎の継続演出はD04燃焼中のみ(nonLipoでは出ない)', () => {
    const lipo = createInitialDestructionState('lipo');
    expect(deriveDestructionHudState(lipo).activeLoops).not.toContain('D02_D04_flame');
    if (lipo.battery.profile === 'lipo') lipo.battery.d04.stage = 'burning';
    expect(deriveDestructionHudState(lipo).activeLoops).toContain('D02_D04_flame');
  });

  it('性能低下アイコンはart-spec §5.2の既定(Y1・4フレーム周期)に一致する', () => {
    expect(PERFORMANCE_DROP_ICON.paletteKey).toBe('Y1');
    expect(PERFORMANCE_DROP_ICON.blinkPeriodFrames).toBe(4);
  });
});

describe('SE scheduler(§8.3): 複数フレーム・run切替・D06 burst・D09 2音', () => {
  const SNAPSHOT_A = { run: 'A' };
  const SNAPSHOT_B = { run: 'B' };

  function input(events: readonly { mode: string }[], snapshot: object = SNAPSHOT_A, mutate: (s: DestructionState) => void = () => {}) {
    const destructionState = createInitialDestructionState('nonLipo');
    mutate(destructionState);
    return { events, destructionState, replaySnapshot: snapshot };
  }

  /** 便宜: 複数フレームを順に進める。 */
  function run(frames: readonly { input: ReturnType<typeof input> | null; at: number }[]) {
    let state: DestructionSeSchedulerState = EMPTY_SE_SCHEDULER_STATE;
    const perFrame = frames.map((frame) => {
      const result = advanceDestructionSeScheduler(state, frame.input, frame.at);
      state = result.next;
      return result;
    });
    return { state, perFrame };
  }

  it('発煙latchのextraOneShotはengine eventなしでもD02発煙SEを1回出す', () => {
    const result = advanceDestructionSeScheduler(
      EMPTY_SE_SCHEDULER_STATE,
      { ...input([], SNAPSHOT_A), extraOneShotSes: ['D02_smoke'] },
      0,
    );
    expect(result.voices.map((v) => v.id)).toEqual(['D02_smoke']);
    expect(result.voices[0].isNew).toBe(true);
  });

  it('run未開始では何も鳴らず、状態も空のまま', () => {
    const result = advanceDestructionSeScheduler(EMPTY_SE_SCHEDULER_STATE, null, 0);
    expect(result.voices).toEqual([]);
    expect(result.next).toEqual(EMPTY_SE_SCHEDULER_STATE);
  });

  it('有限尺SEは発音フレームだけisNewで、鳴っている間は継続voiceとして残る', () => {
    const events = [{ mode: 'D05' }];
    const { perFrame } = run([
      { input: input(events), at: 0 },
      { input: input(events), at: 0.05 },
      { input: input(events), at: 0.2 }, // durationSec 0.15を過ぎている
    ]);
    expect(perFrame[0].voices).toEqual([{ key: expect.any(Number), id: 'D05_spark', gain: expect.any(Number), isNew: true }]);
    expect(perFrame[1].voices[0].isNew).toBe(false);
    expect(perFrame[2].voices).toEqual([]);
  });

  it('前フレームから鳴っているoneShotも正規化の分母に入る(予算超過を防ぐ)', () => {
    const { perFrame } = run([
      { input: input([{ mode: 'D03' }]), at: 0 },
      // D03がまだ鳴っている最中にD05が3件発火する。
      { input: input([{ mode: 'D03' }, { mode: 'D05' }, { mode: 'D05' }, { mode: 'D05' }]), at: 0.05 },
    ]);
    const second = perFrame[1];
    expect(second.voices.length).toBeGreaterThan(3); // D03継続分を含む
    const total = second.voices.reduce((sum, v) => sum + v.gain, 0);
    expect(total).toBeLessThanOrEqual(SE_MASTER_GAIN + 1e-12);
    // 継続中のD03も毎フレームgainが返る(鳴りっぱなしで正規化から漏れない)。
    expect(second.voices.find((v) => v.id === 'D03_batteryBurst')).toBeDefined();
  });

  it('maxConcurrentを実行時に執行する(D05は同時3まで)', () => {
    const events = Array.from({ length: 6 }, () => ({ mode: 'D05' }));
    const { perFrame } = run([{ input: input(events), at: 0 }]);
    expect(perFrame[0].voices.filter((v) => v.id === 'D05_spark')).toHaveLength(3);
  });

  it('D06 burstは同時1本で、深さ3を超えた分はcoalesceされる', () => {
    const events = Array.from({ length: 7 }, () => ({ mode: 'D06' }));
    const { state, perFrame } = run([{ input: input(events), at: 0 }]);
    // 同時に鳴るのは1本だけ。
    expect(perFrame[0].voices.filter((v) => v.id === 'D06_toothChip')).toHaveLength(1);
    // 7件のうち上限3件が待機し、残り4件はcoalesceされる(破棄ではない)。
    expect(state.d06Queue.queuedCount).toBe(3);
    expect(state.d06Queue.coalescedCount).toBe(4);
  });

  it('D06は1本鳴り終わるごとに次の1本が出る(同時多重にならない)', () => {
    const events = [{ mode: 'D06' }, { mode: 'D06' }];
    const { perFrame } = run([
      { input: input(events), at: 0 },
      { input: input(events), at: 0.2 },  // durationSec 0.5未満: まだ1本目
      { input: input(events), at: 0.6 },  // 1本目終了 → 2本目
    ]);
    expect(perFrame[1].voices.filter((v) => v.id === 'D06_toothChip')).toHaveLength(1);
    expect(perFrame[1].voices[0].isNew).toBe(false);
    const third = perFrame[2].voices.filter((v) => v.id === 'D06_toothChip');
    expect(third).toHaveLength(1);
    expect(third[0].isNew).toBe(true);
  });

  it('run終了(accumulator=null)で残留再生が消える', () => {
    const { state } = run([
      { input: input([{ mode: 'D06' }, { mode: 'D06' }, { mode: 'D06' }, { mode: 'D06' }]), at: 0 },
      { input: null, at: 0.1 },
    ]);
    expect(state).toEqual(EMPTY_SE_SCHEDULER_STATE);
  });

  it('run切替でcursor・queue・鳴っている音がresetされる(新runの序盤を取りこぼさない)', () => {
    const longRun = Array.from({ length: 5 }, () => ({ mode: 'D05' }));
    let state: DestructionSeSchedulerState = EMPTY_SE_SCHEDULER_STATE;
    state = advanceDestructionSeScheduler(state, input(longRun, SNAPSHOT_A), 0).next;
    expect(state.processedEventCount).toBe(5);

    // 新runはイベント1件から始まる。cursorが5のままなら、この1件を取りこぼす。
    const result = advanceDestructionSeScheduler(state, input([{ mode: 'D02' }], SNAPSHOT_B), 1);

    expect(result.voices.map((v) => v.id)).toEqual(['D02_smoke']);
    expect(result.voices[0].isNew).toBe(true);
    expect(result.next.processedEventCount).toBe(1);
    expect(result.next.d06Queue).toEqual({ queuedCount: 0, coalescedCount: 0 });
  });

  it('同一runの間はsnapshotが同じ実体なのでresetされない', () => {
    const events = [{ mode: 'D05' }];
    const { state } = run([
      { input: input(events, SNAPSHOT_A), at: 0 },
      { input: input([...events, { mode: 'D02' }], SNAPSHOT_A), at: 0.01 },
    ]);
    expect(state.processedEventCount).toBe(2);
  });

  it('継続音はrunをまたいでも二重に積まれない', () => {
    const withD01 = (snapshot: object) => input([], snapshot, (s) => { s.modes.D01.triggered = true; });
    const { state } = run([
      { input: withD01(SNAPSHOT_A), at: 0 },
      { input: withD01(SNAPSHOT_A), at: 0.1 },
      { input: withD01(SNAPSHOT_B), at: 0.2 },
    ]);
    expect(state.active.filter((v) => v.id === 'D01_wireLash')).toHaveLength(1);
  });

  it('duck対象は下がるが無音にはならない(全mute禁止)', () => {
    const { perFrame } = run([
      { input: input([{ mode: 'D03' }], SNAPSHOT_A, (s) => { s.modes.D01.triggered = true; }), at: 0 },
    ]);
    const d01 = perFrame[0].voices.find((v) => v.id === 'D01_wireLash');
    const d03 = perFrame[0].voices.find((v) => v.id === 'D03_batteryBurst');
    expect(d01!.gain).toBeGreaterThan(0);
    expect(d01!.gain).toBeLessThan(d03!.gain);
  });

  it('D07イベントはSEを増やさない(R19の免除がschedulerでも効く)', () => {
    const { perFrame } = run([{ input: input([{ mode: 'D07' }]), at: 0 }]);
    expect(perFrame[0].voices).toEqual([]);
  });
});

describe('D09焼付きの2音切替(R20)', () => {
  it('経過時間に応じて2音が交互に切り替わる', () => {
    const sequence = [0, 0.05, 0.1, 0.15, 0.2].map(computeD09OnsetToneHz);
    expect(sequence).toEqual([
      D09_ONSET_TWO_TONE_HZ[0], D09_ONSET_TWO_TONE_HZ[1],
      D09_ONSET_TWO_TONE_HZ[0], D09_ONSET_TWO_TONE_HZ[1], D09_ONSET_TWO_TONE_HZ[0],
    ]);
  });

  it('切替周期の内側では同じ音のまま(毎フレーム切り替わらない)', () => {
    expect(computeD09OnsetToneHz(0.01)).toBe(computeD09OnsetToneHz(0.04));
  });

  it('負や非有限の経過秒数でも定義された音を返す(NaN周波数を作らない)', () => {
    expect(computeD09OnsetToneHz(-1)).toBe(D09_ONSET_TWO_TONE_HZ[0]);
    expect(computeD09OnsetToneHz(Number.NaN)).toBe(D09_ONSET_TWO_TONE_HZ[0]);
  });
});

describe('voiceキー(実handleの取り違え防止)', () => {
  const SNAPSHOT_A = { run: 'A' };
  const SNAPSHOT_B = { run: 'B' };
  function input(events: readonly { mode: string }[], snapshot: object) {
    return { events, destructionState: createInitialDestructionState('nonLipo'), replaySnapshot: snapshot };
  }

  it('同時に鳴る同一idのvoiceは別々のキーを持つ(D05の3本)', () => {
    const events = [{ mode: 'D05' }, { mode: 'D05' }, { mode: 'D05' }];
    const result = advanceDestructionSeScheduler(EMPTY_SE_SCHEDULER_STATE, input(events, SNAPSHOT_A), 0);
    const keys = result.voices.map((v) => v.key);
    expect(new Set(keys).size).toBe(3);
  });

  it('run切替後のキーは前runと重複しない(古いhandleを新しい音と取り違えない)', () => {
    const first = advanceDestructionSeScheduler(EMPTY_SE_SCHEDULER_STATE, input([{ mode: 'D05' }], SNAPSHOT_A), 0);
    const second = advanceDestructionSeScheduler(first.next, input([{ mode: 'D02' }], SNAPSHOT_B), 1);
    const firstKeys = new Set(first.voices.map((v) => v.key));
    for (const voice of second.voices) expect(firstKeys.has(voice.key)).toBe(false);
  });
});
