// P3-4 G3: ギヤ慣性J(docs/phase3-p3-4-plan.md §10.3・§10.4)

import { describe, expect, it } from 'vitest';
import {
  GEAR_ASSUMED_RADIUS_M,
  GEAR_ASSUMED_THICKNESS_M,
  resolveGearActualInertiaKgM2,
  resolveGearReflectedInertiaKgM2,
  resolveGearReflectedInertiaKgM2ById,
  resolveAnchorGearMaterial,
  resolveGearMassDeltaGById,
} from '../gearInertia';
import { GEAR_MATERIALS } from '../materials';

function gear(id: string) {
  const m = GEAR_MATERIALS.find((g) => g.id === id);
  if (!m) throw new Error(`テスト前提が崩れています: ${id}が見つかりません`);
  return m;
}

describe('gearInertia.ts: pending密度の明示的失敗(§10.4、assumedGeometry.tsと同型の規律)', () => {
  it('密度がverifiedのgear-peekのみJを計算できる', () => {
    const r = resolveGearActualInertiaKgM2(gear('gear-peek'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('到達しない');
    // J = 0.5 * (density * π r² t) * r²
    const volume = Math.PI * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_THICKNESS_M;
    const expected = 0.5 * (1300 * volume) * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M;
    expect(r.value).toBeCloseTo(expected, 20);
    expect(r.value).toBeGreaterThan(0);
    expect(Number.isFinite(r.value)).toBe(true);
  });

  // Suu_mot3 G3追補P2: 全4素材がJ解決ok:trueとなる(初期装備gear-pomを含む)。
  it('全4ギヤ素材がJを解決できる(接続見送りは残さない)', () => {
    const results = GEAR_MATERIALS.map((g) => [g.id, resolveGearActualInertiaKgM2(g)] as const);
    for (const [id, r] of results) {
      expect(r.ok, `${id}が解決できること`).toBe(true);
    }
    expect(results).toHaveLength(4);
  });

  it('designAssumptionを持たない未知素材は明示的にok:falseを返す(黙って代用しない規律の維持)', () => {
    const fake = { ...gear('gear-peek'), id: 'gear-unknown', density: { verifiedForPhysics: false, status: 'pending', reason: 'テスト用' } } as unknown as Parameters<typeof resolveGearActualInertiaKgM2>[0];
    const r = resolveGearActualInertiaKgM2(fake);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('到達しない');
    expect(r.reason).toContain('未検証');
  });
});

// R14(c)一次資料検証(2026-08-18): Suu_mot3が独立検索でTIMET公式技術資料を発見し、alice_mot3が
// PDF本文の該当文を直接確認したため、titaniumはmaterials.ts側でverifiedへ昇格した。
// POM/PA6は本ラウンドでは一次資料の直接確認が取れず、写像層のdesignAssumptionで接続している。
describe('gearInertia.ts: 密度の出所と接続状態(§10.4 R14)', () => {
  it('gear-titaniumはverified由来で解決される(TIMET公式でR14(c)閉鎖済み、provenance=catalogVerified)', () => {
    const r = resolveGearActualInertiaKgM2(gear('gear-titanium'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('到達しない');
    expect(r.provenance).toBe('catalogVerified');
    expect(gear('gear-titanium').density.verifiedForPhysics).toBe(true);
  });

  it.each([['gear-peek'], ['gear-pom']])('%sもverified由来である(Victrex公式 / Celanese公式)', (id) => {
    const r = resolveGearActualInertiaKgM2(gear(id));
    if (!r.ok) throw new Error('到達しない');
    expect(r.provenance).toBe('catalogVerified');
  });

  it.each([['gear-nylon-pa6']])(
    '%sは写像層のdesignAssumptionで解決される(materials.ts側はpendingのまま=カタログを汚さない)',
    (id) => {
      const r = resolveGearActualInertiaKgM2(gear(id));
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error('到達しない');
      expect(r.provenance).toBe('designAssumption'); // 誤認防止
      const density = gear(id).density;
      expect(density.verifiedForPhysics).toBe(false);
      if (density.verifiedForPhysics) throw new Error('到達しない');
      expect(density.status).toBe('pending');
      expect('value' in density).toBe(false); // PendingNumericValueは意図的にvalueを持たない
    },
  );

  it('Jの大小関係が密度順(Ti > POM > PEEK > PA6)と一致する(素材差がJへ反映されている)', () => {
    const j = (id: string) => {
      const r = resolveGearActualInertiaKgM2(gear(id));
      if (!r.ok) throw new Error(`${id}が解決できません`);
      return r.value;
    };
    expect(j('gear-titanium')).toBeGreaterThan(j('gear-pom'));
    expect(j('gear-pom')).toBeGreaterThan(j('gear-peek'));
    expect(j('gear-peek')).toBeGreaterThan(j('gear-nylon-pa6'));
  });

  it('titaniumのJはPEEKより大きく、比は密度比(4430/1300)と厳密一致する(spec §4.2がJへ実反映)', () => {
    const ti = resolveGearActualInertiaKgM2(gear('gear-titanium'));
    const peek = resolveGearActualInertiaKgM2(gear('gear-peek'));
    if (!ti.ok || !peek.ok) throw new Error('到達しない');
    expect(ti.value).toBeGreaterThan(peek.value);
    expect(ti.value / peek.value).toBeCloseTo(4430 / 1300, 10);
  });

  it.each([
    ['gear-titanium', 4430, 'TIMET'],
    ['gear-pom', 1410, 'Celanese'],
    ['gear-peek', 1300, 'Victrex'],
  ])('単位換算の固定: %sは g/cm³ → kg/m³(×1000)で %s として取り込まれている', (id, expected, publisher) => {
    const density = gear(id).density;
    if (!density.verifiedForPhysics) throw new Error('到達しない');
    expect(density.value).toBe(expected);
    expect(density.origin).toBe('manufacturerDatasheet');
    expect(density.citation.publisher).toContain(publisher as string);
  });

  it('素材名の表示は一般名のまま(登録商標をゲーム内表記に使わない、仕様書§15)', () => {
    expect(gear('gear-titanium').nameJa).toBe('チタン');
    expect(gear('gear-pom').nameJa).not.toContain('ジュラコン');
  });

  it('決定論・純粋性: 同一入力で同一結果を返す(verified/designAssumptionの双方)', () => {
    for (const id of ['gear-titanium', 'gear-pom']) {
      expect(resolveGearReflectedInertiaKgM2(gear(id), 4)).toEqual(resolveGearReflectedInertiaKgM2(gear(id), 4));
    }
  });
});

describe('gearInertia.ts: actual→reflected変換(§10.3、R13確定裁定)', () => {
  it('J_reflected = J_actual / gearRatio² である', () => {
    const actual = resolveGearActualInertiaKgM2(gear('gear-peek'));
    if (!actual.ok) throw new Error('到達しない');
    for (const gearRatio of [1, 2, 4, 8, 12]) {
      const reflected = resolveGearReflectedInertiaKgM2(gear('gear-peek'), gearRatio);
      if (!reflected.ok) throw new Error('到達しない');
      expect(reflected.value).toBeCloseTo(actual.value / (gearRatio * gearRatio), 20);
    }
  });

  it('etaを一切参照しない(R13): gearEfficiencyに相当する引数を持たず、gearRatioのみで決まる', () => {
    // 契約の構造的固定——関数はGearMaterialとgearRatioの2引数しか受け取らない。
    expect(resolveGearReflectedInertiaKgM2.length).toBe(2);
  });

  it('gearRatioが非有限・非正のときはok:falseで拒否する', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const r = resolveGearReflectedInertiaKgM2(gear('gear-peek'), bad);
      expect(r.ok).toBe(false);
    }
  });

  it('全4素材がreflected側でも解決でき、provenanceが正しく伝播する', () => {
    for (const g of GEAR_MATERIALS) {
      const r = resolveGearReflectedInertiaKgM2(g, 4);
      expect(r.ok, `${g.id}`).toBe(true);
      if (!r.ok) throw new Error('到達しない');
      expect(r.provenance).toBe(g.density.verifiedForPhysics ? 'catalogVerified' : 'designAssumption');
    }
  });

  it('ID経由の解決も同一結果を返し、未登録IDはok:falseになる', () => {
    const byId = resolveGearReflectedInertiaKgM2ById('gear-peek', 4);
    const byMaterial = resolveGearReflectedInertiaKgM2(gear('gear-peek'), 4);
    expect(byId).toEqual(byMaterial);
    // @ts-expect-error 未登録IDの実行時挙動を固定する
    expect(resolveGearReflectedInertiaKgM2ById('gear-unknown', 4).ok).toBe(false);
  });

  it('決定論・純粋性: 同一入力で常に同一結果を返す', () => {
    const a = resolveGearReflectedInertiaKgM2(gear('gear-peek'), 4);
    const b = resolveGearReflectedInertiaKgM2(gear('gear-peek'), 4);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// P3-4 G3 G-R1: ギヤ実質量のanchor差分(人間再承認済み2026-08-19)
// ---------------------------------------------------------------------------

describe('gearInertia.ts: G-R1 ギヤ実質量のanchor差分', () => {
  /** DoD-C8-b: 期待値はハードコードせず、密度差 × π r² t × 1000 の式から算出する。 */
  const VOLUME_M3 = Math.PI * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_THICKNESS_M;
  const ANCHOR_DENSITY = 1410; // POM(Celanese公式verified)
  const expectedDeltaG = (density: number) => (density - ANCHOR_DENSITY) * VOLUME_M3 * 1000;

  it('anchorはIDのハードコードではなくisBaselineAnchorから解決される', () => {
    const r = resolveAnchorGearMaterial();
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('到達しない');
    expect(r.material.isBaselineAnchor).toBe(true);
    expect(r.material.id).toBe('gear-pom'); // 現行のanchor実体(materials.tsの宣言に従う)
  });

  it('anchor(POM)装備時は差分0でmassG不変(V2回帰の厳密保持)', () => {
    const r = resolveGearMassDeltaGById('gear-pom');
    if (!r.ok) throw new Error('到達しない');
    expect(r.value).toBe(0);
  });

  it.each([
    ['gear-titanium', 4430],
    ['gear-nylon-pa6', 1130],
    ['gear-peek', 1300],
  ])('%sの質量差分が 密度差×πr²t×1000 の式と厳密一致する(DoD-C8-b)', (id, density) => {
    const r = resolveGearMassDeltaGById(id as 'gear-titanium');
    if (!r.ok) throw new Error('到達しない');
    expect(r.value).toBeCloseTo(expectedDeltaG(density as number), 12);
  });

  it('承認された独立検算値と一致する(Ti +1.821621084 / PA6 -0.168892021 / PEEK -0.066350437 g)', () => {
    const delta = (id: string) => {
      const r = resolveGearMassDeltaGById(id as 'gear-titanium');
      if (!r.ok) throw new Error(`${id}が解決できません`);
      return r.value;
    };
    expect(delta('gear-titanium')).toBeCloseTo(1.821621084, 9);
    expect(delta('gear-nylon-pa6')).toBeCloseTo(-0.168892021, 9);
    expect(delta('gear-peek')).toBeCloseTo(-0.066350437, 9);
    expect(delta('gear-pom')).toBe(0);
  });

  // **経路横断の不変式(DoD-C8-a)**: J値とmass差分値を直接結びつける。
  //   J_actual = 0.5 × (ρ × V) × r²、mass_delta[g] = (ρ − ρ_anchor) × V × 1000
  // より、両者の比は密度だけで決まる:
  //   (J(X) − J(anchor)) / mass_delta(X) = 0.5 × r² / 1000   ……(★)
  // この式は**J経路とmass経路が同一のVを使っている場合にのみ成立する**——片方のvolumeが
  // 変われば左辺だけが変わり右辺と一致しなくなるため、経路間のずれを実際に検出できる。
  // (旧テストはJ比とmass差分比をそれぞれ密度比と比較していたが、比を取る過程でvolumeが
  //  分母分子で相殺されるため、経路ごとに異なるvolumeを使っても常に緑になる無効な検査だった。)
  it('J経路と質量経路が同一の幾何定数を共有する(単一出典、DoD-C8-a、経路横断の不変式)', () => {
    const anchor = resolveGearActualInertiaKgM2(gear('gear-pom'));
    if (!anchor.ok) throw new Error('到達しない');
    const expectedRatio = 0.5 * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M / 1000; // (★)右辺
    for (const id of ['gear-titanium', 'gear-peek', 'gear-nylon-pa6']) {
      const j = resolveGearActualInertiaKgM2(gear(id));
      const massDelta = resolveGearMassDeltaGById(id as 'gear-titanium');
      if (!j.ok || !massDelta.ok) throw new Error(`${id}が解決できません`);
      // 空虚な一致の防止: 分母が0でない(anchorとの差が実在する)ことを先に確認する
      expect(Math.abs(massDelta.value), `${id}: anchorとの質量差が非0であること`).toBeGreaterThan(1e-9);
      const crossRatio = (j.value - anchor.value) / massDelta.value;
      expect(crossRatio, `${id}: (ΔJ)/(Δmass) が 0.5r²/1000 と一致すること`).toBeCloseTo(expectedRatio, 18);
    }
  });

  it('未登録IDはok:falseを返す', () => {
    // @ts-expect-error 実行時挙動の固定
    expect(resolveGearMassDeltaGById('gear-unknown').ok).toBe(false);
  });

  it('決定論・純粋性: 同一入力で同一結果を返す', () => {
    expect(resolveGearMassDeltaGById('gear-titanium')).toEqual(resolveGearMassDeltaGById('gear-titanium'));
  });
});
