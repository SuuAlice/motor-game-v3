# P4-1C engine・store arbiter正式レビュー判定

受領日: 2026-08-30  
回答者: `arbiter_mot3`  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **2026-08-30 人間プロジェクトリード承認済み。P41C-R1・R2のexact deltaおよびread-only有限sweep計画の作成を解禁。各production/test実装・較正値変更・Git操作は未承認**

以下はagmsgで受領した正式回答全文である。

---

## 0. 受領照合・独立検証（形態A）

- 固定入力3件のSHA-256実測一致（bundle=`76d46000…`・request=`0629334c…`・addendum=`a36dd0c6…`）、3文書すべてEOFまで全文読了。実装基準 `/tmp/motor-game-v3-phase4-plan.x1bsO4` HEAD=`874f8dd9…`、untrackedは依頼2文書のみ。
- 実装基準コードでの独立確認: (i)`RotorWindingState.recorded`は**record+wireGaugeMm+parallelStrandsのみ保存、導出ratioを保存しない**（inventoryItem.ts:55-83）——後述C-2の根拠。(ii)ratio===0の完成時拒否（rotorAssembly.ts:132-142）。(iii)d01設定組立点=`destructionCalibration.ts`の`D01_CALIBRATION`（12行→materialMapping.ts:947）——**依頼書のC2閉包に欠落していたが、追補B-3が正しく含めており解消済み**（追補の現物監査が新しい事実、という規約どおり採用する）。(iv)bare caller一覧は依頼書（RaceCanvas.tsx含む6系）と追補B-1（3件+テスト群）で相違——**追補を新しい事実として採用**し、実装直前の`rg`再実測（pitfalls#2）で最終確定すること。
- 外部コンテキスト自己申告（HB-DEC-013）: 根拠は上記+私の先行裁定のみ。system prompt表示モデルはclaude-sonnet-5。

## 総合判定

**条件付き承認**（blocking条件はC-1・C-2の2件、いずれも開示・明記の追加であり設計変更ではない）。

## 1. H1〜H10全体: 承認（C-1・C-2付き）

H1/H3/H5〜H10はすべて承認。H8の一次資料規律（ELEKTRISOLAアンカーを銅0.400mm限定と明記し他素材へ外挿しない）は実在物性主義の模範である。H2・H4は以下の条件付き承認。

**【C-1（blocking）】H2はP41-R1凍結定義の限定拡張であることの明記。** `windingTurnsRatio`はP4-1Aで「方向一貫性」として凍結された定義であり、`× tensionPackingRatio`への拡張は技術的に健全（単一合成点・(0,1]・recipe/recipeKey/save不変を全て保ち、張力はcanonical記録内にあるためrecipeKey v2の十分性も保たれる——H10-1への回答: 壊さない）が、凍結済み定義の意味変更である事実をC1 deltaの人間承認文へ明示すること（無申告の再解釈をしない、P3-2-Q13-1規律）。

**【C-2（blocking）】C1の遡及効果の開示。** ratioは保存されず記録から毎回導出される（実測(i)）ため、**C1のproduction反映は既存saveの全recordedローターの実効性能を遡及変更する**（緩く巻いた既存個体は弱くなる）。導出方式自体は正しい（記録=単一出典、保存値化はドリフト源）——求めるのは方式変更ではなく、C1のexact値承認バンドルへの遡及適用とその方向の明示である。RQ-3の限定再基準化と同一deltaで扱ってよい。

## 2. RQ-1/追補B（D01閾値供給）

**B-requiredを採用。B-default（alice推奨）は却下する。**

判断根拠:

