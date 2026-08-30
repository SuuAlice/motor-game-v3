// P4-1B B4(2026-08-30人間承認): 未測定と実測fits=falseの区別を回帰固定する。
//
// 直したのは「ResizeObserverの初回発火まで containerSize が {0,0} のままで、
// computeIntegerScale が fits=false を返し、**測る前に「収まりません」と表示されていた**」欠陥。
// production必須画面では初回表示・メニュー往復・再入場のたびに再発しうるものだった。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeIntegerScale } from '../../retro/canvas/integerScale';
import { resolveRetroFrameDisplay } from '../useRetroCanvasFrame';

const CONTENT_W = 480;
const CONTENT_H = 270;

describe('resolveRetroFrameDisplay', () => {
  it('未測定のときは収まる/収まらないを問わず measuring', () => {
    expect(resolveRetroFrameDisplay(false, false)).toBe('measuring');
    expect(resolveRetroFrameDisplay(false, true)).toBe('measuring');
  });

  it('測定済みで収まれば ready、収まらなければ tooSmall', () => {
    expect(resolveRetroFrameDisplay(true, true)).toBe('ready');
    expect(resolveRetroFrameDisplay(true, false)).toBe('tooSmall');
  });

  it('初回表示(containerSize={0,0}・未測定)で tooSmall にならない', () => {
    // 欠陥の再現条件そのもの。fits は false だが、まだ測っていない。
    const initial = computeIntegerScale(0, 0, CONTENT_W, CONTENT_H);
    expect(initial.fits).toBe(false);
    expect(resolveRetroFrameDisplay(false, initial.fits)).toBe('measuring');
  });

  it('メニュー往復・再入場(remountで未測定へ戻る)でも tooSmall にならない', () => {
    // remount直後は measured=false から始まる。observerが発火するまでは measuring。
    let measured = false;
    let size = { w: 0, h: 0 };
    const display = () => resolveRetroFrameDisplay(measured, computeIntegerScale(size.w, size.h, CONTENT_W, CONTENT_H).fits);
    expect(display()).toBe('measuring');
    // observer発火(十分な広さ)。
    measured = true;
    size = { w: 960, h: 540 };
    expect(display()).toBe('ready');
    // 退出→再入場でcomponentが作り直される。
    measured = false;
    size = { w: 0, h: 0 };
    expect(display()).toBe('measuring');
    measured = true;
    size = { w: 960, h: 540 };
    expect(display()).toBe('ready');
  });

  it('本当に狭い画面は測定後に tooSmall になる(警告を消してしまわない)', () => {
    const tiny = computeIntegerScale(320, 180, CONTENT_W, CONTENT_H);
    expect(tiny.fits).toBe(false);
    expect(resolveRetroFrameDisplay(true, tiny.fits)).toBe('tooSmall');
  });
});

describe('hookの拡大規則は不変', () => {
  const hook = readFileSync(new URL('../useRetroCanvasFrame.ts', import.meta.url), 'utf8');

  it('内部解像度・orientation・整数拡大の3点を変えていない', () => {
    expect(hook).toContain('const LANDSCAPE_CONTENT: ContentResolution = { w: 480, h: 270 }');
    expect(hook).toContain('selectOrientedResolution(containerSize.w, containerSize.h, LANDSCAPE_CONTENT)');
    expect(hook).toContain('computeIntegerScale(containerSize.w, containerSize.h, contentRes.w, contentRes.h)');
  });

  it('measuredはobserverのcallback内でのみ立てる(render中に立てない)', () => {
    const observerBody = hook.slice(hook.indexOf('new ResizeObserver'), hook.indexOf('observer.observe'));
    expect(observerBody).toContain('setMeasured(true)');
    // hook全体でsetMeasuredを呼ぶのはその1箇所だけ。
    expect(hook.match(/setMeasured\(/g)).toHaveLength(1);
  });
});
