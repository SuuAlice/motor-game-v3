# P4-1C R2-A `advanceMotorState` 依存閉包追加・arbiter再確認依頼

依頼日: 2026-08-31  
依頼者: `Suu_mot3`  
実装基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **計画外波及を検出し、R2-A編集0件で停止。arbiter追加裁定待ち**

## 0. 既承認範囲

人間プロジェクトリードは2026-08-31、次の原文でR2-A着手を承認した。

> R2-A着手承認します

既承認契約はS-A options objectを`step` / `stepVehicle` / `stepTestRun` / `stepTrackRun`の4関数へrequiredで導入し、`nextDeformState`へ`coilDeformOmegaRadS`を渡すものだった。精査済み閉包は18ファイル135呼出し、追加契約追随込み既存24ファイル上限、期待値リテラル無変更、P4-0 scenario 13 assert無変更、`COIL_DEFORM_OMEGA`単一出典、R2-A再基準化0である。

## 1. alice_mot3障害報告全文

【MotorGameV3 / alice_mot3】R2-A着手直後に**計画外波及1件**を検出したため、編集せず停止・報告します

R2-Aの編集は**0件**です（現在のworktree差分はC1受入済みの5ファイルのみ）。着手前の実測で、承認された契約だけでは**実装が成立しない**ことが分かりました。

### 検出事項: 閾値の到達先が`advanceMotorState`の内側にあります

承認契約はrequired optionsを**`step` / `stepVehicle` / `stepTestRun` / `stepTrackRun`の4関数**とし、「`nextDeformState`にはrequired scalarを渡す」としています。しかし実測した呼出し鎖はこうです。

```text
motorPhysics.ts:625  step(config, state, dt, options)
  └→ :633  advanceMotorState(config, state, evaluation, dt, rng, loadTorque, effectiveInertia)   ← ここが閾値を運べない
       ├→ :575  nextDeformState(0, varnished, …)          ← 静止摩擦クランプ経路
       └→ :605  nextDeformState(omegaNew, varnished, …)   ← 通常経路
```

**`nextDeformState`の呼出しは2箇所とも`advanceMotorState`（554〜620行）の内側にあります**（`step`の直下ではありません）。したがって`step`にoptionsを足しても、`advanceMotorState`のシグネチャを変えない限り閾値は`nextDeformState`へ届きません。

さらに`advanceMotorState`は**二段API（`evaluateMotorFrame` / `advanceMotorState`）の一方**で、engine凍結方針§2が明示的に凍結対象として挙げている公開APIです。承認文の4関数には含まれていません。

**`advanceMotorState`の呼出し（実測10件、新規ファイルは0）**

```text
production  src/engine/vehiclePhysics.ts:267 / :497 / :523        (3)
production  src/engine/motorPhysics.ts:633                        (1、step内部)
test        src/engine/__tests__/motorPhysicsSplitApi.test.ts:102 / :117 / :176   (3)
test        src/engine/__tests__/motorPhysics.test.ts:571 / :588 / :589           (3)
```

**4ファイルすべて承認済み24ファイルの中にあり、25ファイル目は発生しません**。増えるのは呼出し件数で、**135 → 145呼出し**になります。なお`evaluateMotorFrame`は`nextDeformState`を呼ばないため、**変更不要**です（実測確認済み）。

### 選択肢

#### (A) 推奨: `advanceMotorState`も同じS-A形へ

```ts
export function advanceMotorState(
  config: MotorConfig,
  state: SimState,
  evaluation: MotorFrameEvaluation,
  dt: number,
  options: MotorStepOptions,
): SimState
```

`step`と同じ`MotorStepOptions`を使い回すため新しい型は増えません。required維持なので**構築不能**の性質が保たれ、arbiterがB-required/S-Aを採った理由（恒久の穴を作らない・数値同士の転置を型で防ぐ）がそのまま当てはまります。追加は**10呼出し・新規ファイル0**です。

#### (B) `advanceMotorState`だけ省略可能引数（既定`COIL_DEFORM_OMEGA`）にする

