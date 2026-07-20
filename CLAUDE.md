# 開発エージェント向けガイド

This file provides guidance to coding agents working with this repository. `AGENTS.md` and `CLAUDE.md` must always contain the same content.
- 応答・説明・コミットメッセージは日本語で書く

## プロジェクトの現状

v2 Phase 4まで実装済みです。反射慣性による車体連成、5コース、ガレージ、工作工程、車体対応診断、実験ノート、車体込みレシピコード、実験室を実装しています。現在の正確なテスト件数と検証結果は直近コミットおよび`docs/handoff.md`を参照してください。

- `src/engine/` — 純粋な物理エンジン(`constants.ts`・`commutator.ts`・`motorPhysics.ts`・`scoring.ts`・`failures.ts`・`__tests__/`)
- `src/store/gameStore.ts` — zustandストア(config/simState/history/モード別ロック)
- `src/render/` — Canvas 2D描画
- `src/components/` / `src/modes/` — 4モードのUI一式
- `src/data/` — チャレンジ定義・故障プリセット

このリポジトリはv2(「走れ!手作りモーターカー」、仕様書v4)開発専用です。v1.5を凍結済みの基準点とし、承認済みの `docs/spec.md` をv2における唯一の正とします。v2 Phase 0(リポジトリ立ち上げ・`src/engine/`移植・基準テスト保存)は完了済みです(`docs/baseline-v1.5.md`参照)。現在の実装フェーズと各フェーズの受け入れ基準は仕様書§10を参照してください。

コマンド:
- `npm run dev` — 開発サーバー起動
- `npm run test` — Vitestでengine/のテストを実行
- `npm run build` — 型チェック(`tsc -b`)+ 本番ビルド
- `npm run sweep` — チャレンジ設計用のパラメータグリッド探索ツール

**作業を始める前に、`docs/spec.md`(唯一の正)・`docs/handoff.md`・`docs/baseline-v1.5.md`を読んでください。** v1.5由来の資料と実装が矛盾する場合、v2については `docs/spec.md` を優先してください。

## このプロジェクトについて

「回れ!手作りモーター」は、中学理科の定番工作(エナメル線のコイル、釘、ダンボール製整流子、軸受け/ブラシ代わりのクリップ、磁石)である手作りDCモーターの製作体験をブラウザ上で再現する教育ゲームです。目的は、実物のモーターがなぜ回らないのか――整流子のショート、削り残しによる接触抵抗、ブラシ圧の強すぎ/弱すぎ、巻き数不足――を、シミュレーションの調整可能なパラメータとしてそのまま提示し、生徒に試行錯誤で学ばせることです。

対象ユーザーは、子供の頃に手作りモーターやミニ四駆で遊んだ大人です(v1.5で中学生向けから再定義。`docs/spec-v1.5.md` §1.1)。UIテキストは日本語で、簡潔・正確に、単位を省略せず書く必要があります。

## アーキテクチャ(仕様書§8より)

設計の核となる原則は、**物理エンジンを React/DOM から完全に切り離す**ことです。物理エンジンは `src/engine/` 内に純粋な TypeScript 関数として実装します(例: `step(config, state, dt) => state`)。これにより Vitest で物理挙動を数値的にユニットテストでき、Claude Code がテスト駆動で物理エンジンを修正しやすくなります。

