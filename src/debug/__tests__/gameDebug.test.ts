import { describe, expect, it } from 'vitest';
import {
  buildGameDebugSnapshot,
  normalizeDebugLabel,
  type BuildGameDebugInput,
  type DebugStoreSlice,
} from '../gameDebug';

function slice(partial: Partial<DebugStoreSlice> = {}): DebugStoreSlice {
  return {
    mode: 'title',
    testRunPhase: 'ready',
    courseRunPhase: 'ready',
    courseRunSpeed: 0,
    selectedTrackId: 'straight-10m',
    testRunCompleted: false,
    courseProgress: {},
    vehicleState: {
      status: 'ready',
      positionM: 0,
      velocityMps: 0,
      isSlipping: false,
      motor: { rpm: 0, current: 0, batteryHeat: 0 },
    },
    simState: { rpm: 0, current: 0 },
    ...partial,
  };
}

function build(partial: Partial<BuildGameDebugInput> = {}) {
  return buildGameDebugSnapshot({
    store: slice(),
    overlay: 'none',
    lastClick: null,
    buttons: ['ガレージで車を組む', '標準車体でテスト走行'],
    disabledButtons: [],
    surfaces: {
      htmlButtons: true,
      canvas2d: false,
      svg: false,
      webgl: false,
      unity: false,
    },
    ...partial,
  });
}

describe('gameDebugスナップショット', () => {
  it('タイトルは種類Cのハイブリッドとして出し、WebGLとUnityは否定する', () => {
    const snapshot = build();
    expect(snapshot.kind).toBe('motor-game-v3-debug');
    expect(snapshot.uiKind).toBe('C-hybrid');
    expect(snapshot.scene).toBe('title');
    expect(snapshot.surfaces.webgl).toBe(false);
    expect(snapshot.surfaces.unity).toBe(false);
    expect(snapshot.buttons).toContain('標準車体でテスト走行');
  });

  it('オーバーレイがあるときはsceneを用語集/実験ノートにする', () => {
    expect(build({ overlay: 'glossary' }).scene).toBe('glossary');
    expect(build({ overlay: 'notebook' }).scene).toBe('notebook');
  });

  it('テスト走行完了でコース解放フラグが立つ', () => {
    const locked = build();
    expect(locked.coursesUnlocked).toBe(false);
    const unlocked = build({ store: slice({ testRunCompleted: true }) });
    expect(unlocked.coursesUnlocked).toBe(true);
  });

  it('前回クリックをそのまま残す', () => {
    const lastClick = {
      kind: 'button' as const,
      name: '手で押してスタート',
      x: 120,
      y: 240,
      atMs: 1,
    };
    expect(build({ lastClick }).lastClick).toEqual(lastClick);
  });

  it('診断の原因や正解キーを持たない', () => {
    const snapshot = build({
      store: slice({ mode: 'diagnosis' }),
      buttons: ['手で押して診断走行'],
    });
    const keys = Object.keys(snapshot);
    expect(keys).not.toContain('diagnosisAnswer');
    expect(keys).not.toContain('repairableMotorParams');
    expect(keys).not.toContain('lockedKeys');
    expect(JSON.stringify(snapshot)).not.toMatch(/原因|正解|減磁|短絡の答え/u);
  });

  it('ボタン名の空白を畳み、長すぎる名前は切る', () => {
    expect(normalizeDebugLabel('  手で押して\nスタート  ')).toBe('手で押して スタート');
    expect(normalizeDebugLabel('あ'.repeat(120)).length).toBe(80);
  });
});
