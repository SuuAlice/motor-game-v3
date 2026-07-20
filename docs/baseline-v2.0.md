# v2.0基準テスト結果(V3 Phase 0)

## 目的

V3は既存リポジトリ(旧V2、origin `suualice08/motor-game-v3.git`)を同一履歴上でそのままV3本体として扱う(人間承認済み、案A。`docs/repo-birth-checklist.md`の「複製」ステップは適用しない)。そのため本書は「新規複製後の無変更確認」ではなく、**V3初期化の起点となるv2.0時点のtracked tree(src/・テスト)が無変更で動作することの記録**であり、以後の変更に対する回帰基準とする。

## 基準

- リポジトリ: 本リポジトリ(`suualice08/motor-game-v3.git`)。旧V2として開発され、V3初期化の起点として同一履歴上で継続使用する
- 基準タグ: `v2.0`
- 基準コミット: `18f9ed2`
- 実行日: 2026-07-21
- Node.js: `v24.18.0`
- npm: `11.16.0`

## 無変更ゲートの基準

本書作成時点の作業ツリーには、`docs/spec.md`(v3仕様稿への差し替え、未コミット)・`docs/art-spec.md`(新規、未追跡)等のV3ドキュメント作業が既に存在する(dirty)。**無変更ゲートは、これらdocs配下の新規仕様稿を除いた`src/`・既存テストのtracked treeを基準とする。** 以下のtest/build/lint結果は、`src/`および既存テストファイルを一切変更していない状態(v2.0 `18f9ed2`からの差分なし)で取得した。

## 無変更テスト

```text
$ npm run test

Test Files  16 passed (16)
Tests       206 passed (206)
```

内訳(実ファイル一覧、Suuレビューで訂正済み):

| 区分 | ファイル数 | ファイル |
|---|---|---|
| `src/engine/__tests__/` | 10 | commutator, failures, motorPhysics, motorPhysicsLoad, motorPhysicsSplitApi, motorPhysicsV15, recipeCode, scoring, trackPhysics, vehiclePhysics |
| `src/data/__tests__/` | 4 | brokenCars, partPresets, trackSweep, tracks |
| `src/store/__tests__/` | 2 | notebookStore, testRunStore |

合計16ファイル・206テスト。`src/engine/__tests__/prng.ts`はテスト補助ファイルでありテストファイル数には含まない。

追加確認:

```text
$ npm run build
✓ 651 modules transformed
dist/index.html                   0.72 kB
dist/assets/index-*.css          21.35 kB
dist/assets/index-*.js          677.39 kB
✓ built in 716ms
(!) 500kB超チャンク警告あり(エラーではない、既知。docs/handoff.md参照)

$ npm run lint
警告・エラーなし(oxlint)
```

`dist`合計サイズ: 701,552 bytes(初回ロード1MB未満の要件内)。

## Phase 0受け入れ結果

- v2.0由来テスト206件: 全通過
- TypeScript型チェックと本番ビルド: 成功
- lint: 成功
- `src/`および既存テスト: v2.0(`18f9ed2`)から無変更
- docs配下のV3新規仕様稿(spec.md差し替え・art-spec.md追加)は上記結果に影響しない

この結果を、V3でエンジン層(`src/engine/`)の凍結基準(spec §2「エンジン凍結方針」)として扱う。V2 UI一式(`src/components/`・`src/render/`・`src/modes/`・`src/store/`・`src/data/`)はPhase 0では削除せず凍結参考実装として保持し、Phase 1で新UIシェルの構築に伴い論理単位で置換・削除する。
