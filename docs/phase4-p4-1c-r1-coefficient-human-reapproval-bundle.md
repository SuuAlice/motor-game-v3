# P4-1C P41C-R1 production係数・限定再基準化 人間再承認バンドル

作成日: 2026-08-31（JST）  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **2026-08-31 人間再承認済み。許可5ファイルの実装・検証のみ進行中**

## 0. 今回の承認対象

P41C-R1のread-only有限sweep 4112組合せは完了した。全候補・全点が完走し、意図しない`coilCollapse` / `shorted`は0件だった。本書では次の有限deltaだけを承認対象とする。

1. C1のproduction係数を`minPackingRatio=0.85`、`referenceTension=1.0`に確定する。
2. `windingTurnsRatio`を方向一貫性と張力充填率の積へ限定拡張する。
3. 行単位の依存閉包再走査で確定した3ファイル8アサーションだけを再基準化する。
4. 専用単体テストを追加し、全回帰と禁止差分を照合して停止する。

R2-A以降は本承認に含めない。

## 1. exact production係数と式

```ts
export const PRODUCTION_TENSION_PACKING = {
  minPackingRatio: 0.85,
  referenceTension: 1.0,
} as const;
```

```text
meanTension = record全turnのtension算術平均
tensionPackingRatio
  = 0.85 + (1 - 0.85) × min(1, meanTension / 1.0)
windingTurnsRatio
  = directionConsistencyRatio × tensionPackingRatio
```

必須境界:

- `meanTension`と係数入力は有限値として検証する。
- `minPackingRatio > 0`、`referenceTension > 0`を維持する。
- `tensionPackingRatio`と最終積は常に`(0,1]`へ収める。
- 張力0でも完成可能な正値`0.85`を返し、緩い巻線を方向の完全打ち消しと誤分類しない。
- 集計値をsaveへ保存せず、`WindingRecord`を単一出典として毎回導出する。

## 2. sweep根拠

採用候補`0.85 / 1.0`の257点結果:

| 項目 | 結果 |
|---|---|
| ratio域 | `0.850000..1.000000` |
| finish域 | `20.0500..28.8250 s` |
| 全幅 | `8.7750 s` |
| 30秒超 / 20秒未満 | `0 / 0` |
| 飽和 | `1/257`（平均張力1.0の1点だけ） |
| 完走 | `257/257` |

`minPackingRatio=0.83`は低張力側10点が30秒を超えるため不採用。`referenceTension=0.25/0.50/0.75`はそれぞれ75.1% / 50.2% / 25.3%が早期飽和するため不採用。`0.87/1.0`と`0.89/1.0`は成立するが全幅が6.6167秒 / 4.8583秒と小さいため次点以下とする。

1/256刻みのfinish time単調性は保証しない。受容するのは低張力端から高張力端へ向かう大域傾向であり、RNG・物理・UIは変更しない。

## 3. 遡及効果と不変条件

- `RotorWindingState.recorded`はratioを保存せずrecordから導出するため、production反映後は既存saveのrecordedローターにも遡及適用される。
- `tensionPackingRatio <= 1`なので、低張力の既存個体は従来より弱くなる。強くなる既存個体はない。
- `winding.kind === 'legacy'`はrecordを持たず本導出を通らないため不変。
- canonical E2 encoding、MC4 payload、recipeKey v2（28エントリ）、save schema、`coilTurns`は不変。
- `src/materials/windingRecord.ts`のP4-0 aggregateと`src/p40/sessionRunner.ts`、P4-0 scenario aggregate 13 assertは不変。
- 張力ムラ、位置、実軌跡長、素材差を新しい入力軸にしない。

## 4. 訂正履歴: 2ファイル6assertから3ファイル8assertへ

初回閉包は`rotorAssembly.test.ts` 4件 + `saveStore.test.ts` 2件の「2ファイル6assert」と報告され、arbiter追補もその前提で受理した。その後、Suuの受入レビューでexact新値の欠落を検出し、aliceが行単位検索を再実行した結果、次の2件が漏れていた。

