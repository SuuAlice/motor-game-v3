# Phase 2 Step 9 実装前計画 v12: materialSweep.ts(素材写像の物性検証sweep、Phase2ゲート提出物)

作成日: 2026-07-23
担当: alice_mot3(エンジン・写像)
状態: **実装前計画v12・Suu_mot3条件付きcommit承認(冒頭の初版由来文言を修正)・(A)commit実行段階**
実費見込み: 0 USD

**v10の位置づけ(重要)**: v9で人間の(A)再承認を得て`scripts/materialSweep.ts`を`RUNNABLE_BASE_CONFIG`基準へ修正・`npm run typecheck:material-sweep`成功後に`npm run sweep:material`を実行したところ、7.3(ギヤトレードオフ)ゲートの合否が17節の診断結果(PASS想定)から**反転(FAIL)**した(18節参照)。原因を診断した結果、`RUNNABLE_MOTOR_CONFIG_TEMPLATE.coilTurns=110`に「engineが自動クランプする」というコメントを付けたが実際には誤りで、`computeMaxTurns`は呼び出し側が明示的に適用すべき独立ヘルパーであり(`scripts/vehicleSweep.ts`の`MOTOR_CANDIDATES`も明示クランプ済み)、17節の読み取り専用診断スクリプトは正しくクランプ(110→37)を適用していたのに対し、実装(`scripts/materialSweep.ts`)側はクランプを適用し忘れ、`coilTurns=110`のまま(物理的に無効な巻数)使用してしまっていた。これがゲート反転・実測値の大幅乖離の原因である。engine/・materialMapping.ts等は無関係。v10はSuu_mot3指示により、コードを変更せずこの原因診断・限定修正方針・再実行手順を計画へ追記するものである(18節)。

**v7の位置づけ(重要)**: v6は人間実装承認を得て(A)へ着手し、実装・4ゲート(test/build/lint/typecheck:material-sweep)はすべて成功したが、実際に`npm run sweep:material`を実行した結果、7.3(ギヤトレードオフ)・7.4(破産防止minimum-tier完走)・4節(容量ratio単独ゲート)の3ゲートがFAILした(16節参照)。これはmaterialMapping.ts等の素材写像の不備ではなく、3節の`REPRESENTATIVE_MOTOR_CONFIG`/`REPRESENTATIVE_CAR_CONFIG`(materialMapping.test.tsから転記した値)が実走行(トラック完走)を検証する目的では選ばれていなかったことが原因と判明した。v7はSuu_mot3指示によりproduction/test/script/package.json編集を伴わない読み取り専用bounded診断(17節)を行い、実走行可能な共通基準構成(`RUNNABLE_BASE_CONFIG`)を確定し、計画へ反映するものである。

本書は単独で作業を再開できる水準で書く。当初の実装前計画時点(v1〜v9)では未実装だったが、現在は(A)実装・限定修正・再実行が完了している(18節)。commit前(本書提出をもって承認を求める段階)。根拠: `docs/spec.md` §12(Phase2ゲート「写像の物性検証sweep」)・§4.1・§5.4、`docs/phase2-plan.md` §15(sweep方針)・§16移行順9。

v1からの変更点(Suu_mot3必須修正8点への対応、v2で反映):
1. 破産防止premiseの構成を訂正。V2回帰anchor(銅線)と破産防止minimum-tier(アルミ線)を別構成として定義し、ブラシ未接続をcoverage gapとして明記(2節・7.4節)
2. 電池容量ratioのengine実作用を観測可能にするため、専用の長距離capacity-check trackを新設。**当時(v3・v4)の暫定設計、v7で変更済み**: V2回帰anchor+alkalineのcompose結果を土台に`batteryCapacityRatio`の値だけ(1.0と1.3)を差し替えた2runを同一seedで比較し、両runとも`energyExhausted`到達を確認したうえで到達距離が厳密に大きいことをゲート化する「容量ratio単独ゲート」。実際のアルカリ・NiMH・LiPo3種を比較する走行は、内部抵抗ratio+容量ratioの複合効果であるため「容量単独の証明」とは呼ばず、参考情報として別途記録する(4節)。**現行(v7以降)の土台はminimum-tier(アルミ線/フェライト/POM/アルカリ)+`RUNNABLE_BASE_CONFIG`である**(28節参照)
3. `docs/phase2-material-sweep-report.md`をStep9の対象ファイルに統合し、(A)スクリプト実装→実行、(B)実測結果のレポート化、の二段階進行として明記(8節)
4. `scripts/materialSweep.ts`専用の型検査ゲート(`tsconfig.material-sweep.json`)を追加(8節・10節、v3でさらに訂正、下記10参照)
5. `materialMapping.test.ts`内のfixture値は非exportのtestローカル値であり、スクリプトからimportできないため「値を計画へ列挙し、コメント付きで再掲する」方式に訂正(3節)
6. NaN安全性チェックを強化: compose成功192件全数・写像後の全数値フィールド・最終stateの主要数値・非負であるべき値を検査し、`ok:false`は即ゲート失敗とする(7.1節)
7. 実行時間の用語を「各runのシミュレーション内上限(`MAX_SIM_SECONDS`)」と「sweep全体のwall-clock目標(`WALL_CLOCK_TARGET_S`)」に分離し、wall-clock超過時の自動短縮を禁止(6節)
8. ギヤのトレードオフ方針(暫定支持)・§15例示との差異・4/9ファミリー縮減・新設trackの設計をまとめてFableへ確認する体制を維持(11節・14節)

v2からの変更点(Suu_mot3再確認・追加2点+表記修正、v3で反映):
9. capacity-checkの合格条件を「容量ratio単独ゲート」と「実素材電池の総合結果(参考情報)」へ分離。**当時(v3)の暫定設計、v7で変更済み**: 前者はV2回帰anchor+alkalineのcompose結果を土台に`batteryCapacityRatio`の値だけを差し替えた2run比較とし、後者(実際の3電池)は内部抵抗ratio+容量ratioの複合効果であるため「容量単独の証明」とは呼ばない(4節)。**現行(v7以降)の土台はminimum-tier(アルミ線/フェライト/POM/アルカリ)+`RUNNABLE_BASE_CONFIG`である**(28節参照)
10. `tsconfig.material-sweep.json`へ`strict: true`を追加し、`types`を`vite/client`から`node`へ、`lib`から`DOM`を除去。「tsconfig.app.jsonと意図的に同一」という説明を「tsconfig.app.jsonを基礎にStep9では変更を加える」に訂正(10節)
11. 誤記「minimum-tire」を全箇所「minimum-tier」に訂正

v3からの変更点(Suu_mot3最終確認・seed交絡の除去、v4で反映):
12. seed規則を用途別に分離(5節)。192通り全数の健全性走査(`straight-10m`)は`SEED + comboIndex`のままでよいが、単一変数の因果比較(容量ratio単独1.0対1.3、実素材電池3種比較、ギヤPOM対チタン比較、minimum-tier対最上位構成の参考比較)は比較グループ内で共通の固定seedを用いる比較専用runとして主軸192runとは別に実行する。乱数を消費しない`computeElectricalState`/`computeCoggingTorque`の直接評価(7.2節・7.3節磁石)はそもそもseed不要。比較専用runの追加により、対象run数を192+12=204runへ更新(6節・7.1節)
13. capacity-only比較のゲート条件を訂正: `capacityOnlyBaseline`・`capacityOnlyHigh`の**両方**が`status:'stalled'`かつ`failureCode:'energyExhausted'`へ到達することを明示し、タイムアウトまたは`finished`になった値を比較に用いることを明確に禁止(4節)
14. 冒頭の変更点一覧(本節)を、旧v2時点の暫定記述ではなく現行(v4)設計をそのまま説明する記述へ書き換え(上記2番を参照。単独で作業を再開できる文書として、最新設計が変更履歴からも直読できるようにする)
15. 版表記をv4に統一(状態欄・節見出し・文末)

v4からの変更点(Fable技術レビュー承認・条件2点、v5で反映):
16. 起動時の自己検証assert(Fable条件1)を追加。V2回帰anchorの合成結果について`wireResistivityRatio`・`wireDensityRatio`・`batteryInternalResistanceRatio`・`batteryCapacityRatio`が厳密に1.0、`magnetStrength`がフェライト較正値(0.2)、`gearEfficiency`がbaseline値であることを実行冒頭で確認し、不一致なら即異常終了する(3節)。3節の再掲値(testからimport不能のためのコピー)がproductionの較正値と乖離した場合の最後の砦
17. console出力へrun単位の用途タグ(`health-scan`/`capacity-only`/`battery-species`/`gear-tradeoff`/`tier-comparison`/`energy-run-reference`)とseed値を明記し、レポートから個々のrunが再現可能にする(Fable条件2、8節)。加えてFable推奨の機械可読PASS/FAILサマリブロック(4ゲート項目それぞれのPASS/FAIL)をalice裁量で採用し、理由を明記(8節)
18. (B)レポート化段階の対象へ`docs/phase2-plan.md`を追加。§15原文は書き換えず、末尾へ日付入り追記1行(「実装時点で写像が存在する4ファミリー全組合せに確定、残りはcoverage gap。詳細はsweep報告書」)を加える、docs-only変更として人間承認を得る(Fable Q1、8節)
19. ギヤ質量・J接続をPhase3計画時にD06(歯欠け)とセットで判断するオープン項目として明記(Fable Q2、9節)

v5からの変更点(Suu_mot3最終確認・訂正2点、v6で反映):
20. 3節の自己検証疑似コードの誤り(`Result`型を`ok:true`で絞り込み済みにもかかわらず`.motorConfig`/`.carConfig`をさらにプロパティアクセスしていた)を訂正: `const { motorConfig: mc, carConfig: cc } = v2AnchorCheck;`
21. 変更点17の誤記「PASS/FALサマリ」を「PASS/FAILサマリ」に訂正

