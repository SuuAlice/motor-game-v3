// P3-4 G7-D: 実handle同期の挙動テスト。schedulerのstateが空になることではなく、
// **実際に止める操作が呼ばれること**を固定する(state空=停止ではない)。
import { describe, expect, it } from 'vitest';
import { advanceDestructionSeScheduler, EMPTY_SE_SCHEDULER_STATE, type ScheduledSeVoice } from '../destructionPresentation';
import { createInitialDestructionState } from '../../../engine/destructionModes';
import { syncSeVoiceHandles, type SeVoiceOps } from '../seVoiceHandles';

interface FakeHandle { readonly key: number; readonly id: string }

function recorder() {
  const started: ScheduledSeVoice[] = [];
  const updated: { key: number; gain: number }[] = [];
  const stopped: number[] = [];
  const ops: SeVoiceOps<FakeHandle> = {
    start: (voice) => { started.push(voice); return { key: voice.key, id: voice.id }; },
    updateGain: (handle, voice) => { updated.push({ key: handle.key, gain: voice.gain }); },
    stop: (_handle, voice) => { stopped.push(voice.key); },
  };
  return { ops, started, updated, stopped };
}

function voice(key: number, id: string, gain = 0.05, isNew = true): ScheduledSeVoice {
  return { key, id, gain, isNew } as ScheduledSeVoice;
}

describe('handle同期', () => {
  it('新しいvoiceだけを起こす(既に鳴っているものを鳴らし直さない)', () => {
    const { ops, started } = recorder();
    const handles = new Map<number, FakeHandle>();

    syncSeVoiceHandles(handles, [voice(0, 'D05_spark')], ops);
    syncSeVoiceHandles(handles, [voice(0, 'D05_spark'), voice(1, 'D05_spark')], ops);

    expect(started.map((v) => v.key)).toEqual([0, 1]);
  });

  it('鳴り続けているvoiceはgainが追従する(後発voiceで正規化結果が変わるため)', () => {
    const { ops, updated } = recorder();
    const handles = new Map<number, FakeHandle>();
    syncSeVoiceHandles(handles, [voice(0, 'D05_spark', 0.1)], ops);

    syncSeVoiceHandles(handles, [voice(0, 'D05_spark', 0.03, false), voice(1, 'D06_toothChip')], ops);

    expect(updated).toEqual([{ key: 0, gain: 0.03 }]);
  });

  it('結果から消えたvoiceは実際にstopされ、handleが捨てられる', () => {
    const { ops, stopped } = recorder();
    const handles = new Map<number, FakeHandle>();
    syncSeVoiceHandles(handles, [voice(0, 'D05_spark'), voice(1, 'D02_smoke')], ops);

    syncSeVoiceHandles(handles, [voice(1, 'D02_smoke', 0.05, false)], ops);

    expect(stopped).toEqual([0]);
    expect([...handles.keys()]).toEqual([1]);
  });

  it('同じidの3本を取り違えず、片方だけを止められる(idを鍵にしない)', () => {
    const { ops, stopped } = recorder();
    const handles = new Map<number, FakeHandle>();
    syncSeVoiceHandles(handles, [voice(0, 'D05_spark'), voice(1, 'D05_spark'), voice(2, 'D05_spark')], ops);

    syncSeVoiceHandles(handles, [voice(0, 'D05_spark', 0.05, false), voice(2, 'D05_spark', 0.05, false)], ops);

    expect(stopped).toEqual([1]);
    expect([...handles.keys()]).toEqual([0, 2]);
  });

  it('voicesが空になれば全handleが止まる(run終了で鳴り残さない)', () => {
    const { ops, stopped } = recorder();
    const handles = new Map<number, FakeHandle>();
    syncSeVoiceHandles(handles, [voice(0, 'D01_wireLash'), voice(1, 'D05_spark')], ops);

    syncSeVoiceHandles(handles, [], ops);

    expect(stopped.sort()).toEqual([0, 1]);
    expect(handles.size).toBe(0);
  });
});

describe('scheduler + handle同期の結合(run終了・run切替で実際に止まる)', () => {
  const SNAPSHOT_A = { run: 'A' };
  const SNAPSHOT_B = { run: 'B' };

  function input(events: readonly { mode: string }[], snapshot: object) {
    return { events, destructionState: createInitialDestructionState('nonLipo'), replaySnapshot: snapshot };
  }

  it('run終了で、鳴っていたvoiceがstopされる', () => {
    const { ops, stopped } = recorder();
    const handles = new Map<number, FakeHandle>();
    let state = EMPTY_SE_SCHEDULER_STATE;

    let result = advanceDestructionSeScheduler(state, input([{ mode: 'D05' }, { mode: 'D02' }], SNAPSHOT_A), 0);
    state = result.next;
    syncSeVoiceHandles(handles, result.voices, ops);
    expect(handles.size).toBe(2);

    result = advanceDestructionSeScheduler(state, null, 0.01);
    syncSeVoiceHandles(handles, result.voices, ops);

    expect(stopped).toHaveLength(2);
    expect(handles.size).toBe(0);
  });

  it('run切替で前runのvoiceが残らない(新runのvoiceだけになる)', () => {
    const { ops, stopped, started } = recorder();
    const handles = new Map<number, FakeHandle>();
    let state = EMPTY_SE_SCHEDULER_STATE;

    let result = advanceDestructionSeScheduler(state, input([{ mode: 'D05' }], SNAPSHOT_A), 0);
    state = result.next;
    syncSeVoiceHandles(handles, result.voices, ops);
    const firstRunKeys = [...handles.keys()];

    result = advanceDestructionSeScheduler(state, input([{ mode: 'D02' }], SNAPSHOT_B), 0.01);
    syncSeVoiceHandles(handles, result.voices, ops);

    expect(stopped).toEqual(firstRunKeys);
    expect(started[started.length - 1].id).toBe('D02_smoke');
    expect(handles.size).toBe(1);
  });

  it('自然終了した有限尺voiceもstopされる(stop予約任せにしない)', () => {
    const { ops, stopped } = recorder();
    const handles = new Map<number, FakeHandle>();
    let state = EMPTY_SE_SCHEDULER_STATE;
    const events = [{ mode: 'D05' }];

    let result = advanceDestructionSeScheduler(state, input(events, SNAPSHOT_A), 0);
    state = result.next;
    syncSeVoiceHandles(handles, result.voices, ops);

    // D05のdurationSecは0.15。0.2秒時点では鳴り終わっている。
    result = advanceDestructionSeScheduler(state, input(events, SNAPSHOT_A), 0.2);
    syncSeVoiceHandles(handles, result.voices, ops);

    expect(stopped).toHaveLength(1);
    expect(handles.size).toBe(0);
  });
});