- `rotorAssembly.test.ts:200`の全正転record期待値`1`。
- `recipeCode.test.ts:784`のMC4 decode後の導出期待値`22/30`。

正しい限定再基準化閉包は**3ファイル8assert**である。本書は過去の承認記録を黙って書き換えず、この訂正とexact値を人間へ再承認依頼する。C1の承認済み意味境界・式・production実装点は変わらず、arbiter判定で定めた「想定外のB-required実装波及」には該当しないため、arbiter再提出ではなく人間再承認で処理する。

全対象recordの平均張力は`0.5`であり、共通因子は`0.925`である。

| # | 対象 | 現行 | 承認を求めるexact新値 |
|---:|---|---|---|
| 1 | `src/store/__tests__/rotorAssembly.test.ts:194` | `28 / 30` | `(28 / 30) * 0.925` |
| 2 | `src/store/__tests__/rotorAssembly.test.ts:200` | `1` | `0.925` |
| 3 | `src/store/__tests__/rotorAssembly.test.ts:276` | `28 / 30` | `(28 / 30) * 0.925` |
| 4 | `src/store/__tests__/rotorAssembly.test.ts:300` | `28 / 30` | `(28 / 30) * 0.925` |
| 5 | `src/store/__tests__/rotorAssembly.test.ts:345` | `1 / 11` | `(1 / 11) * 0.925` |
| 6 | `src/store/__tests__/saveStore.test.ts:2137` | `28 / 30` | `(28 / 30) * 0.925` |
| 7 | `src/store/__tests__/saveStore.test.ts:2144` | `28 / 30` | `(28 / 30) * 0.925` |
| 8 | `src/engine/__tests__/recipeCode.test.ts:784` | `22 / 30` | `(22 / 30) * 0.925` |

式を期待値として保持し、不要な丸め値を正典化しない。#2は`toBeCloseTo(0.925, 12)`を許容する。

## 5. 許可するファイル閉包

変更を次の5ファイルに限定する。

1. `src/materials/windingMapping.ts`: 型、純関数、production係数、`deriveWindingMotorFields`での積の実装。
2. `src/materials/__tests__/windingMapping.test.ts`: 新規の境界・数値単体テスト。
3. `src/store/__tests__/rotorAssembly.test.ts`: §4の5assertだけ。
4. `src/store/__tests__/saveStore.test.ts`: §4の2assertだけ。
5. `src/engine/__tests__/recipeCode.test.ts`: §4の1assertだけ。

次は変更しない。

- `src/materials/windingRecord.ts`
- `src/store/rotorAssembly.ts`
- `src/store/saveStore.ts`
- `src/engine/recipeCode.ts`
- `src/p40/sessionRunner.ts`
- `src/engine/__tests__/windingTurnsRatioContract.test.ts`
- `src/materials/__tests__/recipeKey.test.ts`

6ファイル目が必要、8assert以外の既存期待値変更が必要、またはP4-0 scenario aggregateが動く場合は推測せず停止する。

## 6. 必須検証と停止点

実装後に次を実施する。

1. `windingMapping.test.ts`の境界・有限値・単調なpacking ratio・積`(0,1]`。
2. 3ファイル8assertのexact式照合。
3. `src/p40/__tests__/scenario.test.ts`の13 assert無変更確認。
4. canonical E2、MC4、recipeKey v2、save round-trip、legacy不変の既存回帰。
5. `npm run test`、`npm run build`、`npm run lint`。
6. `npm run typecheck:phase4-sweep`を含むPhase 4型検査。
7. 許可5ファイル以外の差分0、production係数以外の挙動変更0を監査。

結果とdiffを提示して停止する。P41C-R2-Aへ自動で進まない。

## 7. 禁止事項