目標ディレクトリ構成(仕様書§8.2。移行中のため現状のsrc/構成とは差分があります):
- `src/engine/` — 純粋な物理計算: `constants.ts`、`motorPhysics.ts`(v1.5モーター単体+`loadTorque`入力)、`vehiclePhysics.ts`(ギヤ・車輪・車体・連成、新規)、`trackPhysics.ts`(コース区間・完走・コースアウト判定、新規)、`commutator.ts`、`failures.ts`、`scoring.ts`、`recipeCode.ts`(v1.5の`recipeCodec.ts`から移植・車体対応拡張、新規)、および `__tests__/`
- `src/store/gameStore.ts` — `MotorConfig` / `CarConfig` / `SimState` / モード / 進捗を保持する zustand ストア
- `src/render/` — Canvas 2D 描画(`MotorCanvas.tsx`・`RaceCanvas.tsx` が requestAnimationFrame ループを駆動し、`drawMotor.ts`・`drawRace.ts` は純粋な描画関数)
- `src/components/` — UI(`garage/`、`assembly/`(モーター工程のみ)、`meters/`、`MeasurementPanel.tsx`、`ResultPanel.tsx`)
- `src/modes/` — `GarageMode` / `AssemblyMode` / `TestRunMode` / `CourseMode` / `DiagnosisMode` / `LabMode`。v1.5由来の旧Challenge/Sandbox画面はPhase 4完了ゲートで削除済み
- `src/data/` — 静的データ:`tracks.ts`、`challenges.ts`、`partPresets.ts`、`brokenCars.ts`

### 物理モデル(仕様書§4)

物理エンジンは**モーター層**(v1.5をそのまま継承)と**車体層**(新規)の二層構成です。固定タイムステップ dt = 1/120s で積分します(描画は60fps、1フレームあたり物理ステップは最大2回)。

モーター層の中心方程式(v1.5から無変更、`loadTorque`入力のみ追加):
```
J_motor · dω_motor/dt = T_mag + T_cog + T_brush + T_drag − T_load
```
コギングトルク`T_cog`、電池内部抵抗`R_BATTERY_INTERNAL`、i²発熱を含む。整流子のデッドゾーン・短絡・ブラシ摩擦・確率的瞬断・軸ずれ振動の扱いはv1.5どおり。

車体層(非空転時、仕様書§4.5「反射慣性方式」):
```
J_eff · dω_motor/dt = T_mag + T_cog + T_brush + T_drag + T_resist_reflected
```
**モーター軸と車軸を別々の自由度として積分してはならない。** ギヤの運動学的拘束 `ω_axle = ω_motor / G` を常に満たすよう、車体質量をモーター軸へ換算した反射慣性`J_eff`で一つの運動方程式として解く。車速は積分せず`ω_motor`から導出する。空転時(駆動力要求がグリップ上限を超えた場合)だけモーター側と車体側を2自由度に分離し、再結合時は車速を不連続に変えず、消えた回転エネルギーをタイヤの滑り損失として記録する(総エネルギーを増やさない)。詳細な式は仕様書§4.5・§4.6、および`docs/handoff.md`の「v2で踏んではならない罠」を参照。

`VehicleSimState.energyBreakdown`(駆動・ギヤ損・空転損・ブラシ損・熱の積算)はPhase 2の連成実装時から必ず記録すること。

仕様書§3.3にある `MotorConfig`(v1.5から無変更)・`CarConfig`(新規)の TypeScript インターフェースが正のデータモデルです。新しいパラメータ名を考案するのではなく、これに厳密に従ってください。

### 失敗パターンとパラメータの対応(仕様書§5)

画面上に現れる失敗症状は、必ず実物の工作・走行で起こりうる原因と1対1で対応させる必要があります(仕様書§5の表を参照)。この対応関係はゲームの教育的価値の核心部分であるため、実物のモーター製作・車の走行で実際に起こりうるミスに対応しない失敗モードを追加しないでください。

## プロジェクト固有のルール(仕様書§8より)

- 物理計算はすべて `src/engine/` の純粋関数内で行う。dtループやNewton積分をReactコンポーネント内に書かないこと
- `engine/` を変更した場合は必ず対応するテストも更新し、`npm run test` を通すこと
- 物理タイムステップは固定 1/120s。ステップ幅を変えるのではなく、描画側で補間すること
- パラメータの意味と適正範囲は、仕様書§3.3の `MotorConfig` / `CarConfig` インターフェースに従うこと
- モーターと車体の連成は反射慣性方式(仕様書§4.5)で解くこと。車速とモーター角速度を硬いバネや補正トルクで別々に追従させる方式は採用しない
- UIテキストはすべて日本語で書くこと。簡潔・正確を旨とし、単位の省略は禁止する(仕様書§7.4)。専門用語(逆起電力・コギング・整流など)はそのまま使ってよく、用語集ページで補う
- `localStorage` 以外の永続化・外部通信は行わないこと。完全に静的なアプリ(バックエンドなし)とし、GitHub Pages / Vercel にデプロイ可能な状態を保つこと