v6からの変更点((A)実測FAIL・読み取り専用bounded診断・v7で反映):
22. (A)実測で7.3・7.4・容量ratio単独ゲートの3件がFAILした実測値・根本原因(16節)を記録。原因はmaterialMapping.tsではなく、3節の`REPRESENTATIVE_*`(materialMapping.test.tsの数値伝播テスト用fixture)が実走行検証用に較正されたことが一度もなかったこと
23. 読み取り専用bounded診断(17節、リポジトリへのファイル作成・編集なし)により、実走行可能な共通基準構成`RUNNABLE_BASE_CONFIG`を確定。導線・磁石・電池は不変、非素材依存のMotorConfig/CarConfig(`scripts/vehicleSweep.ts`のMOTOR_CANDIDATES[7]相当+CAR_GRIDのコーナー点)のみを選定した(2節)
24. ギヤトレードオフ比較(7.3節)の固定材質を、旧「V2回帰anchor」(銅線/フェライト/アルカリ)から「minimum-tierと同じ導線・磁石・電池」(アルミ線/フェライト/アルカリ)へ変更。理由: 銅線+フェライトの組合せは多くの実走行可能な車体構成でoverheatedになりやすく、実走行ゲートと両立しないことが診断で判明したため。7.2節(乱数非依存の写像パラメータ単調性)は引き続き旧`V2_REGRESSION_ANCHOR_SELECTION`を基準に使う(トラック走行を伴わないため、この問題の影響を受けない)
25. 3節の起動時自己検証assert(Fable条件1)は、旧`REPRESENTATIVE_*`の再掲値を引き続き使う(素材写像テーブルのドリフト検知が目的であり、実走行基準とは独立に維持する、Suu_mot3指示4)
26. 7.1(192通り健全性走査)・7.2(単調性チェックの土台となるMotorConfig/CarConfig、ただし比較対象selectionはV2回帰anchor基準のまま)を含む全204runの土台を`RUNNABLE_BASE_CONFIG`へ統一する(Suu_mot3推奨、6節)
27. (B)レポートに「初期代表fixture不適合→計画停止→再較正」の監査記録を追加する条件を9節へ明記。今回のFAILログ(16節)は破棄せず最終報告書に残す

v7からの変更点(Fable技術レビュー承認・条件3点、v8で反映。docs/phase2-step9-fable-review-v2.md):
28. 4節本文(容量ratio単独ゲート・実素材電池総合結果・`energy-run`)がすべてアルミ線/フェライト/POM(minimum-tier)基準で統一されていることを確認済み(v7時点で既に反映済み、Fable条件1)。矛盾する旧文言がないことを全文検索で確認した
29. V2回帰anchor(銅線/フェライト/POM/アルカリ)を`RUNNABLE_BASE_CONFIG`で`straight-10m`走らせる参考run(用途タグ`v2-anchor-reference`、専用seed`SEED_V2_ANCHOR_REFERENCE`)を新設。ゲート対象外・参考情報のみ。総run数を204→205へ更新(4節・5節・6節・7.1節、Fable条件2(i))
30. (B)レポート要件へ物理的所見2件を追加(9節、Fable条件2): (i)銅線+フェライトの過熱レジーム(中位ティアが最低ティアより脆い動作点、spec §4.1ピーキーさに接続)、(ii)POM対チタンの差が小さいこと(14.517s vs 14.733s、Phase5バランス・Phase3 D06判断の入力)
31. 再実装後の実測値が17節の診断値と乖離した場合の扱いを停止条件へ明記: 数値更新は許容するが、ゲートの合否判定が反転した場合は続行・緩和せず停止報告する(13節、Fable条件3)
32. v4レビューのQ1〜Q6・条件2点・採用推奨1点はすべて維持(Fable確認済み、変更なし)

v8からの変更点(Suu_mot3最終確認・変更履歴の文言修正、v9で反映、docs-only・コード変更なし):
33. v1変更点2・v2変更点9が「現在の設計」と表現していたV2回帰anchor+alkaline土台の記述を、「当時(v3/v4またはv3)の暫定設計、v7で変更済み」へ訂正し、現行(v7以降)の土台がminimum-tier(アルミ線/フェライト/POM/アルカリ)+`RUNNABLE_BASE_CONFIG`であることを明記した(将来の読者を誤導しないため、Fable条件1「文言と実装の一致」の趣旨)。16節の実測FAIL監査記録内の旧土台名(V2回帰anchor+alkaline)は過去の実測事実の記録であるため維持する

v9からの変更点((A)再実装後のゲート反転・原因診断、v10で反映。コード未修正):
34. v9承認を得て`scripts/materialSweep.ts`を`RUNNABLE_BASE_CONFIG`基準へ修正・`typecheck:material-sweep`成功後に実行したところ、7.3ギヤトレードオフゲートの合否が17節診断(PASS想定)からFAILへ反転した実測値・原因診断を18節へ記録
35. 原因: 17節の診断は`Math.min(110, computeMaxTurns(0.8,1))`で`coilTurns`を37へクランプして使用したが、`RUNNABLE_MOTOR_CONFIG_TEMPLATE`定義時のコメント「engineが自動クランプする」は誤りであり、実装(`scripts/materialSweep.ts`)は`coilTurns=110`を直接使用してしまっていた(`computeMaxTurns`は呼び出し側が明示適用すべき独立ヘルパーであり、`computeRCoil`/`computeJ`/`backEmf`計算等はconfigの値をそのまま使う契約。`scripts/vehicleSweep.ts`の`MOTOR_CANDIDATES`も明示クランプ済み)。engine/・materialMapping.tsは無関係の契約誤認である(18節)
36. 限定修正方針: `RUNNABLE_MOTOR_CONFIG_TEMPLATE`の`coilTurns`定義に`scripts/vehicleSweep.ts`と同型の明示クランプ(`Math.min(110, computeMaxTurns(0.8, 1))`)を適用する。他のフィールド・素材較正値・engine定数は変更しない(18節)
37. 再実行手順を明記: 修正後は`npm run typecheck:material-sweep`→`npm run sweep:material`の順で全再実行し、17節の診断値と照合する。数値の乖離自体は許容するが、いずれかのゲートが再度反転、または別の新規乖離が生じた場合は続行・緩和せず再度停止報告する(18節・13節)
38. 今回のゲート反転FAILログ(18節)も16節と同様、(B)レポートへ監査記録として残す条件を9節へ追加

v10からの変更点(Suu_mot3コードレビュー・整合修正、v11で反映。docs-only、コード変更なし):
39. 人間再承認を得て限定修正(`RUNNABLE_MOTOR_CONFIG_TEMPLATE.coilTurns`へ`Math.min(110, computeMaxTurns(0.8, 1))`の明示クランプを適用)を`scripts/materialSweep.ts`へ実装し、`npm run typecheck:material-sweep`・`npm run sweep:material`を再実行した。全5ゲートPASS・17節診断値と完全一致(ゲート反転・新規乖離なし)。4ゲート(test/build/lint/git diff --check)も成功(18節へ結果反映)
40. 2節の`RUNNABLE_MOTOR_CONFIG_TEMPLATE`コード例が実装・18節の原因診断と矛盾する旧コメント(「実行時に37へ自動クランプされる」)を残していた点をSuu_mot3コードレビューで指摘され、`Math.min(110, computeMaxTurns(0.8, 1))`の明示クランプ・訂正コメントへ修正した(docs-only)
41. 状態欄・末尾を「(A)限定修正・再実行完了、Suu_mot3コードレビュー確認待ち(commit未実施)」へ更新

v11からの変更点(Suu_mot3最終確認・整合修正、v12で反映。docs-only、コード変更なし):
42. 冒頭(v7位置づけ直後)に初版由来の「まだ実装・編集・commitは行っていない」という文が残り、現在の状態欄・18節(実装・限定修正・再実行完了)と矛盾していた点を、「当初の実装前計画時点(v1〜v9)では未実装だったが、現在は(A)実装・限定修正・再実行が完了している。commit前」へ訂正した。Suu_mot3が本1点の修正+`git diff --check`再確認を条件にcommitを承認済み

---

## 0. 前提(遵守事項)

計画承認・人間実装承認のいずれかが完了する前は、検証目的であっても一時的なproduction/test/script/`package.json`/spec.mdの編集を行わない。本Stepは新規ファイル追加+`package.json`の追記のみでengine/・materialMapping.ts等の既存productionファイルを変更しない。**もしsweep実施の過程でengine変更が必要と判明した場合は、直ちに計画を停止し、別件としてFableレビュー条件を切り出す**(13節)。

## 1. 現状認識(重要な前提の確定)

`docs/phase2-plan.md` §15は「9ファミリー×代表ティアの組み合わせ」を想定しているが、2026-07-22時点で`materialMapping.ts`の`composeConfigFromMaterials`が実際に受理するのは`MaterialSelection`の4フィールド(`wireId`・`magnetId`・`gearId`・`batteryId`)のみである。残り5ファミリー(coating・brush・substrate・roller・body)は`materials.ts`にカタログデータを持つが、**現時点でmaterialMapping.tsは一切消費しない**(§4.2の素材選択→物理パラメータ写像がまだ実装されていない)。

したがって本Stepのsweep対象は、実際に写像が存在する4ファミリー(導線・磁石・ギヤ・電池)の**全組合せ**(4×4×4×3=192、Step7bの単体テスト項目9と同じ組合せ数)とする。残り5ファミリーは「代表ティア固定」ではなく「**sweepの対象外・Phase2ゲートの既知coverage gap**」であることを明記する(写像が存在しないものをsweepしても検証にならないため)。これは`docs/phase2-plan.md` §15の文言(「他は代表値固定の縮退グリッド」)からの意図的な逸脱であり、14節でSuu_mot3・Fableへ確認する。

## 2. 探索軸・縮退グリッド・代表構成の確定(v2: 構成を3種類に整理)

- **主軸(全組合せ、192通り)**: 導線(4)×磁石(4)×ギヤ(4)×電池(3)。`composeConfigFromMaterials`が実際に消費する唯一の4ファミリー
- **sweep対象外の5ファミリー(coating・brush・substrate・roller・body)**: `MaterialSelection`に該当フィールドがなく`composeConfigFromMaterials`が受理しないため、探索軸にもグリッドにも含めない(1節)。車体側パラメータ(gearRatio・wheelDiameterMm・tireGrip等)をsweepするのは`vehicleSweep.ts`の責務であり、本Stepでは固定する(3節で値を列挙)

**v2で3種類の代表構成を明確に区別する(Suu_mot3必須修正1)**:

| 構成名 | 導線 | 磁石 | ギヤ | 電池 | 用途 |
|---|---|---|---|---|---|
| **V2回帰anchor** | 銅線(標準) | フェライト | POM | アルカリ | 7.2節の単調性確認の基準点。既存`materialMapping.test.ts`の`CANONICAL_SELECTION`と同一構成(V2互換基準、Step7a/7bのanchor) |
| **破産防止minimum-tier** | **アルミ線** | フェライト | POM | アルカリ | 7.4節の破産防止premise確認。spec §5.4「底辺構成は常に無償相当: アルミ線・フェライト・POM・アルカリ・銅板ブラシの最低ティア一式」の物理構成そのもの |
| **最上位構成** | 純銀 | ネオジム | PEEK(**チタンは除く**、7.3節のトレードオフにより意図的に除外) | リチウムポリマー | 7.4節の比較対象(参考値) |