4関数はrequiredでも、**公開されている二段APIの側に恒久の穴が残ります**。`advanceMotorState`は`vehiclePhysics`が3箇所で直接呼んでおり、将来の呼出し元も同じ経路を使います。arbiter判定■2の理由付け（監査は列挙に依存し、列挙は将来に対して不完全）がそのまま該当するため、**推奨しません**。

#### (C) `MotorConfig`へ閾値を複製

承認文が明示的に禁止している（「`MotorConfig`へ同値fieldを複製しない」）ため**不可**です。

### alice_mot3確認事項

1. (A)を採り、required options対象を5関数（`step` / `advanceMotorState` / `stepVehicle` / `stepTestRun` / `stepTrackRun`）へ拡張してよいか。
2. 閉包を18ファイル145呼出し（新規ファイル0、追加契約6ファイルを含む上限24ファイルは不変）へ訂正してよいか。
3. `advanceMotorState`は二段API凍結対象である。変更目的はD01閾値の単一出典化（engine凍結方針§2(b)破壊モード状態機械）に限り、二段APIの意味・分割・戻り値は変えないが、凍結APIのシグネチャ変更として追加裁定が必要か。

編集・実装・commit・tag・push・deployはいずれも行っていません。

## 2. Suu_mot3独立確認

2026-08-31、基点worktreeで次を再確認した。

- `nextDeformState`の2呼出しは`advanceMotorState`内（`motorPhysics.ts:575,605`）。
- `step`から`advanceMotorState`への1呼出しは`motorPhysics.ts:633`。
- `advanceMotorState`の直接呼出しは上記4ファイル10件で一致。
- 4ファイルはすべて既承認24ファイル内で、新規ファイルは不要。
- `evaluateMotorFrame`の変更は不要。
- R2-A production/test編集は0件。見えている変更は受入済みC1だけ。

## 3. arbiterへ求める追加裁定

1. 推奨案(A)を採用し、`advanceMotorState`も既存`MotorStepOptions`のrequired optionsへ移すことを承認するか。
2. required対象を4関数から5関数、実呼出し閉包を18ファイル135件から**同じ18ファイル145件**へ訂正してよいか。
3. これはengine凍結方針§2(b)を実施するためのシグネチャ追随に限定し、二段APIの意味・分割・戻り値を不変とする条件で凍結規律に適合するか。
4. 既判定の受入条件5点、既存24ファイル上限、新規production/testファイル0、再基準化0、全検証、R2-SWEEP/R3およびGit/deploy禁止をすべて維持するか。
5. このdeltaは人間の再承認を要するか。要する場合、再承認文へ明記すべきexact条件を省略せず提示してほしい。

正式回答受領まではR2-Aを停止する。

## 4. 中継記録

- 2026-08-31 02:51 JST: 障害報告全文と追加裁定5点を`arbiter_mot3`へagmsg送信。ストア記録確認済み。
- 2026-08-31: 正式回答未受領のため再通知。R2-A編集0件・停止を維持。

## 5. arbiter_mot3正式回答全文

【arbiter_mot3 正式回答／P4-1C R2-A追加裁定（advanceMotorState閉包追加）】

### 受領確認

alice障害報告全文+Suu独立確認を読了。編集0件での停止・実測付き報告は規律どおり。呼出し鎖の実測（nextDeformStateの2呼出しがadvanceMotorState内〈motorPhysics.ts:575/605〉・stepからの委譲は:633・直接呼出し10件4ファイル・evaluateMotorFrameは非該当）は、私が前判定で読んだ実装基準コードの構造と整合しており、承認契約の4関数だけでは閾値がnextDeformStateへ届かないという結論は正しい。

### 裁定1

**案(A)を採用する。** advanceMotorStateも既存MotorStepOptionsのrequired optionsへ移す（新規型0）。案(B)は却下——advanceMotorStateはvehiclePhysicsが3箇所で直接呼ぶ公開二段APIであり、そこにoptional既定値を置くことは、私がB-required/S-Aを採った理由（監査は列挙に依存し将来に不完全・恒久の穴を作らない）がそのまま該当する最悪の位置である。案(C)は既承認文の明示禁止どおり不可。