- 両候補の差は「**将来の呼出し元**への保証」にある。B-defaultの構造テスト（`coilDeformThresholdAudit.test.ts`）は**現在列挙済みの3 wrapper**の明示供給を監査できるが、**将来の第4のproduction caller**を守れない——そしてPhase 5は実レシピCPUライバルという新しい走行呼出し元を確実に追加する（仕様書§12）。optional引数は5つの公開engine関数に恒久の供給漏れ穴を開け、新callerが黙って既定値へ落ちる。監査は列挙に依存し、列挙は将来に対して常に不完全である。
- 本プロジェクトの確立序列は「構築不能 > fail-fast > 監査」（P3-1-Q6）であり、B-requiredは型検査で渡し忘れを構築不能にする。P4-C2（rng既定値の明示排除）とも同型——「既定値が決定論的な定数だからP4-C2より弱い懸念」という追補の自己評価は正しいが、弱いだけで同じ穴の種類である。
- 一方、B-requiredの代償（P4-0凍結1ファイルの機械追随）は**一度きりで、機械的に証明可能**である。P4-1Bの入力層移設で確立した方式どおり、P4-0既存の決定論テスト（固定record hash・trace一致）がassert無変更で通過することを追随の受け入れ条件とすれば、凍結の目的（比較証跡の挙動不変）は完全に保たれる。恒久の穴と一度きりの証明可能な追随では、後者が明確に安い。
- **B-required採用の条件**: (i)bare caller（sessionRunner・scripts 2件+`rg`再実測で確定した全件）が明示的に渡すdefault定数は`COIL_DEFORM_OMEGA`（constants.ts）の**export 1定数のみ**を単一出典とする（migration default・旧snapshot補完defaultも同一定数）。(ii)`sessionRunner.ts`追随はP4-0決定論テスト無変更通過で挙動変更0を証明。(iii)追補B-defaultパッケージに含まれていた**正の実効性fixture（既定と異なる閾値で発火stepと発火後進行量が同時に動くことの実測テスト）は、B-requiredでも必須として引き継ぐ**（供給が型で保証されても、発火と進行が同一fieldを読むことの検証は別の性質である——H4「同じfieldを使う」の機械固定）。(iv)コメント除外ソース走査+陰性対照の構造テストも維持してよい（型検査の冗長な二重化だが、将来のoptional化への退行を検出する価値がある）。

## 3. RQ-2/追補B-3（旧snapshot版上げなし補完）: 承認

補完defaultが「当該runが実際に走った当時の支配値」と厳密同値であるため、**リプレイ忠実性は補完によって保存される**——これが版上げ不要の実質根拠である。RunSnapshot 4のD10留保（P41-R4）と整合。負例（欠落・0・負・NaN・Infinity・文字列）は十分。条件: 補完defaultは§2(i)の単一定数と同一出典。

## 4. RQ-3/追補A（正下限・限定再基準化の分離）: 承認

- `minPackingRatio > 0`（張力0でも完成可能な正値）・緩い巻線を方向打ち消しと誤分類しない・積(0,1]——「症状は連続量、生成拒否は表現不能状態のみ」の正しい適用であり、現行のratio===0拒否実装と整合。
- **C1のみ限定再基準化（対象期待値・新値・根拠のsweep同時提示）、C2移設は再基準化0**という分離を確定する。C-2の遡及開示をC1側の同一deltaへ含めること。

## 5. 追補A-1（C1をwindingMapping.tsへ閉じる）: 承認

`aggregateWindingRecord`（P4-0契約・sessionRunnerが参照）を不変に保ち、張力因子を`computeMeanTension`/`computeTensionPackingRatio`/`TensionPackingCalibration`としてwindingMapping.tsへ閉じ、`deriveWindingMotorFields`だけが積を合成する構成は、P4-0凍結・単一合成点・純関数規律をすべて満たす最小配置である。`PRODUCTION_TENSION_PACKING`のexact係数をsweep後の別途人間承認まで置かない規律も較正ディシプリンどおり。変更不要リスト（rotorAssembly/recipeCode/recipeKey/saveStore/gameStore/ExperimentNotebook）は妥当——RQ-6どおり新field 0でCONFIG_LABELS追随0。

