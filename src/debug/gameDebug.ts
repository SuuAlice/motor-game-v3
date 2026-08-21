import { useGameStore } from '../store/gameStore';
import type { CourseRunSpeed, TestRunPhase } from '../store/gameStore';

export type GameScene =
  | 'title'
  | 'garage'
  | 'testRun'
  | 'course'
  | 'lab'
  | 'diagnosis'
  | 'assembly'
  | 'glossary'
  | 'notebook';

export type DebugOverlay = 'none' | 'glossary' | 'notebook';

export type DebugClickKind = 'button' | 'canvas' | 'other';

export interface DebugClick {
  kind: DebugClickKind;
  name: string | null;
  x: number;
  y: number;
  canvasX?: number;
  canvasY?: number;
  atMs: number;
}

export interface DebugSurfaces {
  htmlButtons: boolean;
  canvas2d: boolean;
  svg: boolean;
  webgl: false;
  unity: false;
}

export interface DebugStoreSlice {
  mode: Exclude<GameScene, 'glossary' | 'notebook'>;
  testRunPhase: TestRunPhase;
  courseRunPhase: TestRunPhase;
  courseRunSpeed: CourseRunSpeed;
  selectedTrackId: string;
  testRunCompleted: boolean;
  courseProgress: Record<string, unknown>;
  vehicleState: {
    status: string;
    positionM: number;
    velocityMps: number;
    isSlipping: boolean;
    motor: { rpm: number; current: number; batteryHeat: number };
  };
  simState: { rpm: number; current: number };
}

export interface GameDebugSnapshot {
  kind: 'motor-game-v3-debug';
  uiKind: 'C-hybrid';
  scene: GameScene;
  overlay: DebugOverlay;
  buttons: string[];
  disabledButtons: string[];
  lastClick: DebugClick | null;
  surfaces: DebugSurfaces;
  selectedTrackId: string;
  testRunPhase: TestRunPhase;
  courseRunPhase: TestRunPhase;
  courseRunSpeed: CourseRunSpeed;
  coursesUnlocked: boolean;
  vehicle: {
    status: string;
    positionM: number;
    velocityMps: number;
    rpm: number;
    currentA: number;
    batteryHeat: number;
    isSlipping: boolean;
  };
  motor: {
    rpm: number;
    currentA: number;
  };
}

export interface BuildGameDebugInput {
  store: DebugStoreSlice;
  overlay: DebugOverlay;
  lastClick: DebugClick | null;
  buttons: string[];
  disabledButtons: string[];
  surfaces: DebugSurfaces;
}

const BUTTON_NAME_MAX = 80;

let attached = false;
let overlay: DebugOverlay = 'none';
let lastClick: DebugClick | null = null;

export function normalizeDebugLabel(text: string): string {
  return text.replace(/\s+/gu, ' ').trim().slice(0, BUTTON_NAME_MAX);
}

export function buildGameDebugSnapshot(input: BuildGameDebugInput): GameDebugSnapshot {
  const { store } = input;
  const scene: GameScene = input.overlay === 'none' ? store.mode : input.overlay;
  const coursesUnlocked = store.testRunCompleted || Object.keys(store.courseProgress).length > 0;
  return {
    kind: 'motor-game-v3-debug',
    uiKind: 'C-hybrid',
    scene,
    overlay: input.overlay,
    buttons: input.buttons,
    disabledButtons: input.disabledButtons,
    lastClick: input.lastClick,
    surfaces: input.surfaces,
    selectedTrackId: store.selectedTrackId,
    testRunPhase: store.testRunPhase,
    courseRunPhase: store.courseRunPhase,
    courseRunSpeed: store.courseRunSpeed,
    coursesUnlocked,
    vehicle: {
      status: store.vehicleState.status,
      positionM: store.vehicleState.positionM,
      velocityMps: store.vehicleState.velocityMps,
      rpm: store.vehicleState.motor.rpm,
      currentA: store.vehicleState.motor.current,
      batteryHeat: store.vehicleState.motor.batteryHeat,
      isSlipping: store.vehicleState.isSlipping,
    },
    motor: {
      rpm: store.simState.rpm,
      currentA: store.simState.current,
    },
  };
}

export function setDebugOverlay(next: DebugOverlay): void {
  overlay = next;
}

export function readGameDebug(): GameDebugSnapshot | null {
  if (typeof window === 'undefined') return null;
  return window.__DEBUG__ ?? null;
}

export function attachGameDebug(): void {
  if (attached || typeof window === 'undefined') return;
  attached = true;

  document.addEventListener('click', (event) => {
    lastClick = describeClick(event);
  }, true);

  Object.defineProperty(window, '__DEBUG__', {
    configurable: true,
    enumerable: true,
    get(): GameDebugSnapshot {
      const listed = listVisibleButtons();
      return buildGameDebugSnapshot({
        store: useGameStore.getState(),
        overlay,
        lastClick,
        buttons: listed.buttons,
        disabledButtons: listed.disabledButtons,
        surfaces: detectSurfaces(),
      });
    },
  });
}

function detectSurfaces(): DebugSurfaces {
  return {
    htmlButtons: document.querySelector('button, [role="button"]') !== null,
    canvas2d: document.querySelector('canvas') !== null,
    svg: document.querySelector('svg') !== null,
    webgl: false,
    unity: false,
  };
}

function listVisibleButtons(): { buttons: string[]; disabledButtons: string[] } {
  const buttons: string[] = [];
  const disabledButtons: string[] = [];
  const seen = new Set<string>();
  for (const element of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    if (!isDisplayed(element)) continue;
    const name = accessibleName(element);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (isDisabled(element)) disabledButtons.push(name);
    else buttons.push(name);
  }
  return { buttons, disabledButtons };
}

function accessibleName(element: HTMLElement): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const fromIds = labelledBy
      .split(/\s+/u)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    const normalized = normalizeDebugLabel(fromIds);
    if (normalized) return normalized;
  }
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return normalizeDebugLabel(ariaLabel);
  return normalizeDebugLabel(element.innerText || element.textContent || '');
}

function isDisplayed(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isDisabled(element: HTMLElement): boolean {
  return (element instanceof HTMLButtonElement && element.disabled)
    || element.getAttribute('aria-disabled') === 'true';
}

function describeClick(event: MouseEvent): DebugClick {
  const target = event.target;
  if (!(target instanceof Element)) {
    return { kind: 'other', name: null, x: event.clientX, y: event.clientY, atMs: Date.now() };
  }
  const canvas = target.closest('canvas');
  if (canvas instanceof HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      kind: 'canvas',
      name: canvas.getAttribute('aria-label') ?? 'canvas',
      x: event.clientX,
      y: event.clientY,
      canvasX: event.clientX - rect.left,
      canvasY: event.clientY - rect.top,
      atMs: Date.now(),
    };
  }
  const button = target.closest<HTMLElement>('button, [role="button"]');
  if (button) {
    return {
      kind: 'button',
      name: accessibleName(button),
      x: event.clientX,
      y: event.clientY,
      atMs: Date.now(),
    };
  }
  return {
    kind: 'other',
    name: normalizeDebugLabel(target.textContent ?? '') || target.tagName.toLowerCase(),
    x: event.clientX,
    y: event.clientY,
    atMs: Date.now(),
  };
}

declare global {
  interface Window {
    __DEBUG__?: GameDebugSnapshot;
  }
}
