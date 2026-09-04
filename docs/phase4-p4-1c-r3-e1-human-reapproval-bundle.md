# P4-1C R3-E1 人間再承認バンドル

作成日: 2026-09-01  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
根拠: `docs/phase4-p4-1c-r3-arbiter-supplement-review.md`  
状態: **2026-09-01人間再承認済み。read-only sweep実行中。production/test実装・Git/deployは禁止**

人間プロジェクトリード承認原文:

> P4-1C R3 arbiter補足レビュー判定全文、Cのnon-blocking注記、およびR3-E1有限バンドル（超過張力累積式、T_SAFE/E_BREAK 25候補のread-only sweep、破断ターン式floor(E_BREAK/x)+1、銅854 cN非外挿）を承認します。

## 1. 承認対象

次の有限バンドルだけを承認対象とする。

1. R3-D1〜D6に対するarbiter整合判定A〜C全文。blockingなし。
2. non-blocking注記: store永続化成功とlocal `wireBroke` dispatchの間でクラッシュした場合、線材消費を維持しreload後は新ロットから始まる意味論をdocsへ記録する。
3. 素材非依存の「超過張力の累積疲労」式候補。
4. 25候補のread-only有限sweep計画。

## 2. exact式候補

```text
excess_i = max(0, tension_i - T_SAFE)
exposure_0 = 0
exposure_i = exposure_{i-1} + excess_i
破断条件 = exposure_i > E_BREAK
```

- `T_SAFE ∈ (0,1)`、`E_BREAK > 0`は素材非依存のdesignAssumption。
- 判定はrecord追加前。破断turnはrecordへ含めずprefixを保持し、破断turnを含む線材を消費する。
- 全ターン`tension <= T_SAFE`なら構造的に非破断。
- 緩いターンで累積を回復・resetしない。
- 乱数、時刻、速度、反応時間、位置、ムラ、素材、被膜、D10を入力しない。
- 累積量はprefixと候補ターンから純関数で導出し、永続field・save schemaを追加しない。
- 銅854 cNは現象存在の参考だけとし、`T_SAFE`への数値換算や他素材への外挿を行わない。

## 3. sweep計画

候補は次の25組である。

```text
T_SAFE ∈ {200/256, 208/256, 216/256, 224/256, 232/256}
E_BREAK ∈ {1.0, 2.0, 3.0, 4.0, 6.0}
```

入力は一定張力33点×長さ3種、最大張力1..150ターン、最大/0交互、並列1/2の消費負例、等号と+1量子の境界fixtureに限定する。出力は破断有無、破断ターン、prefix長、消費ターン数、候補別破断ターンである。

一定超過量`x > 0`の最初の破断ターンは`floor(E_BREAK / x) + 1`を正とする。

受入条件:

1. 安全域は全長・全候補で非破断。
2. 最大張力持続は150ターン以内に破断する候補がある。
3. 張力増加に対して破断ターンが単調非増加。
4. 等号は非破断、+1量子超過で破断。
5. 交互入力で累積が回復しない。
6. 在庫ちょうど・不足・並列2倍消費が既存契約どおり。

候補なし、非単調、安全域発火、第二入力または素材別仮定が必要になった場合は停止する。

## 4. 今回解禁する範囲

承認後に解禁するのは、repoを編集しないread-only有限sweepの実行と、non-blocking注記のdocs追随だけである。結果提示後に停止し、推奨1案・代表代替・全受入結果・選定理由をR3-E2として人間へ再提示する。

production/test実装、production係数採用、spec/art-spec、engine、materials.ts、save schema、canonical E2、MC4、recipeKey v2、D10、被膜、asset、音、新色、新D番号、図鑑、保存field、物理軸、sweep基盤、commit、tag、push、deploy、PR、mergeは禁止を維持する。
