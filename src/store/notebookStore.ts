import { create } from 'zustand';
import type { MotorConfig, SessionEventType } from '../engine/motorPhysics';
import type { HistorySample } from '../engine/scoring';
import type { CarConfig, EnergyBreakdown, VehicleSimState } from '../engine/vehiclePhysics';
import { NOTEBOOK_LIMIT, useSaveStore } from './saveStore';

export { NOTEBOOK_LIMIT };

export interface NotebookSample extends HistorySample {
  theta: number;
  batteryHeat: number;
  chattering: boolean;
  shorted: boolean;
  coilCollapsed: boolean;
}

export interface SessionEvent {
  type: SessionEventType;
  t: number;
}

export interface ExperimentSession {
  id: string;
  startedAt: string;
  endedAt: string;
  config: MotorConfig;
  seed: number;
  steadyRpm: number;
  averageCurrent: number;
  maxCurrent: number;
  currentRatio: number;
  rpmVariation: number;
  maxBatteryHeat: number;
  events: SessionEvent[];
  samples: NotebookSample[];
}

export interface CourseNotebookSample {
  t: number;
  positionM: number;
  velocityMps: number;
  rpm: number;
  currentA: number;
  batteryHeat: number;
  slipRatio: number;
  isSlipping: boolean;
}

export interface CourseRunNotebookRecord {
  id: string;
  savedAt: string;
  trackId: string;
  motorConfig: MotorConfig;
  carConfig: CarConfig;
  seed: number;
  status: VehicleSimState['status'];
  elapsedTimeS: number;
  positionM: number;
  energyUsedJ: number;
  energyBreakdown: EnergyBreakdown;
  samples: CourseNotebookSample[];
}

interface NotebookExport {
  version: 1;
  exportedAt: string;
  sessions: ExperimentSession[];
  courseRuns?: CourseRunNotebookRecord[];
}

interface NotebookStore {
  sessions: ExperimentSession[];
  courseRuns: CourseRunNotebookRecord[];
  addSession: (session: ExperimentSession) => void;
  // 追補3(Suuレビュー2026-08-02T17:00): 書き込み結果を呼び出し元(ExperimentNotebook.tsx)へ
  // 伝える。以前はsaveStore.replaceSessionsRecordの戻り値(lease/pending拒否等)を
  // 握りつぶしており、UI側は常に成功したものとして扱っていた。
  replaceSessions: (sessions: ExperimentSession[]) => { ok: true } | { ok: false; reason: string };
  clear: () => void;
  addCourseRun: (record: CourseRunNotebookRecord) => void;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coefficientOfVariation(values: number[]): number {
  const average = mean(values);
  if (values.length < 2 || Math.abs(average) < 1e-9) return 0;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) / Math.abs(average);
}

function detectEvents(samples: NotebookSample[]): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const previous = samples[index - 1];
    if (current.shorted && !previous?.shorted) events.push({ type: 'shortCircuit', t: current.t });
    if (current.coilCollapsed && !previous?.coilCollapsed) events.push({ type: 'coilCollapse', t: current.t });
    if (current.batteryHeat >= 1 && (previous?.batteryHeat ?? 0) < 1) {
      events.push({ type: 'batteryOverheat', t: current.t });
    }
  }
  return events;
}

export function createExperimentSession(
  config: MotorConfig,
  seed: number,
  samples: NotebookSample[],
  startedAt = new Date(),
  endedAt = new Date(),
): ExperimentSession {
  const currents = samples.map((sample) => sample.current);
  const rpms = samples.map((sample) => Math.abs(sample.rpm));
  const steadySamples = samples.slice(Math.floor(samples.length * 0.75));
  const steadyRpm = mean(steadySamples.map((sample) => Math.abs(sample.rpm)));
  const averageCurrent = mean(currents);
  const maxCurrent = Math.max(0, ...currents);
  const initialCurrent = mean(currents.slice(0, Math.min(10, currents.length)));

  return {
    id: `${startedAt.getTime()}-${seed.toString(16)}`,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    config: { ...config },
    seed,
    steadyRpm,
    averageCurrent,
    maxCurrent,
    currentRatio: initialCurrent > 0 ? averageCurrent / initialCurrent : 0,
    rpmVariation: coefficientOfVariation(rpms),
    maxBatteryHeat: Math.max(0, ...samples.map((sample) => sample.batteryHeat)),
    events: detectEvents(samples),
    samples: samples.map((sample) => ({ ...sample })),
  };
}

function isSession(value: unknown): value is ExperimentSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<ExperimentSession>;
  return typeof session.id === 'string'
    && typeof session.startedAt === 'string'
    && typeof session.seed === 'number'
    && Array.isArray(session.samples)
    && !!session.config;
}

export function parseNotebookJson(json: string): ExperimentSession[] {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') throw new Error('JSONの形式が正しくありません。');
  const notebook = parsed as Partial<NotebookExport>;
  if (notebook.version !== 1) throw new Error('対応していない実験ノートのバージョンです。');
  if (!Array.isArray(notebook.sessions) || !notebook.sessions.every(isSession)) {
    throw new Error('セッションデータが正しくありません。');
  }
  return notebook.sessions.slice(0, NOTEBOOK_LIMIT);
}

export function stringifyNotebook(sessions: ExperimentSession[]): string {
  const value: NotebookExport = { version: 1, exportedAt: new Date().toISOString(), sessions };
  return JSON.stringify(value, null, 2);
}

// P3-0サブステップ3(docs/phase3-p3-0-plan.md v7 8.3節): 永続化はsaveStore.ts(v16:save)
// へ移管した。本storeはsaveStore.notebookスライスへの薄い反応的ビュー+action委譲のみを
// 担う(単一の正はsaveStore側)。上限到達時の確認バナー(pendingSession/confirmEviction/
// cancelEviction)は正式Fable Q3裁定により撤去し、3腕とも自動trimへ統一する
// (src/components/ExperimentNotebook.tsx側のUIも同時に撤去済み)。
export const useNotebookStore = create<NotebookStore>()(() => ({
  sessions: useSaveStore.getState().notebook.sessions,
  courseRuns: useSaveStore.getState().notebook.courseRuns,
  addSession: (session) => {
    useSaveStore.getState().addSessionRecord(session);
  },
  replaceSessions: (sessions) => useSaveStore.getState().replaceSessionsRecord(sessions),
  clear: () => {
    useSaveStore.getState().clearNotebook();
  },
  addCourseRun: (record) => {
    useSaveStore.getState().addCourseRunRecord(record);
  },
}));

useSaveStore.subscribe((state) => {
  useNotebookStore.setState({ sessions: state.notebook.sessions, courseRuns: state.notebook.courseRuns });
});
