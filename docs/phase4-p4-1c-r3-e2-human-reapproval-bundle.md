# P4-1C R3-E2 production値・実装 人間再承認バンドル

作成日: 2026-09-01  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
根拠: `docs/phase4-p4-1c-r3-e1-sweep-report.md`、`docs/phase4-p4-1c-r3-e1-boundary-arbiter-decision.md`  
状態: **2026-09-01人間再承認済み。限定production/test実装中。Git/deployは禁止**

人間プロジェクトリード承認原文:

> P4-1C R3-E1受入条件(d)のarbiter補足裁定全文、およびR3-E2有限バンドルを承認します。

## 1. 正式採用候補

```text
T_SAFE = 224/256 = 0.875
E_BREAK = 4

excess_i = max(0, tension_i - T_SAFE)
exposure_i = sum(excess_1 ... excess_i)
破断条件 = exposure_i > E_BREAK
```

- 両定数は素材非依存の`designAssumption`。
- 累積はprefixと候補turnから純関数で毎回導出し、永続field・save schemaを追加しない。
- 判定はrecord追加前。破断turnはrecordへ含めずprefixを保持し、破断turnを含む線材を消費する。
- 緩いturnで累積を回復・resetしない。
- 銅854 cNは現象存在の参考だけとし、数値換算・他素材への外挿を行わない。

## 2. sweep受入結果

1. 安全域全長非破断: 全候補・全長で発火0件。
2. 最大張力150turn以内破断: 25/25候補で成立。
3. 張力増加時の破断turn単調非増加: 違反0件。
4. 境界述語:
   - `exposure == E_BREAK`は非破断。
   - `T_SAFE + 1/256`は増分が正となり、理論上有限turnで破断する。
   - +1量子に150turn以内の実破断は要求しない。実用到達性は条件2が担う。
5. 最大/0交互入力で累積回復なし: 累積減少0件。
6. 在庫ちょうど・不足・並列2倍消費: 既存契約どおり。
7. floatと1/256整数計算: 破断有無・破断turnの不一致0件。
8. 明示停止条件: 全不該当。

採用候補の最大張力持続は33turn目で破断し、prefix32turn、消費33turnとなる。30turn級は最大張力でも完成でき、50/80/150turnでは張力配分が必要になる。安全域だけでC1占積利益の87.5%を無リスクで得られ、危険域は最後の12.5%となる。最大/0交互では65turn目に破断し、回復規則なしで「引きっぱなし」の危険が現れる。

## 3. 代表代替と不採用理由

- 保守側: `T_SAFE=232/256`, `E_BREAK=6`。最大張力65turn。常用30〜50turnで現象に出会いにくいため不採用。
- 攻撃側: `T_SAFE=216/256`, `E_BREAK=2`。最大張力13turn。最大張力が実質使えず、調整より禁止に近くなるため不採用。
- +1量子を150turn以内に破断させる格子外`E_BREAK <= 0.586`: 最大張力で約3turnの即死設計となり、ゲーム上の「気付けるが即死ではない」条件と衝突するため不採用。

## 4. 承認後に解禁する実装範囲

`docs/phase4-p4-1c-r3-human-reapproval-bundle.md`のR3-D1〜D6と、本書のexact式・production定数のproduction/test実装だけを解禁する。

- `wireBroke`入口action 1種。
- 在庫1turn留保なし、store権威の`resolveWindingTurnLimit`一本化。
- 通常の任意破棄と破断後の既存`reset`を分離。
- prefixから消費turn表示を導出。
- store Result action 1点による原子的な線材消費。
- store成功後、local dispatch前にクラッシュした場合は線材消費を維持し、reload後は新ロットから始める。
- UIは既存巻線図・既存`role="status"`・通常buttonだけを使う。
- 対応テスト、全test、build、lint、通常型検査、Phase 4型検査、禁止差分監査を実施する。

R3-D7の素材別破断値不採用は維持する。R3-D8の未確定事項は本承認によりexact式・値だけを返済する。

## 5. 継続禁止

spec/art-spec確定変更、engine、materials.ts、save schema、canonical E2、MC4、recipeKey v2、D10、被膜、asset、音、新色、新D番号、図鑑、保存field、物理軸、sweep基盤、追加sweep、commit、tag、push、deploy、PR、mergeは禁止を維持する。実装結果後に停止し、正式受入レビューとGit操作の別承認へ戻す。