### 裁定2

**閉包訂正を承認する**——required対象4→5関数、実呼出し18ファイル135→145件（新規ファイル0、上限24ファイル不変）。人間承認文には訂正系譜を1行で残すこと（「1ファイル→153→135→145（advanceMotorState内包の検出による）」——数字の無言差し替えをしない、従来どおり）。

### 裁定3

**凍結規律に適合する（条件付き）。** §2が凍結するのは二段APIの構造（evaluate/advanceの分割・意味・energyUsedJ・決定論）であり、本変更はD01状態機械の閾値単一出典化（§2(b)）という限定目的の下でシグネチャへ搬送引数を通すものである。deform状態遷移はもともとadvanceMotorState内に住んでおり、閾値の搬送先としてこの関数は構造上最も自然な位置にある。**条件**: (i)二段APIの意味・分割・戻り値・evaluateMotorFrame不変（実測済みのとおり）。(ii)deform遷移ロジックの移動を伴わない（シグネチャ搬送のみ）。(iii)options化に乗じた他パラメータの意味変更を同一deltaで行わない（既判定■判定(3)-4と同じ）。

### 裁定4

**全維持。** 受入条件5点（期待値リテラル凍結・P4-0 13assert無変更・COIL_DEFORM_OMEGA単一出典・目的限定・実効性fixture）、24ファイル上限、新規production/testファイル0、R2-A再基準化0、全検証、R2-SWEEP/R3およびGit/deploy禁止——いずれも変更なし。

### 裁定5

**人間再承認を要する。** 人間が承認したR2-A原文は対象を4関数と明記しており、5関数目の追加——しかもそれが二段API凍結対象——は承認範囲の実質変更である。再承認文に明記すべきexact条件: 「R2-Aのrequired options対象をstep/advanceMotorState/stepVehicle/stepTestRun/stepTrackRunの5関数へ拡張する（advanceMotorStateは二段API凍結対象だが、変更はD01閾値搬送のシグネチャ追随に限り、二段APIの意味・分割・戻り値・evaluateMotorFrameは不変）。実呼出し閉包は同一18ファイル145件（訂正系譜: 1ファイル→153→135→145）、新規ファイル0・24ファイル上限・期待値リテラル無変更・P4-0 13assert無変更・COIL_DEFORM_OMEGA単一出典・再基準化0を維持する。」

再承認受領までR2-A停止の継続に同意する。arbiter_mot3はコード・docs編集・Git操作を行っていない。以上、正式回答として送信し停止する。

## 6. 人間再承認記録

2026-08-31、人間プロジェクトリードが次の全文でR2-A追加裁定を承認した。

> P4-1C R2-A追加裁定を承認します。required options対象をstep / advanceMotorState / stepVehicle / stepTestRun / stepTrackRunの5関数へ拡張します。advanceMotorStateは二段API凍結対象ですが、変更はD01閾値搬送のシグネチャ追随に限定し、二段APIの意味・分割・戻り値・evaluateMotorFrame、deform遷移ロジックは変更しません。実呼出し閉包は同一18ファイル145件（訂正系譜: 1ファイル→153→135→145）、新規ファイル0、24ファイル上限、期待値リテラル無変更、P4-0の13assert無変更、COIL_DEFORM_OMEGA単一出典、R2-A再基準化0を維持します。

この承認によりR2-Aの追加deltaだけを解禁する。既承認の受入条件5点、旧snapshot補完契約、全test・build・lint・3 sweep・2 sweep型検査・diff check・禁止差分監査を維持し、結果提示後に停止する。R2-SWEEP、R3、spec/art-spec、commit、tag、push、deploy、PR、mergeは引き続き未承認である。

## 7. 実装完了時に検出した期待構造1行・arbiter追加確認依頼

2026-08-31、R2-Aは既存24ファイル内で実装・検証を完了した。リレー報告は106 files / 2726 tests成功、build・lint・既存sweep 3種成功、挙動差分0である。ただし次の既存テスト1行が、受入条件「期待値リテラル無変更」への該当可否を確認するため停止した。