**V2回帰anchorと破産防止minimum-tierの違い**: 前者は導線が銅線(標準、`isBaselineAnchor: true`)、後者はspec §5.4が明示する最低ティアである**アルミ線**(`wire-aluminum`、価格最安・`isBaselineAnchor: false`だが経済上の最低ティア)。両者を同一視していたv1の誤りを訂正する。

**ブラシのcoverage gap(Suu_mot3必須修正1)**: spec §5.4の最低ティア一式には「銅板ブラシ」が含まれるが、ブラシファミリーは1節のとおり`materialMapping.ts`に未接続であり、`composeConfigFromMaterials`のいかなる入力にもブラシ選択を渡す方法がない。したがって「銅板ブラシ相当は現時点でMotorConfig/CarConfigへ一切反映されないcoverage gap」であることを7.4節・9節で明記する。

**`RUNNABLE_BASE_CONFIG`(v7新設): トラック走行を伴う全runの共通土台(17節の読み取り専用診断で確定)**

3節の`REPRESENTATIVE_MOTOR_CONFIG`/`REPRESENTATIVE_CAR_CONFIG`は、`materialMapping.test.ts`の数値伝播テスト用に選ばれた値であり、実際にトラックを走行・完走できるかは一度も検証されていなかった(16節)。これをトラック走行を伴うすべてのrun(7.1健全性走査・7.3ギヤトレードオフ・7.4破産防止・4節容量ratio関連)の共通土台として使う値へ差し替える。**素材較正値・engine定数は一切変更せず、非素材依存のMotorConfig/CarConfigフィールドのみ**を選定した(17節の診断根拠)。

```typescript
// scripts/vehicleSweep.tsのMOTOR_CANDIDATES[7](8番目の候補)+CAR_GRIDのコーナー点
// (低gearRatio寄り・高grip・低重心)+baseGearEfficiency=0.9(V2互換基準の「fast」ティア)。
// 導線/磁石/電池はcomposeConfigFromMaterialsが上書きするため、ここではプレースホルダ。
// coilTurnsは呼び出し側で明示的にcomputeMaxTurnsへクランプする契約(computeRCoil/computeJ/
// backEmf計算はconfig.coilTurnsをそのまま使い、engine側の自動クランプは存在しない)。
// scripts/vehicleSweep.tsのMOTOR_CANDIDATESと同型の明示クランプを適用する
// (18節、(A)再実装後のゲート反転の原因診断・限定修正で確定)。
const RUNNABLE_MOTOR_CONFIG_TEMPLATE = {
  coilTurns: Math.min(110, computeMaxTurns(0.8, 1)), // = 37。明示クランプ(vehicleSweep.tsと同型)
  slitWidthMm: 2.5,
  sandingQuality: 1,
  brushPressure: 0.25,
  magnetDistanceMm: 8,
  batteryVoltage: 3,
  axisOffsetMm: 0,
  wireGaugeMm: 0.8,
  parallelStrands: 1,
  varnished: true,
};

const RUNNABLE_CAR_CONFIG_TEMPLATE = {
  gearRatio: 4,
  wheelDiameterMm: 30,
  tireGrip: 1,
  axleFriction: 0,
  wheelAlignmentMm: 0,
  centerOfMassHeightMm: 12,
  motorMountOffsetMm: 0,
};

const RUNNABLE_BASELINE: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.9 };
```

**選定手順(17節の診断結果)**: `scripts/vehicleSweep.ts`の`MOTOR_CANDIDATES`(9候補)×`CAR_GRID`(gearRatio∈{2,4,7}・wheelDiameterMm∈{20,30,45}・tireGrip∈{0.4,0.7,1}・centerOfMassHeightMm∈{12,25,40}、massGはcomposeが上書きするため対象外)×`baseGearEfficiency`∈{0.9,0.8,0.74}(V2互換基準のfast/balanced/torque)の全2187通りを、「起動しやすいコーナー(低gearRatio・小径ホイール・高grip・低重心)から優先」の順で探索し、604件目の試行(motorIdx=7=`MOTOR_CANDIDATES`の8番目)で、minimum-tier(アルミ線/フェライト/POM/アルカリ)が`straight-10m`を`finished`できる組合せを発見した。この組合せは追加検証(17節)で、ギヤトレードオフ・容量ratio単独ゲート・実素材電池参考のすべてを満たすことを確認済み。

**7.2節(乱数非依存の写像パラメータ単調性)は引き続き旧`V2_REGRESSION_ANCHOR_SELECTION`(銅線/フェライト/POM/アルカリ)を比較対象selectionの基準に使う**(`computeElectricalState`/`computeCoggingTorque`の直接評価であり`stepTrackRun`を経由しないため、車体が起動できるかどうかに一切依存しない。ただし土台となるMotorConfig/CarConfigは他のrunと同じ`RUNNABLE_BASE_CONFIG`を使う、統一のため)。

**7.3節(ギヤトレードオフ)の固定材質を変更(v7)**: 旧v6は「他3ファミリーをV2回帰anchor(銅線/フェライト/アルカリ)固定」としていたが、17節の診断により、この組合せ(銅線+フェライト)は`RUNNABLE_BASE_CONFIG`を含む多くの実走行可能な車体構成で`status:'overheated'`になりやすく(弱い磁石+中程度の抵抗の導線が、十分な逆起電力で電流を下げる前に高電流状態が続き発熱する)、実走行ゲートと両立しないことが判明した。**v7では固定材質を「minimum-tierと同じ導線・磁石・電池」(アルミ線/フェライト/アルカリ)へ変更する**。アルミ線は導線の中で最も抵抗率が高く電流が抑えられるため、`RUNNABLE_BASE_CONFIG`下でも過熱を起こさず安定して動作する。この変更後もギヤ(POM/チタン)のみが変数であるという単一変数比較の性質は維持される。

## 3. 既存sweepとの再利用境界(v2: fixture値の扱いを訂正/v5: 起動時自己検証assert追加/v6: 疑似コード訂正)

| 要素 | 再利用元 | 扱い |
|---|---|---|
| `mulberry32`(決定論的PRNG) | `scripts/vehicleSweep.ts`等 | 独立実装をコピーする(既存3箇所の前例と同型、共通モジュール化は本Stepの対象外) |
| `TRACKS`(`src/data/tracks.ts`) | `scripts/vehicleSweep.ts` | `straight-10m`・`energy-run`(参考用途)を使用(4節)。専用capacity-check trackは`scripts/materialSweep.ts`内で新規定義する(4節) |
| `createValidatedTrack`/`stepTrackRun`(`trackPhysics.ts`) | 既存engine公開API | そのまま呼び出す(engine非変更) |
| `computeElectricalState`/`computeCoggingTorque`(`motorPhysics.ts`) | 既存engine公開API | そのまま呼び出す(engine非変更) |
| `composeConfigFromMaterials`/`MaterialSelection`/`MaterialCompositionBaseline`(`materialMapping.ts`) | Step7a/7b | そのまま呼び出す(materialMapping.ts非変更) |
| `CAR_GRID`(`scripts/vehicleSweep.ts`) | — | **再利用しない**。車体幾何パラメータのsweepは`vehicleSweep.ts`の責務であり、本Stepは車体側を固定値とする(役割の重複を避ける) |
| `auditUniversalMonotonicity`/`percentileTarget`(`src/data/trackSweep.ts`) | `scripts/vehicleSweep.ts` | **再利用しない**。素材ティアは離散4値・3値であり「単一パラメータの極端値固定が全コース最良」という縮退監査(車体連続パラメータ向け)とは検証したい性質が異なる(7節で独自の単調性検査を定義) |

**固定するMotorConfig/CarConfigの値(v2: Suu_mot3必須修正5への対応)**: `materialMapping.test.ts`の`baseMotorConfig`/`baseCarConfig`/`CANONICAL_BASELINE`は非exportのtestローカル値であり、production(`scripts/`)からimportできない(productionコードがtestファイルをimportする設計は禁止)。よって`scripts/materialSweep.ts`内に**同じ値を根拠コメント付きで再掲**する。値は次のとおり(2026-07-23時点の`materialMapping.test.ts`より転記):

```typescript
// materialMapping.test.tsのbaseMotorConfig/baseCarConfig/CANONICAL_BASELINEと同じ値を
// 根拠コメント付きで再掲する(testファイルは非export・productionからimport不可のため)。
// magnetStrength/massG/gearEfficiencyはcomposeConfigFromMaterialsが上書き・無視する
// プレースホルダ値であり、sweep結果には影響しない。
const REPRESENTATIVE_MOTOR_CONFIG: MotorConfig = {
  coilTurns: 80,
  slitWidthMm: 1.5,
  sandingQuality: 0.9,
  brushPressure: 0.3,
  magnetStrength: 0.5, // composeConfigFromMaterialsが上書きするプレースホルダ
  magnetDistanceMm: 10,
  batteryVoltage: 3,
  axisOffsetMm: 0,
  wireGaugeMm: 0.4,
  parallelStrands: 1,
  varnished: true,
};

const REPRESENTATIVE_CAR_CONFIG: CarConfig = {
  massG: 999, // composeConfigFromMaterialsが無視するプレースホルダ
  gearEfficiency: 0.123, // 同上
  gearRatio: 4,
  wheelDiameterMm: 30,
  tireGrip: 0.7,
  axleFriction: 0,
  wheelAlignmentMm: 0,
  centerOfMassHeightMm: 20,
  motorMountOffsetMm: 0,
};

const REPRESENTATIVE_BASELINE: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };
```

**起動時の自己検証assert(v5: Fable条件1への対応/v7: 実走行基準とは独立に維持することを明記)**: 上記の再掲値は`materialMapping.test.ts`から直接importできないコピーであるため、将来productionの較正値(`GEAR_MATERIAL_EFFICIENCY_RATIO`・`MAGNET_STRENGTH_CALIBRATION`・`BATTERY_*_RATIO_CALIBRATION`等)が変更されても本ファイルのコピーが追随せず、sweepが古い基準点のまま黙って走り続ける事故が起こりうる(Fable指摘: 「最後の砦」)。これを防ぐため、`scripts/materialSweep.ts`の実行冒頭で次の自己検証を行い、**1件でも不一致ならconsole.errorで理由を出力し、即座に異常終了(非ゼロexit code)する**:

**v7の重要な注記**: この自己検証は`REPRESENTATIVE_MOTOR_CONFIG`/`REPRESENTATIVE_CAR_CONFIG`/`REPRESENTATIVE_BASELINE`(本節、numeric propagation検証専用)を使い続ける。これは素材写像テーブルのドリフト検知のみが目的であり、`stepTrackRun`を一切呼ばない(compose結果の数値比較のみ)。したがって上記で判明した「トラック走行できない」問題の影響を受けず、修正の必要がない(Suu_mot3指示4)。実際にトラックを走らせる全run(7.1・7.3・7.4・4節)は、下記`RUNNABLE_BASE_CONFIG`(2節)を土台として使う、別の独立したフィクスチャである。