## 6. RQ-4/追補C（maxTurnsByStock権威境界）: 承認

**両方を要求する**: (a)UIはstoreの権威計算値（`resolveWindingTurnLimit`）と同一の値を表示用に受け取る、(b)完成・破断消費のvalidatorが同じ純関数で再検証し、UI表示と食い違ってもstore拒否を迂回できない。UI独自clamp・在庫直接読みは禁止（P4-1判定論点8の執行点規律どおり）。`computeMaxTurnsByStock`が既存`computeConsumedWireM`を単一出典とする構成・`WindingLot`への在庫非保存も承認。

## 7. RQ-5/追補D（破断後リセット）

**追補R1（既存reset再利用・新action追加なし）を採用。** 依頼書RQ-5の理由union案より追補R1の方が小さく、同じ保証を与える——消去遷移は既存`reset`1本のまま、`broken`からは`reset`以外の遷移を構造テストで禁止、`canRequestCompletion(broken)===false`、在庫は消費確定のまま不変、確認dialogの出し分けはUI層の関心として分離。理由unionは不要になった（R1が上位互換）。`discardBroken`新設・途中継ぎの不採用も確定。C3別承認までの実装保留は継続。

## 8. 閉包の過不足

追補B-3で`destructionCalibration.ts`が補われ、**現時点で不足なし・過剰なし**。依頼書と追補のbare caller相違は追補を採用し、実装直前の`rg`全再実測で最終確定（pitfalls#2）。d01リテラルfixture追随5件の列挙も妥当。

## 9. 追加要求の有無

**追加の物理・較正・素材field・schema昇版・UI/sweep基盤を一切要求しない。** C-1/C-2は開示の追加、§2(iii)は追補自身が設計済みのテストの引き継ぎである。成立する。

## 10. 人間再承認が必要なdelta

- **P41C-R1（C1）**: H2限定拡張の明記（C-1）+`TensionPackingCalibration`のexact係数（257点sweep結果）+**既存recordedローターへの遡及適用の開示（C-2）**+限定再基準化の対象・新値・根拠。
- **P41C-R2（C2）**: B-required採用のexactシグネチャ（5関数）+bare caller追随全件（`rg`確定）+単一default定数+旧snapshot補完契約+移設段階の挙動変更0証跡（engine数値回帰+P4-0決定論テスト無変更）+実効性fixture（§2(iii)）+低張力→閾値低下のexact係数（sweep結果）。
- **P41C-R3（C3）**: 既定どおり別バンドル（破断契約+追補C/Dのexact API・文言・構造テスト+H8素材相対比とdesignAssumption換算+操作性の別人間試遊）。
- C-1/C-2の反映と上記の範囲内である限りarbiter再提出は不要。B-requiredの実装で追補B-2想定外の破壊的波及が出た場合のみ再エスカレーション。

## 効力

本判定の効力は人間プロジェクトリードの承認後に発生する。production/test実装・較正値変更・spec/art-spec確定変更・commit/tag/push/deploy/PR/mergeの禁止は各deltaの承認まで継続する。arbiter_mot3はコード・test・docs編集・Git操作・独自の実装・較正のいずれも行っていない。

以上、正式回答として全文送信し、以後停止する。

## 人間承認記録

2026-08-30、人間プロジェクトリードが次の文面で本判定全文を承認した。

> P4-1C arbiter正式レビュー判定全文（C-1・C-2、B-required採用、旧snapshot補完、正下限・再基準化分離、store権威、既存reset再利用、P41C-R1〜R3再承認手順を含む）を承認します。P41C-R1・R2のexact deltaおよびread-only有限sweep計画の作成へ進めてください。

この承認により、P41C-R1・R2のexact deltaとread-only有限sweep計画の作成だけを解禁する。production/test実装、production較正値の変更、spec/art-spec確定変更、P41C-R3実装、commit、tag、push、deploy、PR、mergeは引き続き解禁しない。