対象: `src/materials/__tests__/materialMapping.test.ts` の `assembleDestructionConfig` 厳密構造比較。

```diff
- expect(config.d01).toEqual({ decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5 });
+ expect(config.d01).toEqual({ decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5, coilDeformOmegaRadS: COIL_DEFORM_OMEGA });
```

事実:

- 既存の期待数値`1000`と`0.5`は変更していない。
- 新規production値・再基準化値を置いていない。追加値は承認済み単一出典`COIL_DEFORM_OMEGA`の参照である。
- `DestructionConfig.d01`へrequired fieldを追加したため、`toEqual`による厳密構造契約を維持するにはキー追加が必要である。
- 旧期待objectをそのまま`toEqual`すると、正しい新規required fieldが余剰キーとなりテストは失敗する。
- `toMatchObject`への弱化やキー除外は厳密構造回帰を弱めるため採っていない。
- R2-Aの挙動値を新値へ合わせる再基準化ではなく、承認済み構造追加への機械追随である。

arbiterへ確認する事項:

1. 既判定の「期待値リテラル無変更」は、物理・決定論・較正の既存期待**値**を再基準化しない条件であり、このrequired構造キー1件の追加はその条件を満たすと判定してよいか。
2. 上記1行を現在の厳密`toEqual`のまま維持する案を承認するか。
3. 人間再承認が必要か。必要ならexact承認文を提示してほしい。

正式回答まではR2-A受入を停止し、コード追加編集、R2-SWEEP/R3、spec/art-spec、commit、tag、push、deploy、PR、mergeを行わない。

## 8. arbiter正式確認（期待構造1行）

2026-08-31、arbiter_mot3から次の訂正再送を正式回答として受領した。直前メッセージは識別子3箇所が脱落していたため、以下を正とする。

> 【arbiter_mot3 訂正再送／直前21:07頃のメッセージは送信不具合で識別子3箇所が脱落——本文を正とする】R2-A期待構造1行の裁定: 該当行の変更は受入条件「期待値リテラル無変更」に違反しません。理由: 同条件の意図は「数値期待の再基準化を機械追随へ混在させない」ことであり、d01への新field追加に伴う厳密構造比較(toEqual)への新規行追加は、値の再基準化ではなくschema追随です。この追随は追補B-3が「d01リテラルfixture追随候補」として materialMapping.test.ts を事前列挙していた範囲そのものです。条件2点: (i)既存2リテラル(decayExposureScaleRad: 1000 / minEffectiveTurnsRatio: 0.5)は無変更のまま、追加は coilDeformOmegaRadS の1行のみ。(ii)追加行の期待値は数値リテラルの複製ではなく COIL_DEFORM_OMEGA 定数のimport参照とする(単一出典規律。テスト慣行上import不可の場合のみexactリテラル+出典コメント可)。この2点を満たす当該1行の変更を承認し、R2-Aの停止を解除してよい。実装完了報告(106 files/2726 tests・build・lint・sweep 3種・挙動差分0)の受領も確認しました。停止を継続します。

現物diffは2条件を満たしている。したがって期待構造1行は既承認範囲内のschema追随として受入れ、R2-Aを通過とする。次工程R2-SWEEPは別途人間着手承認まで停止する。

## 9. 受入レビュー時のコメント整合delta・人間承認

受入レビューで、R2-Aのシグネチャ変更後も旧説明が残るコメントを2ファイル3箇所で検出した。productionロジック・型・テスト・docsには影響せず、コメント7行を実装どおりの13行へ置換するexact案をalice_mot3が提示した。

2026-08-31、人間プロジェクトリードが次の全文で承認した。

> P4-1C R2-Aコメント整合deltaを承認します。motorPhysics.tsとdestructionOrchestration.tsの計3箇所について、dev提示のexact置換案どおりコメント7行を13行へ置換してください。変更はコメントのみとし、productionロジック・型・テスト・docsその他は変更しないでください。R2-SWEEP以外の禁止事項は維持します。

この承認で解禁するのは、alice_mot3が2026-08-31T06:15頃に提示したexactコメント置換3件だけである。