```typescript
// 起動時の自己検証(Fable条件1)。V2回帰anchor(導線copper-standard/磁石ferrite/
// ギヤpom/電池alkaline)をREPRESENTATIVE_*から合成し、既知のanchor厳密値と
// 一致することを確認する。3節の再掲値がproductionの較正値と乖離した場合に、
// sweep全体が誤った基準点を測り続ける事故を防ぐ最後の砦。
const v2AnchorCheck = composeConfigFromMaterials(REPRESENTATIVE_MOTOR_CONFIG, REPRESENTATIVE_CAR_CONFIG, REPRESENTATIVE_BASELINE, V2_REGRESSION_ANCHOR_SELECTION);
if (!v2AnchorCheck.ok) {
  console.error(`起動時自己検証に失敗(compose自体が失敗): ${v2AnchorCheck.reason}`);
  process.exit(1);
}
const { motorConfig: mc, carConfig: cc } = v2AnchorCheck;
const selfCheckFailures: string[] = [];
if (mc.wireResistivityRatio !== 1.0) selfCheckFailures.push(`wireResistivityRatio=${mc.wireResistivityRatio}(期待値1.0)`);
if (mc.wireDensityRatio !== 1.0) selfCheckFailures.push(`wireDensityRatio=${mc.wireDensityRatio}(期待値1.0)`);
if (mc.batteryInternalResistanceRatio !== 1.0) selfCheckFailures.push(`batteryInternalResistanceRatio=${mc.batteryInternalResistanceRatio}(期待値1.0)`);
if (mc.batteryCapacityRatio !== 1.0) selfCheckFailures.push(`batteryCapacityRatio=${mc.batteryCapacityRatio}(期待値1.0)`);
if (mc.magnetStrength !== 0.2) selfCheckFailures.push(`magnetStrength=${mc.magnetStrength}(期待値0.2、フェライト較正値)`);
if (cc.gearEfficiency !== REPRESENTATIVE_BASELINE.baseGearEfficiency) selfCheckFailures.push(`gearEfficiency=${cc.gearEfficiency}(期待値${REPRESENTATIVE_BASELINE.baseGearEfficiency}、POM=1.00のため合成後もbaseline値のまま)`);
if (selfCheckFailures.length > 0) {
  console.error(`起動時自己検証に失敗: ${selfCheckFailures.join(', ')}`);
  console.error('3節のREPRESENTATIVE_*値がproductionの較正値と乖離している可能性があります。sweepを中断します。');
  process.exit(1);
}
```

(疑似コードであり、実装時の変数分解・型はTypeScriptの構文に合わせて調整する。要点は「V2回帰anchorの合成結果が既知の厳密値と一致しない場合、即座に異常終了する」ことである。)

`scripts/materialSweep.ts`は`scripts/sweep.ts`・`scripts/vehicleSweep.ts`のいずれからもimportしない、独立したスクリプトとする(既存2本も相互にimportしていない前例と同型)。

## 4. 使用するトラック(v3: 3本、うち1本は新設。容量ratio単独ゲートと実素材総合結果を分離、Suu_mot3必須修正1/v4: 両run到達の明示・同一seed比較の明記)

- **`straight-10m`**(主、192通り全組合せで実行・ゲート対象): 水平10m直線。NaN安全性・ロックロータ電流の単調性・磁石コギング増加・ギヤ効率トレードオフ・破産防止minimum-tierの完走確認のすべてに使う主戦場
- **専用capacity-check track(新設、`hasEnergyBudget: true`の長距離直線)**: `scripts/materialSweep.ts`内で`createValidatedTrack`により次を新規定義する(既存`TRACKS`には追加しない):

  ```typescript
  // sweep専用の電池容量検証コース。既存BATTERY_CAPACITY_J_3_0V=80Jに対し、既存energy-run
  // (15m)のmaxEnergy目標が28J程度であることから、大まかに数十m相当でも予算超過に
  // 達しうると見積れるが、安全側に長く300mを起点とする。実装時に実測し、最も大きい
  // 容量(80J×1.3=104J)構成でもenergyExhaustedへ到達しない場合は距離を増やす
  // (本節の設計原則であり、具体数値は実装時の実測で確定させる。捏造しない実測値を
  // 報告書へ記載する)。
  const CAPACITY_CHECK_TRACK = createValidatedTrack({
    id: 'material-sweep-capacity-check',
    name: '(sweep専用)電池容量検証コース',
    description: '電池容量ratioの効果を確実に観測するための長距離直線(sweep専用、TRACKSには追加しない)',
    segments: [{ lengthM: 300, slopeDeg: 0, surfaceGrip: 1, roughness: 0 }],
    hasEnergyBudget: true,
    objectives: [],
  });
  ```

  このtrack上で**2種類の異なる検証**を行う(Suu_mot3指摘: 「容量ratio単独の効果」と「実素材電池を選んだ場合の総合結果」は原因が異なるため混同しない)。

  **(i) 容量ratio単独ゲート(合否判定の対象、本項が「容量ratioのengine実作用」の証明)**: 実際の3電池を比較するのではなく、`internalResistanceRatio`その他をすべて同一に固定し、`batteryCapacityRatio`の値**だけ**を差し替えた2run(または3run)で比較する。**v7: 土台をminimum-tier(アルミ線/フェライト/POM/アルカリ)+`RUNNABLE_BASE_CONFIG`へ変更**(旧v6の「V2回帰anchor(銅線)」は`RUNNABLE_BASE_CONFIG`下でも`failureToStart`になったため、2節のとおりアルミ線基準へ統一する)。

  ```typescript
  // minimum-tier(アルミ線/フェライト/POM/アルカリ)+RUNNABLE_BASE_CONFIGをcomposeした
  // 結果(internalResistanceRatio=1.0・capacityRatio=1.0)を土台にする。他のフィールドは
  // すべて同一のまま、batteryCapacityRatioの値だけを直接上書きする(実在しない
  // 「容量だけ変わる電池」を作る意図的な操作であり、実素材の組合せとしては存在しない。
  // internalResistanceRatioを意図的に変えずに固定することで、容量ratio単独の効果を分離する)。
  const composedAlkaline = composeConfigFromMaterials(RUNNABLE_MOTOR_CONFIG_TEMPLATE, RUNNABLE_CAR_CONFIG_TEMPLATE, RUNNABLE_BASELINE, MINIMUM_TIER_SELECTION);
  // composedAlkaline.motorConfig.batteryCapacityRatio === 1.0 (アルカリの較正値)
  const capacityOnlyBaseline = { ...composedAlkaline.motorConfig, batteryCapacityRatio: 1.0 };
  const capacityOnlyHigh = { ...composedAlkaline.motorConfig, batteryCapacityRatio: 1.3 }; // LiPoの較正値のみ拝借
  ```

  **17節の読み取り専用診断による事前確認値**: `capacityOnlyBaseline`(容量ratio=1.0)は`positionM=6.07m`で`energyExhausted`、`capacityOnlyHigh`(容量ratio=1.3)は`positionM=8.44m`で`energyExhausted`(8.44>6.07、条件(b)を満たす)。

  合格条件(v4: 両runの到達を明示、Suu_mot3必須修正2): (a) `capacityOnlyBaseline`(容量ratio=1.0)**と**`capacityOnlyHigh`(容量ratio=1.3、他のフィールドは`capacityOnlyBaseline`と完全に同一)の**両方**が、専用track上で`status: 'stalled'`かつ`failureCode: 'energyExhausted'`へ到達すること。**タイムアウト(`MAX_SIM_SECONDS_CAPACITY`到達)または`finished`になった場合、その値を比較に用いてはならない**(容量ratioの効果がまだ発火し切っていない、または逆に発火する前に走破してしまった可能性があるため)。(b) 両runとも(a)を満たした前提で、`capacityOnlyHigh`の`energyExhausted`到達時点の`positionM`(またはstep数)が、`capacityOnlyBaseline`より**厳密に大きい**こと。両run共通のseed(`SEED_CAPACITY_ONLY`、5節)を用いる。(c) 追加の健全性確認として、`computeBatteryCapacityRatioCalibration`がアルカリ・NiMHともに厳密に`1.0`を返すこと(較正値テーブルの事実確認、`materialMapping.test.ts`で既に固定済みだが本sweepの文脈でも明記する)を確認してよい。(a)が満たされない場合(いずれかのrunがタイムアウトまたは`finished`になる場合)は距離を増やして再実行し、それでも満たせない場合は13節の停止条件に従う

  **(ii) 実素材電池の総合結果(参考情報、Suu_mot3指摘により「容量単独の証明」とは呼ばない)**: **v7: 導線copper-standard/磁石ferrite/ギヤpomではなくアルミ線/フェライト/POM(minimum-tierの導線・磁石・ギヤ)を固定**し、電池のみ実際の3tier(アルカリ・NiMH・LiPo)を変化させて同じ専用trackを走らせる(3run共通のseed`SEED_BATTERY_SPECIES`、5節)。到達距離はアルカリ<NiMH<LiPoの順になる見込みで、**17節の読み取り専用診断で`positionM`がアルカリ6.07m<NiMH11.49m<LiPo17.47mと確認済み**。これは内部抵抗ratioの改善(アルカリ→NiMHで1.0→0.3)と容量ratioの増加(NiMH→LiPoで1.0→1.3)の複合効果であり、容量ratio単独の効果ではない。この総合結果はプレイヤーが実際に選択する3電池間の参考差として報告書へ記録するのみとし、(i)の合否判定には使わない
- **`energy-run`**(**v7: アルミ線/フェライト/POM(minimum-tier)構成**+電池軸のみ3通り、**参考情報のみ・ゲート対象外**): 実際のレース想定コースでの電池tier別完走可否・使用エネルギーを参考記録する。上記の専用capacity-check trackとは目的が異なる(専用trackは「容量ratio単独の効果を確実に発火させ検証する」ためのものであり、`energy-run`は「実コースでの参考結果」を残すのみで合否判定には使わない)。3run共通のseed`SEED_ENERGY_RUN_REFERENCE`(5節)を用いる
- **V2回帰anchor参考run(v8新設、Fable条件2(i)、`straight-10m`・**参考情報のみ・ゲート対象外**)**: `RUNNABLE_BASE_CONFIG`上でV2回帰anchor(銅線/フェライト/POM/アルカリ)を`straight-10m`で1回走らせ、完走可否と過熱レジームの有無を記録する。7.3節で判明した「銅線+フェライトはRUNNABLE_BASE_CONFIG下でも`overheated`になりやすい」という所見(中位ティアが最低ティアより脆い動作点の存在、spec §4.1のピーキーさに直結する実測知見、Fable指摘)を、ゲートとしてではなく参考記録として本sweepの出力に残すためのrunである。用途タグ`v2-anchor-reference`・専用seed`SEED_V2_ANCHOR_REFERENCE`(5節)を用いる。9節の(B)レポート要件を参照。

