# P4-1C R3（C3張力破断）arbiter補足レビュー依頼

作成日: 2026-09-01  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
人間承認: `docs/phase4-p4-1c-r3-human-reapproval-bundle.md`のR3-D1〜D8全文  
状態: **arbiter補足レビュー待ち。production/test実装、sweep、commit、tag、push、deployは禁止**

## 1. 正式性

人間プロジェクトリードは次の文面で承認した。

> P4-1C R3実装前統合裁定R3-D1〜D8全文、およびarbiter補足照会への着手を承認します。

レビュー対象の承認済み全文は`docs/phase4-p4-1c-r3-human-reapproval-bundle.md`であり、同文書を省略せず本依頼と一体で読むこと。R3-D1〜D7は人間確定事項であり、補足レビューはその是非を再選択するものではない。R3-D8に従い、整合確認と未確定の蓄積式・有限sweep境界を判定する。

## 2. 判定依頼

### A. reducer入口とreset境界

`WindingStepAction`へ`{ readonly kind: 'wireBroke' }`を1種だけ追加し、`winding`から`broken`へ入る。`broken`から受理するactionは既存`reset`だけとし、`discardBroken`、理由union、専用reset action、途中継ぎは追加しない。この入口1種が、既承認の「破断後は既存resetだけ」と矛盾しないか判定する。

### B. 在庫留保なし境界

破断turn `N`はrecordへ含めずprefix `N−1`を保持し、線材は`computeConsumedWireM(N, parallelStrands)`だけ消費する。巻線上限は物理・schema・在庫上限の最小値`N`で、上限到達後に`N+1`本目を試行させない。在庫1ターン留保を置かず、`brokenTurnCount <= turnLimit`をstoreで再検証する境界が矛盾なくfail-closedか判定する。

### C. store成功後のlocal同期とH7原子性

UIは素材ID、並列本数、破断turn数だけをstore Result actionへ渡す。storeが現在在庫を読み、永続化成功後だけmemory在庫を更新し、`ok:true`を返す。UIはその直後だけlocal reducerへ`wireBroke`を同期dispatchする。`ok:false`ではdispatchせず、在庫・工程stateとも不変である。この既存同型境界でH7の原子性を満たすか、また追加のstore永続stateやschema変更なしで成立するか判定する。

### D. 素材非依存の最小蓄積式候補

素材別許容値は採用しない。入力はcanonical recordの0..256張力量子値だけとし、極端な高張力の継続だけを危険側へ作用させる。ランダム即死、時刻、ポインタ速度、反応時間QTE、正解帯ゲージ、張力ムラ、位置、素材、被膜、D10を第二入力にしない。この条件で成立する、単調・決定論的・説明可能な最小蓄積式候補をexact式、初期値、更新順、clamp、発火条件、prefix保持条件まで提示する。正当化できない値をproduction候補へ昇格させない。

### E. read-only有限sweep計画

Dの式候補が成立する場合だけ、repo編集なしのread-only有限sweepを提示する。次を全文で固定する。

- 入力格子と候補値の有限集合
- record長、張力量子値、並列本数、素材、seedその他の固定値
- 破断turn、非発火、prefix長、消費turn数等の出力
- 高張力継続が低張力より早く破断する単調傾向
- 通常操作域は非発火、極端な高張力継続だけが有限turn内で破断する受入条件
- 境界直前・直後、上限turn、在庫ちょうど、不足、2本並列の負例
- 候補なし、非単調、通常域発火、第二入力が必要、素材別仮定が必要になった場合の停止条件

sweep実行はまだ未承認である。arbiterは計画と候補だけを提示し、実行・repo編集・production値採用を行わない。

## 3. 維持する禁止事項

production/test実装、sweep実行、spec/art-spec確定変更、engine、materials.ts、save schema、canonical E2、MC4、recipeKey v2、D10、被膜、asset、音、新色、新D番号、図鑑、保存field、物理軸、sweep基盤、commit、tag、push、deploy、PR、mergeは禁止する。レビュー回答はblocking条件、non-blocking申し送り、次に必要な人間再承認範囲を明示して停止する。