## 非機能要件(仕様書§13)

- ミッドレンジスマホを基準に60fps描画を目標とする。物理ステップは1フレームあたり最大2回まで。遅延時は時間を飛ばさず描画品質を下げる
- 初回ロードは1MB未満。画像アセットではなくSVG/Canvas描画を使うこと
- スライダー・タブ・スタート操作はキーボード操作可能にすること。色だけに依存した状態表示をしないこと(例: ショート状態は赤色だけでなくアイコンでも示す)
- 依存パッケージは最小限に保つこと(react / zustand / recharts[実験室とリザルトのみ] / tailwind)。理由なく他の依存を追加しないこと
- 実在するミニ四駆の商品名・ロゴ・車体デザインを使用しないこと。電池の短絡・発熱・工作道具について現実の安全注意を表示すること

## 実装フェーズ(仕様書§10)

Phase 0(alice、完了): リポジトリ立ち上げ・`src/engine/`移植・基準テスト保存・AGENTS.md/CLAUDE.md/docs/handoff.mdの整備。

| フェーズ | 内容 | 主担当 |
|---|---|---|
| Phase 1 | `motorPhysics.step`への`loadTorque`後方互換追加 | alice |
| Phase 2 | 車体物理(反射慣性連成)+テスト走行MVP | エンジン=alice、UI=Suu |
| Phase 3 | コースと条件セット、sweep運用 | エンジン=alice、データ・sweep=Suu |
| Phase 4 | ガレージ・診断・レシピコード・共有 | UI=Suu、エンジン協力=alice |
| Phase 5 | 仕上げ(音・演出・PWA・README) | Suu主担当 |

各フェーズの完了条件・受け入れ基準の詳細は仕様書§10を参照。共通DoDは `npm run test && npm run build && npm run lint` の成功。物理エンジンを変更した場合は対応する数値テストを必ず追加し、各フェーズ完了時に人間が試遊して体感の破綻がないか確認する。**実装前に計画を提示し、承認後に着手する。エンジンの計画は実装承認前にFableのレビューを経る。**

## マルチエージェント開発体制(仕様書§9より)

v2は3者体制で進める。

| エージェント | ツール | 役割 |
|---|---|---|
| alice | Claude Code | **エンジンオーナー**。`src/engine/` 一式・テスト・物理の整合性。Phase 0〜2主担当。仕様との突き合わせ・レビュー |
| Suu | Codex (GPT-5.6) | **アプリ担当**。UI・データ・描画・sweep運用。エンジンには原則触れない |
| Fable | Claude(本仕様の作成者) | 計画レビュー・物理と設計の判断・エージェント間の裁定。スプリント境界のみ関与 |

- 連絡は agmsg(チーム: MotorGameV2)。v1.5保守用の`MotorGame`チームと混在させない。人間はスプリント境界の判断のみ行う
- 役割境界: `src/engine/` への変更はaliceのみがコミットする。SuuがエンジンAPIの変更を必要とする場合はagmsgでaliceに依頼し、aliceがテスト込みで実装する
- コミットメッセージに担当エージェント名を含める(例: `feat(engine): 反射慣性の連成実装 [alice]`)
- **`CLAUDE.md` と `AGENTS.md` は常に同内容に保つこと。** どちらかを更新したら必ず他方も同じ内容に更新する(CodexはAGENTS.mdを読むため、内容が乖離すると2エージェントの認識がずれる)