## 5. seed・決定論(v4: 用途別にseed規則を分離、Suu_mot3必須修正1)

固定シード`SEED = 0x900_2026`(既存スクリプトの命名規則`0x300_2026`等に倣う)。**単一変数の因果比較(比較ペア・比較系列)と、192通り全数の健全性走査とでseed規則を分ける**(Suu_mot3指摘: 異なるseedを使うと、チャタリング等の確率的系列差が素材差へ混入し、比較ゲートとして不正になる)。

- **192通り全数の健全性走査(`straight-10m`、7.1節のNaN安全性確認)**: 各comboごとに`SEED + comboIndex`を渡し、combo間で系列が重ならないようにする(`vehicleSweep.ts`の`SEED + motorIndex * 10_000 + carIndex`と同型の設計)。この走査はNaN・有限性の確認のみが目的であり、combo間の比較(単調性・トレードオフ)には使わないため、comboごとに異なるseedでよい
- **単一変数の因果比較(比較ペア・比較系列内は必ず同一seed)**: 次の4つの比較は、いずれも`stepTrackRun`(乱数を消費する)を経由するため、比較対象となるrun同士に**同一seed**を用いる(主軸192通りの走査とは別に、比較専用のrunとして個別に実行する。7節参照)
  1. 容量ratio単独比較(`capacityOnlyBaseline`容量ratio=1.0 vs `capacityOnlyHigh`容量ratio=1.3): 同一seed(`SEED_CAPACITY_ONLY`)
  2. 実素材電池3種比較(アルカリ・NiMH・LiPoを専用capacity-check trackで比較): 3run共通の同一seed(`SEED_BATTERY_SPECIES`)
  3. ギヤトレードオフ比較(POM vs チタン、`straight-10m`の`elapsedTimeS`/`energyUsedJ`、他3ファミリーはminimum-tierと同じアルミ線/フェライト/アルカリ固定、v7): 同一seed(`SEED_GEAR_TRADEOFF`)
  4. 破産防止minimum-tier対最上位構成の参考比較(`straight-10m`の`elapsedTimeS`比、7.4節): 同一seed(`SEED_TIER_COMPARISON`)
  加えて、`energy-run`参考走行(4節、実素材3電池)も参考情報の信頼性のため3run共通の同一seed(`SEED_ENERGY_RUN_REFERENCE`)を用いる
  5. **V2回帰anchor参考run(4節、v8新設、Fable条件2(i))**: 単独run(比較対象がないため「同一seed比較」の対象ではないが、他の比較専用runと同様の命名規則で専用seed`SEED_V2_ANCHOR_REFERENCE`を用いる)
- **seedを使わない比較(乱数非依存)**: 7.2節の導線・磁石・電池の写像パラメータ単調性確認は`computeElectricalState`/`computeCoggingTorque`をロック状態(θ固定・ω=0または任意固定値)で直接呼び出す純関数評価であり、`stepTrackRun`を経由しない。乱数を一切消費しないため、seedの指定自体が不要(Suu_mot3指摘どおり)

同一comboを複数シードで再実行する多シード分布分析(spec §6.3のボスタイム較正相当)は本Stepの対象外とする(Phase5のコンテンツ担当タスク)。

## 6. 実行時間(v2: 用語分離・自動短縮の禁止、Suu_mot3必須修正7/v4: 比較専用run追加により204runへ更新/v8: V2回帰anchor参考run追加により205runへ更新)

