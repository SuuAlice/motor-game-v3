import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MotorConfig, SessionEventType } from '../engine/motorPhysics';
import type { HistorySample } from '../engine/scoring';
import type { CarConfig, EnergyBreakdown, VehicleSimState } from '../engine/vehiclePhysics';

export const NOTEBOOK_LIMIT = 50;

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
  pendingSession: ExperimentSession | null;
  addSession: (session: ExperimentSession) => void;
  confirmEviction: () => void;
  cancelEviction: () => void;
  replaceSessions: (sessions: ExperimentSession[]) => void;
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

export const useNotebookStore = create<NotebookStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      courseRuns: [],
      pendingSession: null,
      addSession: (session) => {
        const { sessions } = get();
        if (sessions.length >= NOTEBOOK_LIMIT) {
          set({ pendingSession: session });
          return;
        }
        set({ sessions: [session, ...sessions] });
      },
      confirmEviction: () => {
        const { sessions, pendingSession } = get();
        if (!pendingSession) return;
        set({ sessions: [pendingSession, ...sessions.slice(0, NOTEBOOK_LIMIT - 1)], pendingSession: null });
      },
      cancelEviction: () => set({ pendingSession: null }),
      replaceSessions: (sessions) => set({ sessions: sessions.slice(0, NOTEBOOK_LIMIT), pendingSession: null }),
      clear: () => set({ sessions: [], courseRuns: [], pendingSession: null }),
      addCourseRun: (record) => set((state) => ({ courseRuns: [record, ...state.courseRuns].slice(0, NOTEBOOK_LIMIT) })),
    }),
    {
      name: 'v15:notebook',
      partialize: (state) => ({ sessions: state.sessions, courseRuns: state.courseRuns }),
    },
  ),
);