- P41C-R2-A、P41C-R2-SWEEP、P41C-R3。
- C2閾値移設・較正、D10、被膜、整流子、進角、張力破断・線材消費。
- 新規UI、品質点、正解帯、予測、asset、音、汎用sweep基盤。
- RNG、車体・モーター物理、scenario、canonical encoding、schemaの変更。
- `docs/spec.md`、`docs/art-spec.md`の変更。
- commit、tag、push、deploy、PR、merge。

## 8. 人間再承認記録

2026-08-31、人間プロジェクトリードが次の全文で承認した。

> P41C-R1 production係数・限定再基準化有限バンドル全文を承認します。minPackingRatio=0.85、referenceTension=1.0を採用し、提示された3ファイル8assertへの閉包訂正とexact式を承認します。変更は提示された5ファイルに限定し、全test・build・lint・Phase 4型検査後に停止してください。R2-A、R2-SWEEP、R3、spec/art-spec、commit・tag・push・deploy・PR・mergeは禁止します。

この承認により§5の5ファイルだけを解禁する。§6の検証をすべて実行し、結果提示後に停止する。6ファイル目、9件目の既存期待値変更、P4-0 scenario aggregateの変化、または禁止差分が生じた場合は推測せず停止する。

## 9. Suu受入レビュー

受入日: 2026-08-31（JST）  
判定: **通過。P41C-R1 C1実装は節目完了。R2-A以降は未解禁**

初回完了報告の差分レビューで、次の2点を検出し、同じ許可5ファイル内で是正した。

1. `computeMeanTension` / `computeTensionPackingRatio`に、§1で承認済みの有限値・正下限fail-closed検証が不足していた。
2. C1の人間承認日がUTC日付の`2026-08-30`で記載されており、JSTの正式日`2026-08-31`と不一致だった。

是正後は、非有限・範囲外張力、不正`minPackingRatio`、不正`referenceTension`をclampせずthrowする。正規経路の`0 → 0.85`、`0.5 → 0.925`、`1 → 1.0`と8件の再基準化式は不変である。C1由来4箇所だけを2026-08-31（JST）へ訂正し、別工程P4-1Bの正しい2026-08-30記録は変更していない。

最終SHA-256:

```text
9f3a4c507c460ea2643d374989edc9f16c343802f3ba1cbee3f0ddde859a5190  src/materials/windingMapping.ts
4d6e2d92f7864e7780e8009276a94b6a898f88df5f80c1f8c77f44c90e3a21ae  src/materials/__tests__/windingMapping.test.ts
bfd9181ba328f210fb9ed163c7d2d40b17f8aa351e5ad136cf63adcecb1e817c  src/store/__tests__/rotorAssembly.test.ts
401d66007a6f4024a0f696ae873bce7dae6c29f7510a742b1386564e15dedecd  src/store/__tests__/saveStore.test.ts
b9b784e61b86f8dd99c1717a730b8840dbbdea8cfff1fdccbb1da2a4060c404a  src/engine/__tests__/recipeCode.test.ts
```

独立再検証:

- `npm run test`: 106ファイル・2719テスト成功。
- `npm run build`: 成功。
- `npm run lint`: warning 0 / error 0。
- `npx tsc -b`: 成功。
- `npm run typecheck:phase4-sweep`: 成功。
- `git diff --check`: 指摘0。
- P4-0 `scenario.test.ts`: 16テスト成功、ファイル差分0。
- 実装差分は許可5ファイルのみ。既存期待値変更は3ファイル8assertだけ。
- canonical E2、MC4 payload、recipeKey v2、save schema、`coilTurns`、legacy、R2-A/R2-SWEEP/R3、spec/art-specの差分0。
- commit、tag、push、deploy、PR、mergeは0。

独立テストの初回起動ではambient `TEMP`が存在しないWindows側パスを指しVitest worker生成前に失敗したため、`TMPDIR=/tmp`を明示して同一コマンドを再実行した。これはテスト0件時点の実行環境エラーであり、上記の再実行では全検証が成功している。