- **`MAX_SIM_SECONDS = 15`**(1runあたりのシミュレーション内時間上限。専用capacity-check trackは距離300mが長いため、これとは別に`MAX_SIM_SECONDS_CAPACITY = 120`程度を設ける。この間に`finished`/`stalled`/`derailed`/`overheated`のいずれにも到達しない場合は「未完走(タイムアウト)」として記録し、次のrunへ進む
- **`WALL_CLOCK_TARGET_S = 10`**(sweep全体の実時間目標。主軸192run(straight-10m全通り、`SEED + comboIndex`)+比較専用12run(5節: 容量ratio単独2run+実素材電池総合3run+ギヤトレードオフ2run+minimum-tier対最上位2run+`energy-run`参考3run、各比較グループ内は同一seed)+V2回帰anchor参考run1件(5節・9節、v8新設)=205run)。既存`vehicleSweep.ts`が同程度の呼び出し回数を数秒で終える実績があるため到達可能な見込みだが、**wall-clock超過時に`MAX_SIM_SECONDS`を自動短縮することは禁止する**(完走判定・容量ratio発火判定を壊しうるため)。超過は実測結果として報告書へ記載し、大幅な超過(目安10倍以上等)が生じた場合は13節の停止条件に従って計画を再提出する

## 7. 検証指標(`docs/phase2-plan.md` §15の4項目への対応)

### 7.1 項目1: NaN・負値・無限大の不在(v2: 検査範囲を強化、Suu_mot3必須修正6/v4: 対象run数を204へ更新/v8: 205へ更新)

- **compose段階**: 主軸192通り全件で`composeConfigFromMaterials`が`ok:true`を返すこと。**1件でも`ok:false`の場合は即座にゲート失敗とし、console報告のみで先へ進めない**(Suu_mot3指摘、v1の「継続」扱いを訂正)。**v7: 主軸192通りの土台MotorConfig/CarConfigを`REPRESENTATIVE_*`から`RUNNABLE_BASE_CONFIG`(2節)へ統一する**(Suu_mot3推奨、6節)
- **写像後の全数値フィールド**: `motorConfig`(`wireResistivityRatio`・`wireDensityRatio`・`magnetStrength`・`batteryInternalResistanceRatio`・`batteryCapacityRatio`)・`carConfig`(`gearEfficiency`・`massG`)のすべてが有限であること
- **最終stateの主要数値**: `stepTrackRun`実行後の`positionM`・`velocityMps`・`energyUsedJ`・`elapsedTimeS`・内部`motor`状態の`theta`・`omega`・`current`・`rpm`が、記録するすべての時点で有限であること
- **非負であるべき値**: `carConfig.massG`(既存clamp帯域`[80,250]`に収まること)・`energyUsedJ`・`elapsedTimeS`が非負であること

対象は主軸192run(straight-10m)+5節の比較専用12run(容量ratio単独2run・実素材電池総合3run・ギヤトレードオフ2run・minimum-tier対最上位2run・`energy-run`参考3run)+V2回帰anchor参考run1件(9節、v8新設)、計205run全件。

### 7.2 項目2: 写像パラメータレベルの単調性(エンジン出力での追認)

`wireResistivityRatio`・`magnetStrength`・`batteryInternalResistanceRatio`自体の単調性はすでに`materialMapping.test.ts`で厳密に固定済みであり、本sweepで再確認する対象ではない。本sweepが追加で確認するのは、**その単調性が実際のシミュレーション出力に単調な形で現れること**(写像パラメータレベルに限定し、ラップタイム等の総合性能の単調改善は主張しない、Fable指摘どおり)。基準構成は**V2回帰anchor**(2節)とする。

- 導線: 他3ファミリーをV2回帰anchor固定し導線のみ4tier変化させたとき、ロック状態(θ固定・ω=0)での瞬間電流(`computeElectricalState(config, theta, 0)`が返す`current`)が、抵抗率ratioの低下(アルミ→銅→銀メッキ銅線→銀)につれ単調に増加する
- 磁石: 他3ファミリーをV2回帰anchor固定し磁石のみ4tier変化させたとき、コギングトルク振幅(`computeCoggingTorque`のθ=π/4での絶対値、または1周期の最大絶対値)が、`magnetStrength`較正値の順序(フェライト0.2<アルニコ0.55<サマリウムコバルト0.65<ネオジム0.9)どおり単調に増加する(7.3節の項目3と表裏一体の指標)
- 電池: 他3ファミリーをV2回帰anchor固定し電池のみ3tier変化させたとき、ロック状態での瞬間電流が、`batteryInternalResistanceRatio`の低下(アルカリ→NiMH→LiPo)につれ単調に増加する

いずれも「写像パラメータ→単一フレームの物理量」という直接の効果のみを見る、ラップタイム等を経由しない狭い確認である。

### 7.3 項目3: 上位ティアの実在トレードオフ確認

- **磁石(確認できる)**: ネオジム(磁石強度最大)は、`straight-10m`をV2回帰anchor構成(他3ファミリーはV2回帰anchor)で走らせたとき、フェライトと比較してコギングトルク振幅が明確に大きい(7.2節と同じ指標の逆読み)。spec §7.1 D07(熱減磁)の物理的根拠と整合する定性的トレードオフ
- **ギヤ(確認できる、ただし`docs/phase2-plan.md` §15の例示との差異あり、暫定支持・Fable確認待ち)**: `docs/phase2-plan.md` §15はギヤの例として「チタンギヤでJ増が観測される」を挙げているが、2026-07-23時点の実装(Step2a `assumedGeometry.ts`)はギヤ材質を質量差分計算に含めていない(`computeWireMagnetMassAdjustmentG`は導線・磁石のみが対象)。したがって現行実装でチタンギヤの実在トレードオフは「質量(J)増」ではなく「`gearEfficiency`較正値の低下(1.00→0.90、Step3)」である。本sweepはこちらを確認する: チタンギヤ選択時、POM選択時と比較して`straight-10m`の`elapsedTimeS`が長い、または`energyUsedJ`が大きい。**v7: 他3ファミリーの固定材質をV2回帰anchor(銅線/フェライト/アルカリ)からminimum-tierと同じアルミ線/フェライト/アルカリへ変更**(2節、`RUNNABLE_BASE_CONFIG`下で銅線+フェライトはoverheatedになりやすいため)。両runは共通seed`SEED_GEAR_TRADEOFF`(5節)を用いる比較専用run。**17節の読み取り専用診断で事前確認済み**: POM(アルミ線/フェライト/アルカリ)は`elapsedTimeS=14.517s`・`energyUsedJ=122.982J`で`finished`、チタン(同条件)は`elapsedTimeS=14.733s`・`energyUsedJ=124.294J`で`finished`(両方とも所要時間・消費エネルギーともチタンが劣る)。この差異はassumedGeometry/engineを本Stepで変更せずそのまま報告し、**14節でSuu_mot3・Fableへ確認する**(§15の記述を更新するか、Step2bでギヤの質量寄与を追加するかは別途判断)
- **導線・電池(トレードオフなし、意図的な暫定不完全性)**: 2026-07-23時点の実装では、導線(銀線)・電池(LiPo)ともに現行写像上は物理的な負のトレードオフを持たない純粋な上位互換である(`materials.ts`の`BATTERY_MATERIALS`直前コメントに明記済みの「LiPoは低内部抵抗・高容量の純粋上位互換」と同型の状態が導線にも成立する)。導線の「軟らかく張力許容幅が狭い」(`materials.ts`の`wire-silver`の`descriptionJa`)という実在の弱点は、Phase4巻線記録方式で工作精度パラメータとして初めて表現される予定であり、Phase2のsweepでは検出できない。本sweepはこの不完全性を「バグ」としてではなく**明示的な既知の限界**として報告書へ記録する(9節)

### 7.4 項目4: 破産防止設計の物理的前提(v2: minimum-tier構成へ訂正、Suu_mot3必須修正1)

**合格条件(ゲート化)**: **破産防止minimum-tier構成**(2節: アルミ線・フェライト・POM・アルカリ)が、`straight-10m`を`finished`ステータスで完走すること(`stalled`/`derailed`/`overheated`/タイムアウトのいずれにもならない)。ブラシ(spec §5.4の最低ティア一式には銅板ブラシを含むが、2節のとおり未接続でconfigへ反映されない)は本合否判定に影響しない旨をcoverage gapとして明記する。

**`energy-run`を破産防止の必須条件にしない理由**: `energy-run`はエネルギー予算内での完走を要求する(効率が問われる)コースであり、spec §5.4が要求するのは「底辺構成で通常のレースが成立すること」(§5.1「序盤レースはこの構成で賞金がプラスになるよう設計」)であって、省エネ性能で上位に立つことではない。したがって`energy-run`でのminimum-tier構成の結果は4節のとおり**参考情報として報告するのみ**とし、破産防止premiseの合否判定には使わない。

**参考値**: 最上位構成(2節、gear-titaniumは7.3節のトレードオフにより意図的に除く)との`straight-10m`の`elapsedTimeS`比を報告する(具体的な許容比率の閾値は設けない、経済バランスはPhase5でsweepベースに調整するため)。両run共通のseed`SEED_TIER_COMPARISON`(5節)を用いる比較専用runとする。minimum-tier構成が**物理的に完走可能である**ことのみを本Stepのゲート合格条件とする。

**17節の読み取り専用診断で事前確認済み**: `RUNNABLE_BASE_CONFIG`下で、minimum-tier(アルミ線/フェライト/POM/アルカリ)は`elapsedTimeS=14.517s`で`finished`(ゲート合格)。最上位構成(純銀/ネオジム/PEEK/リポ)は`elapsedTimeS=7.425s`で`finished`(参考比: 約1.96倍)。

## 8. 進行の二段階・対象ファイル(v2: レポートをStep9範囲へ統合、Suu_mot3必須修正3・4)

`docs/phase2-plan.md` §16移行順9「`materialSweep.ts`実装・実行・結果まとめ(Phase2ゲート提出)」に従い、レポート作成を別Stepへ切り出さず同一Step9の提出物とする。ただし進行は次の二段階とし、**(B)は(A)の実測結果が出るまで着手しない(実測前の捏造禁止)**。

**(A) スクリプト実装・実行段階(本計画の承認対象)**:
- 新規: `scripts/materialSweep.ts`(既存`sweep.ts`/`vehicleSweep.ts`と同じ配置、engine/materialMapping.ts等の公開APIのみをimportする独立スクリプト)
- 新規: `tsconfig.material-sweep.json`(10節、型検査専用)
- 変更: `package.json`の`scripts`に次の2エントリを追加(既存`sweep`/`sweep:motor`と同型):
  - `"sweep:material": "vite-node scripts/materialSweep.ts"`
  - `"typecheck:material-sweep": "tsc -p tsconfig.material-sweep.json"`
- 出力(v5: Fable条件2・推奨1点への対応): 既存2本のsweepスクリプトと同じくconsole.logへ出力する(ファイルI/Oは行わない)。次の2点を追加する:
  1. **run単位の用途タグ・seed値の明記(Fable条件2)**: 各runの出力行に、5節で定義した用途(`health-scan`(192通り健全性走査)・`capacity-only`・`battery-species`・`gear-tradeoff`・`tier-comparison`・`energy-run-reference`・`v2-anchor-reference`(v8新設)のいずれか)とそのrunで使用した実際のseed値を含める(例: `[health-scan seed=0x900_2026+37] wire=... magnet=... ...`)。これにより(B)レポートから個々のrunがどのseedで再現可能かを追跡できる
  2. **機械可読なPASS/FAILサマリ(Fable推奨、alice裁量で採用する)**: 全run実行後、console出力の末尾に4ゲート項目(7.1 NaN安全性・7.2 単調性・7.3 トレードオフ・7.4 破産防止)それぞれのPASS/FAILを1行ずつ並べたサマリブロックを出力する(例: `GATE naN-safety: PASS` / `GATE monotonicity: PASS` / `GATE tradeoff: PASS` / `GATE bankruptcy-prevention: PASS`)。**採用理由**: 実装コストが低く(既存の判定結果を集計して出力するだけ)、Suu_mot3・人間がconsole出力全文を読まずに合否を機械的に確認できる利点が明確にコストを上回るため採用する

**(B) レポート化段階((A)の実測結果確定後に着手、この段階でのみ編集可能)**:
- 新規: `docs/phase2-material-sweep-report.md`((A)の実際のconsole出力・4ゲート結果を根拠に、7節の4項目・9節の既知不完全性を要約する。実測前に数値を仮置き・捏造しない)
- 変更(v5: Fable Q1への対応): `docs/phase2-plan.md` — §15の原文は書き換えず、**§15末尾へ日付入りの追記1行のみ**を加える: 「(2026-07-23追記)実装時点で写像が存在する4ファミリー(導線・磁石・ギヤ・電池)全組合せに確定、残り5ファミリー(coating・brush・substrate・roller・body)はcoverage gap。詳細は`docs/phase2-material-sweep-report.md`を参照」。これはdocs-only変更であり、(B)の一部として人間承認を得る(Step8のspec.md追記と同型の扱い)

(A)の完了後、Suu_mot3へ実測結果(4ゲート結果含む)を報告し、レポート化((B))着手の承認を得てから進める。

`src/materials/*`・`src/engine/*`・V2 UI/store・`scripts/sweep.ts`・`scripts/vehicleSweep.ts`はいずれも無変更。

## 9. 報告書((B))に記載する既知の不完全性

- ブラシファミリー(銅板ブラシ含む全4tier)は`materialMapping.ts`未接続であり、本sweepの対象外(2節・7.4節、coverage gap)
- coating・substrate・roller・bodyの4ファミリーも同様に未接続・対象外(1節)
- 電池ファミリーのトレードオフ(発熱・膨張・炎上・入手性)はPhase3・Phase5完了まで不完全(`materials.ts`既存コメント、Phase2ゲート§16移行順9番のオープン項目として既にSuu_mot3管理台帳で追跡中)
- 導線ファミリーの工作精度トレードオフ(張力管理の難度)はPhase4巻線記録方式まで不完全(7.3節)
- ギヤのJ増トレードオフ(spec §4.2「重い」)は現行実装で未接続、代わりに`gearEfficiency`低下(無潤滑摩擦のproxy、spec §4.2「かじる」)が実在のトレードオフとして機能している(7.3節、Fable承認済みQ2)。Phase2時点のチタンは「効率が落ちるだけの純粋下位互換」だが、これはLiPo純粋上位互換の鏡像であり、見返り(砕けない・D06歯欠けしにくさ)がPhase3に分割された意図的暫定状態である。**ギヤ質量・Jの接続はPhase3計画時にD06(歯欠け)とセットで判断するオープン項目**として、本報告書およびSuu_mot3管理台帳の両方に残す(本Stepの範囲外、新規Step2b相当は今回起こさない)
- **監査記録(v7、Suu_mot3指示)**: 「初期代表fixture(`REPRESENTATIVE_MOTOR_CONFIG`/`REPRESENTATIVE_CAR_CONFIG`)不適合→計画停止→`RUNNABLE_BASE_CONFIG`への再較正」の経緯を、16節・17節の内容を要約する形で報告書に記載する。当初のFAILログ(16節)は破棄せず、再現可能な参考記録として残す。この経緯はmaterialMapping.tsの不備ではなく代表fixtureの選定目的の違いに起因することを明記する
- **監査記録2(v10新設、Suu_mot3指示)**: 「(A)再実装後のギヤトレードオフゲート反転→`coilTurns`クランプ適用漏れの発見→限定修正」の経緯(18節)も、上記と同様に破棄せず報告書へ記載する。この経緯もmaterialMapping.ts等の不備ではなく`scripts/materialSweep.ts`側の契約誤認(`computeMaxTurns`の明示適用漏れ)に起因することを明記する

**物理的所見(v8新設、Fable条件2)**:

- **(i) 銅線+フェライトの過熱レジーム**: `RUNNABLE_BASE_CONFIG`下で、銅線(標準)+フェライトの組合せ(V2回帰anchor)は`status:'overheated'`になりやすい(7.3節・17節)。これはバグではなく、低抵抗の導線と弱い磁石(低い逆起電力)の組合せが、速度上昇による電流抑制が効く前に高電流状態を維持してしまう創発的な実挙動であり、spec §4.1のピーキーさ設計(上位素材ほど実在の癖を背負う)と直結する最初の実測知見として報告書へ明記する。「中位ティア(銅線)が最低ティア(アルミ線)より脆い動作点が存在する」という非直感的な事実を、素材ティア設計上の示唆として記録する。あわせて、V2回帰anchor参考run(4節、用途タグ`v2-anchor-reference`)の実測結果(完走可否・過熱の有無)を参考情報として1件記録する(ゲートにはしない)
- **(ii) POM対チタンの差が小さいこと**: 17節の診断値でPOM`elapsedTimeS=14.517s`・チタン`elapsedTimeS=14.733s`(差0.216秒、約1.5%)であり、チタンの`gearEfficiency`低下(1.00→0.90)による実走行への影響はこの動作点では軽微である。この事実は、Phase5の経済バランスsweepおよびPhase3のギヤ質量・J接続(D06とセット)判断の入力として報告書へ明記する

## 10. テスト計画・型検査ゲート(v3: strict追加・Node向け設定に訂正、Suu_mot3必須修正2)

`scripts/materialSweep.ts`は既存`sweep.ts`/`vehicleSweep.ts`と同様、専用のunit testファイルを設けない(スクリプトそのものは`npm run test`(vitest)の対象外という既存の慣行、`src/data/trackSweep.ts`側の共有ヘルパーのみが`trackSweep.test.ts`でテストされる先例と同型)。

**型検査ゲート(新設)**: `vite-node`は実行時トランスパイルであり型検査を行わないため、`npm run sweep:material`の実行成功だけでは静的型検査を代替しない。`scripts/`ディレクトリは`tsconfig.app.json`(`include: ["src"]`)・`tsconfig.node.json`(`include: ["vite.config.ts"]`)のいずれにも含まれず、`npm run build`では型検査されない(既存`sweep.ts`/`vehicleSweep.ts`と同じ既知の弱点)。この弱点を本Stepでは踏襲せず、新規`tsconfig.material-sweep.json`を追加する:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.material-sweep.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "types": ["node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["scripts/materialSweep.ts"]
}
```

`compilerOptions`は**`tsconfig.app.json`を基礎に、Node実行スクリプトとしてStep9では次の変更を加える**(v2の「意図的に同一」という説明はstrict追加後は不正確になるため訂正、Suu_mot3指摘):

- `types`: `["vite/client"]`→`["node"]`(ブラウザ向けVite型ではなくNode実行スクリプト向けの型を使う。`tsconfig.node.json`と同じ考え方)
- `lib`: `["ES2023", "DOM"]`→`["ES2023"]`(DOM APIはNode実行スクリプトで使わないため外す)
- `jsx`: 削除(スクリプトはJSXを含まない)
- `strict: true`を追加(Suu_mot3必須条件)

`module`/`moduleResolution`(`esnext`/`bundler`)・`verbatimModuleSyntax`・`allowImportingTsExtensions`等の**解決規則はtsconfig.app.jsonと同一に保つ**(既存`src/`配下の全ファイル・既存`scripts/sweep.ts`/`scripts/vehicleSweep.ts`が実際にこの規則(拡張子省略の相対import)で書かれ型検査を通っている実績があるため)。`tsconfig.node.json`の`module: "nodenext"`は、Node ESM向けの厳格なモジュール解決(相対importに拡張子を要求する等)を意味し、既存`scripts/`・`src/`の拡張子省略import記法と衝突するリスクがあるため、本Stepでは採用しない。新規依存パッケージは追加しない(既存`typescript`・`@types/node`のみで実行可能、`@types/node`は既存`devDependencies`に導入済み)。

もし`tsc -p tsconfig.material-sweep.json`が既存の`src/`側ファイル(engine/materials/materialMapping等)に対して新規のエラーを報告した場合(`strict: true`により、既存`tsconfig.app.json`では検出されなかった型の緩さがsrc側に見つかる可能性が理論上ある)、それは**本Stepのスクリプト側の書き方の問題としてのみ`scripts/materialSweep.ts`側で解消し、`src/`側の既存ファイルは変更しない**(0節の前提)。解消できない場合は13節の停止条件に従う。

4ゲートへは次の2点を追加する(12節):
1. `npm run typecheck:material-sweep`が成功すること(新設、本節)
2. `npm run sweep:material`を実際に実行し、エラーなく完走する(exit code 0)こと

`npm run lint`(oxlint、既定でプロジェクト全体を走査)は`scripts/`配下も対象に含まれる(既存`scripts/sweep.ts`・`scripts/vehicleSweep.ts`が現にlint対象になっていることを確認済み)ため、通常どおりlint成功を要求する。

## 11. Fableレビューの要否

本Step(A)はengine/・materialMapping.ts等の既存productionコードを一切変更しない(新規ファイル2本+`package.json`2行のみ)。`docs/phase2-plan.md` §16「engine変更を伴うステップ(5・6)は個別にFableレビューを経てから着手する」の対象外であり、Fable個別レビューは技術的には不要と判断できる。**ただし、Suu_mot3の判断により、7.3節のギヤトレードオフに関する§15例示との差異・4/9ファミリーへの縮減・4節の新設capacity-check trackの設計・7節のゲート指標設計をまとめてFableへ確認するため、v2はSuu_mot3確認後にFableレビューへ提出する**(14節)。

## 12. 4ゲート・実費

`npm run test && npm run build && npm run lint`に加え、10節のとおり`npm run typecheck:material-sweep`・`npm run sweep:material`の実行成功(いずれもexit code 0)を追加の確認項目とする。実費0 USD。

## 13. 停止条件

- sweep実施(計画・試作段階含む)の過程で、既存`materialMapping.ts`・engine/の関数を変更しないと検証できないことが判明した場合、直ちに停止し、該当変更を別件のFableレビュー対象として切り出す(0節)
- 7.3節のギヤトレードオフに関する解釈がSuu_mot3・Fableの確認で覆り、`assumedGeometry.ts`等の既存実装変更が必要と判明した場合(型定義変更ではなく既存アルゴリズムの変更であるため、engine非変更の前提が崩れる可能性がある)
- 4節の専用capacity-check trackで、300mを大幅に増やしても最上位構成(LiPo)が`energyExhausted`へ到達しない場合(トラック設計自体の見直しが必要になる可能性がある)
- 6節のwall-clock目標(10秒)を大幅に超過し(目安10倍以上)、`MAX_SIM_SECONDS`短縮以外の対処が必要な場合(短縮は完走・容量発火判定を壊すため採用できず、計画の再検討が必要になる)
- 10節の型検査ゲートが`src/`側の既存ファイルに新規エラーを報告し、`scripts/materialSweep.ts`側の書き方だけでは解消できない場合
- **(v8新設、Fable条件3)** 17節の読み取り専用診断はリポジトリ外の一時スクリプトによる再現であり、`scripts/materialSweep.ts`の実装との間に微差が生じうる。再実装後の実測値が17節の診断値と異なること自体は許容し数値を更新するが、**いずれかのゲート(7.1〜7.4・容量ratio単独ゲート)の合否判定(PASS/FAIL)が17節の診断結果から反転した場合は、続行・緩和せず直ちに停止しSuu_mot3へ報告する**(diagnostic上の精度は実装確認の代替ではないため)
- Suu_mot3レビューで不承認の場合

## 14. Suu_mot3・Fableへの確認事項

1. (1節)sweep対象を「4ファミリー全組合せ(192通り)、残り5ファミリーはsweep対象外・coverage gap」とする解釈は、`docs/phase2-plan.md` §15の「9ファミリー×代表ティア」という記述からの意図的な逸脱である。この解釈でよいか、それとも§15の記述自体を本Stepの結果を踏まえて更新するか
2. (7.3節)ギヤの実在トレードオフを「J増」ではなく「`gearEfficiency`低下」として確認する方針でよいか。ギヤの質量寄与(Step2b相当)を追加で実装すべきという判断であれば、本Stepの範囲を超えるため別途計画が必要になる
3. (7.4節)破産防止premiseの合格基準を「minimum-tier構成(アルミ線・フェライト・POM・アルカリ)がstraight-10mを完走できること」のみとし、`energy-run`は参考情報に留める整理でよいか。ブラシのcoverage gapの扱いは妥当か
4. (4節)専用capacity-check track(300m起点、実装時に実測調整)の設計、および「容量ratio単独ゲート(internalResistanceRatio等を固定し容量ratio値のみ差し替えた2run比較)」と「実素材電池の総合結果(参考情報)」を分離する合格条件でよいか
5. (8節)Phase2ゲート提出物としての`docs/phase2-material-sweep-report.md`をStep9の範囲に統合し、(A)実装・実行→(B)レポート化の二段階で進める整理でよいか
6. (10節)`tsconfig.material-sweep.json`による専用型検査ゲートの追加方針でよいか

## 15. まとめ

対象ファイルは(A)`scripts/materialSweep.ts`(新規)・`tsconfig.material-sweep.json`(新規)・`package.json`(2行追加)、(B)`docs/phase2-material-sweep-report.md`(新規、(A)の実測後)・`docs/phase2-plan.md`(§15末尾へ日付入り1行追記、(A)の実測後、v5)。既存`materials.ts`・`materialMapping.ts`・engine/・recipeCode・UI/storeはすべて無変更。新規依存パッケージの追加なし。実費0 USD。

## 16. (A)実測FAILの原文数値と根因(v7新設)

2026-07-23、v6承認・人間実装承認を得て(A)へ着手した。4ゲート(`npm run test`・`npm run build`・`npm run lint`・`npm run typecheck:material-sweep`)はすべて成功し、変更範囲も承認どおり3ファイルのみだった。しかし`npm run sweep:material`の実行で以下がFAILした:

```
健全性走査: 192件中192件がPASS
導線(ロック電流)単調性: PASS
磁石(コギング振幅)単調性: PASS
電池(ロック電流)単調性: PASS
磁石トレードオフ(ネオジムのコギング増加): PASS
ギヤトレードオフ(チタンのgearEfficiency低下が実走行で劣る): FAIL
minimum-tier完走: FAIL
容量ratio単独ゲート: FAIL

GATE nan-safety: PASS
GATE monotonicity: PASS
GATE tradeoff: FAIL
GATE bankruptcy-prevention: FAIL
GATE capacity-ratio-only: FAIL
wall-clock: 0.34s(目標10s)
```

詳細ログ(抜粋):
- V2回帰anchor(銅線/フェライト/POM/アルカリ): `status=stalled elapsedTimeS=1.442 energyUsedJ=1.597`
- minimum-tier(アルミ線/フェライト/POM/アルカリ): `status=stalled elapsedTimeS=1.208`
- ギヤトレードオフ比較(POM vs チタン、他3ファミリーV2回帰anchor固定): 両方とも`status=stalled elapsedTimeS=1.442 energyUsedJ=1.597`(**完全に同一の値**——ギヤ効率の差が現れる前に両方とも起動失敗しているため、比較として無意味だった)
- 容量ratio単独ゲート(V2回帰anchor+alkaline土台): 両run(容量ratio=1.0/1.3)とも`status=stalled failureCode=failureToStart positionM=0.03`(エネルギー枯渇ではなく起動失敗)
- 対照的に最上位構成(純銀/ネオジム/PEEK/リポ): `status=running`で15秒間動き続けた(`finished`はしていないが起動はできていた)

**根因**: `composeConfigFromMaterials`・素材較正値・`materialMapping.ts`の不備ではない。3節の`REPRESENTATIVE_MOTOR_CONFIG`/`REPRESENTATIVE_CAR_CONFIG`は`materialMapping.test.ts`で「compose関数の数値伝播にNaNが出ないか」を確認する目的だけで選ばれた値であり、実際にトラックを走行・完走できる車両として検証されたことは一度もなかった(既存smoke test 9a/9bもNaN不在しか確認していない)。`gearRatio=4`・`wheelDiameterMm=30`・`tireGrip=0.7`・`brushPressure=0.3`・`coilTurns=80`・`batteryVoltage=3`の組合せが、低ティア〜中位ティア素材(アルミ線・銅線標準+フェライト)では静止摩擦を超えるトルクを出せず、`status:'stalled'`・`failureCode:'failureToStart'`に陥っていた。

Suu_mot3が同一結果を再現し、停止判断を承認。選択肢(b)「完走ゲートを進捗ベースへ弱める」は不採用(spec §5.4の趣旨は「minimum-tierで通常レースが成立すること」であり、`finished`ゲートを維持すべきと判断)。選択肢(a)「実走行可能な共通基準構成へ差し替え」を採用し、17節の読み取り専用診断を経てv7を作成した。

## 17. 読み取り専用bounded診断の内容・結果(v7新設)

Suu_mot3指示により、次の制約のもとで診断を実施した: リポジトリ内へのファイル作成・編集・`package.json`変更・commitを一切行わない。診断スクリプトはセッションのスクラッチパスディレクトリ(リポジトリ外)に置き、`vite-node`で実行した(実行後も破棄、リポジトリは無変更)。素材較正値・engine定数は変更せず、非素材依存のMotorConfig/CarConfigフィールドのみを候補として選定した。

**探索方法**: `scripts/vehicleSweep.ts`の`MOTOR_CANDIDATES`(9候補の値をそのまま参照値として転記、`vehicleSweep.ts`自体はimportしない——importすると同スクリプト全体のsweepが副作用として即実行されるため)×`CAR_GRID`(`gearRatio`∈{2,4,7}・`wheelDiameterMm`∈{20,30,45}・`tireGrip`∈{0.4,0.7,1}・`centerOfMassHeightMm`∈{12,25,40}、`massG`はcomposeが上書きするため対象外)×`baseGearEfficiency`∈{0.9,0.8,0.74}(V2互換基準のfast/balanced/torque)の全2187通りを、「起動しやすいコーナー(低gearRatio・小径ホイール・高grip・低重心)から優先」の順で探索した。

**結果**: 604件目の試行(`MOTOR_CANDIDATES`の8番目、`gearRatio=4・wheelDiameterMm=30・tireGrip=1・centerOfMassHeightMm=12・baseGearEfficiency=0.9`)で、minimum-tierが`straight-10m`を`finished`できる組合せを発見した(2節の`RUNNABLE_BASE_CONFIG`)。

**追加検証(同一候補で実施)**:

| 検証項目 | 結果 |
|---|---|
| minimum-tier(アルミ線/フェライト/POM/アルカリ)on straight-10m | `finished` elapsedTimeS=14.517 energyUsedJ=122.982 |
| 最上位構成(純銀/ネオジム/PEEK/リポ)on straight-10m | `finished` elapsedTimeS=7.425 energyUsedJ=38.218 |
| V2回帰anchor+titanium(銅線/フェライト/チタン/アルカリ)on straight-10m | `overheated` elapsedTimeS=0.583(**銅線+フェライトは本候補でも過熱するため、7.3節の固定材質をアルミ線基準へ変更する根拠**) |
| gear-pom(アルミ線/フェライト/POM/アルカリ)on straight-10m | `finished` elapsedTimeS=14.517 energyUsedJ=122.982 |
| gear-titanium(アルミ線/フェライト/チタン/アルカリ)on straight-10m | `finished` elapsedTimeS=14.733 energyUsedJ=124.294(POMより遅く消費エネルギーも大きい、トレードオフ確認) |
| capacityOnlyBaseline(容量ratio=1.0)on capacity-check(300m) | `stalled` failureCode=energyExhausted positionM=6.07 elapsedTimeS=11.08 |
| capacityOnlyHigh(容量ratio=1.3)on capacity-check(300m) | `stalled` failureCode=energyExhausted positionM=8.44 elapsedTimeS=14.01(baselineより遠い、条件(b)を満たす) |
| battery-alkaline(アルミ線/フェライト/POM)on capacity-check(300m) | `stalled` failureCode=energyExhausted positionM=6.07 |
| battery-nickel-metal-hydride(同上) | `stalled` failureCode=energyExhausted positionM=11.49 |
| battery-lithium-polymer(同上) | `stalled` failureCode=energyExhausted positionM=17.47(アルカリ<NiMH<LiPoの順で単調増加) |

すべての必須条件(5)を満たすことを確認した。この診断結果に基づき、2節の`RUNNABLE_BASE_CONFIG`・7.3節の固定材質変更(アルミ線基準)を確定した。

## 18. (A)再実装後のゲート反転・原因診断(v10新設)

2026-07-23、v9承認を得て`scripts/materialSweep.ts`を`RUNNABLE_BASE_CONFIG`基準へ修正した。`npm run typecheck:material-sweep`(strict含む)は成功した。しかし`npm run sweep:material`実行の結果、7.3ギヤトレードオフゲートの合否が17節の診断(PASS想定)からFAILへ反転した:

```
GATE nan-safety: PASS
GATE monotonicity: PASS
GATE tradeoff: FAIL
GATE bankruptcy-prevention: PASS
GATE capacity-ratio-only: PASS
```

**17節診断値(想定)**: `gear-pom` finished `elapsedTimeS=14.517s`・`energyUsedJ=122.982J`、`gear-titanium` finished `elapsedTimeS=14.733s`・`energyUsedJ=124.294J`(チタンが遅く消費エネルギーも大きい=劣る、ゲートPASS)。

**実装後の実測値**: `gear-pom` finished `elapsedTimeS=14.633s`・`energyUsedJ=51.614J`、`gear-titanium` finished `elapsedTimeS=14.475s`・`energyUsedJ=49.711J`(チタンの方が速くエネルギーも少ない=優る、ゲートFAIL)。`energyUsedJ`が診断値の半分以下という大幅な乖離が生じている。

**原因診断**: `RUNNABLE_MOTOR_CONFIG_TEMPLATE`の`coilTurns: 110`に付したコメント「`computeMaxTurns(0.8, 1)`によりengine側で37へ自動クランプされる」は**誤り**である。`computeMaxTurns`(`motorPhysics.ts`)は独立したヘルパー関数であり、`computeRCoil`・`computeJ`・`backEmf`計算等は`config.coilTurns`の値をそのまま使う(内部で自動クランプする仕組みは存在しない)。呼び出し側が明示的に`Math.min(coilTurns, computeMaxTurns(wireGaugeMm, parallelStrands))`を適用する契約であり、`scripts/vehicleSweep.ts`の`MOTOR_CANDIDATES`も実際にこの明示クランプを行っている。17節の読み取り専用診断スクリプトは`vehicleSweep.ts`と同じ`.map((c) => ({ ...c, coilTurns: Math.min(c.coilTurns, computeMaxTurns(c.wireGaugeMm, c.parallelStrands)) }))`を正しく適用しており(`coilTurns`は実質37)、これが17節の診断値の根拠だった。一方、`scripts/materialSweep.ts`の実装では、この明示クランプを適用し忘れ、`coilTurns=110`(`wireGaugeMm=0.8`・`parallelStrands=1`に対して物理的に無効な巻数)のまま`composeConfigFromMaterials`・`stepTrackRun`へ渡していた。これにより17節診断と実装後実測とで全く異なる物理構成(コイル抵抗・慣性・逆起電力係数が異なる)を測定してしまい、ギヤトレードオフの方向性まで反転する結果となった。**engine/・materialMapping.ts等は無関係**であり、`scripts/materialSweep.ts`側の契約誤認(クランプの適用漏れ)が原因である。

**限定修正方針**: `RUNNABLE_MOTOR_CONFIG_TEMPLATE`の`coilTurns`定義を、`scripts/vehicleSweep.ts`と同型の明示クランプ`Math.min(110, computeMaxTurns(0.8, 1))`へ修正する。他のフィールド(`slitWidthMm`・`sandingQuality`・`brushPressure`・`magnetDistanceMm`・`batteryVoltage`・`axisOffsetMm`・`wireGaugeMm`・`parallelStrands`・`varnished`)・`RUNNABLE_CAR_CONFIG_TEMPLATE`・`RUNNABLE_BASELINE`・素材較正値・engine定数は変更しない。誤ったコメントも「明示的にクランプを適用する(`vehicleSweep.ts`と同型)」へ訂正する。

**再実行手順**: 修正適用後、(1)`npm run typecheck:material-sweep`成功を確認、(2)`npm run sweep:material`を全再実行、(3)結果を17節の診断値(`coilTurns=37`前提の値)と照合する。数値の乖離自体(diagnostic自体がリポジトリ外の一時スクリプトによる再現であるため、環境差等による微差)は許容するが、**いずれかのゲートが再度反転する、または別の新規乖離(想定外の`ok:false`・非有限値等)が生じた場合は、続行・緩和せず直ちに停止しSuu_mot3へ報告する**(13節と同じ規律)。

**再実行結果(v11、人間再承認・限定修正適用後)**: `npm run typecheck:material-sweep`成功、`npm run sweep:material`成功(exit code 0)。5ゲートすべてPASS(`nan-safety`・`monotonicity`・`tradeoff`・`bankruptcy-prevention`・`capacity-ratio-only`)。17節診断値と完全一致: `gear-pom` finished `14.517s`/`122.982J`、`gear-titanium` finished `14.733s`/`124.294J`、minimum-tier finished `14.517s`、top-tier finished `7.425s`、容量ratio単独ゲート`positionM=6.07m`/`8.44m`、実素材電池参考`6.07m`/`11.49m`/`17.47m`。ゲート反転・新規乖離なし。`v2-anchor-reference`参考run(9節)は`status=overheated`(`elapsedTimeS=0.508s`、過熱レジーム所見どおり、比較対象の事前診断値は取得していないため乖離判定の対象外)。4ゲート(`npm run test`747件全通過・`npm run build`成功・`npm run lint`成功・`git diff --check`成功)も確認済み。変更scopeは`scripts/materialSweep.ts`のみ(`tsconfig.material-sweep.json`・`package.json`は無変更)。**commitはSuu_mot3のコードレビュー完了まで未実施**。

---

以上、v11は(A)限定修正・再実行が完了し、全ゲートPASS・17節診断値と完全一致した状態を反映した計画です。Suu_mot3のコードレビュー確認後にcommitします。(B)レポート化・`docs/phase2-plan.md`追記は(A)確認後の別承認です。今回のゲート反転FAILログ(18節)は破棄せず、最終(B)レポートへ監査記録として残します。
