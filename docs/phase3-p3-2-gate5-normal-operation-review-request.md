# P3-2ゲート5補足裁定依頼: Q14(Q13-2「通常運用」の対象電池別適用範囲)

作成: alice_mot3(2026-08-09)。本書はP3-2ゲート5(overheated保留規則実装)の受け入れ証跡是正過程(Suu_mot3レビュー必須是正P2)で判明した、Q13-2裁定(通常運用の正式定義)の適用範囲に関する契約上の曖昧性について、正式Fable補足裁定を依頼するものである。

**pitfalls#1遵守の明記**: 本書はalice_mot3が作成した**依頼文のみ**であり、Fableの回答を自ら生成したものではない。正式なFable回答は、人間プロジェクトリードの直接提示、またはSuu_mot3が中継したものだけを正式回答として扱う(`AGENTS.md`/`CLAUDE.md` pitfalls#1)。本書のQ14への回答は、Suu_mot3経由で正式ルートから受領するまで、いかなる形でも自己生成・代筆しない。

**Q14はGate5をブロックする。** 該当する2テストは回答が届くまで赤(失敗)のまま固定する(閾値・production値は変更していない)。Gate6・commit/tag/pushは引き続き禁止。

---

## 背景・Q13-2原文の該当箇所

正式Fable補足裁定(P3-2ゲート5、2026-08-09T05:29、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)Q13-2は、「通常運用で非到達」の正式定義として次を確定した(`docs/phase3-p3-2-plan.md` 14.3節に自己完結反映済み、原文要旨):

> 基準構成(`NORMAL_OPERATION`基準): 素材={copper-standard, neodymium, pom, **対象電池**}、player値すべて既定、攻め入力なし——条件1の構成を正式契約として固定する。
> 第1条件(実在コース完走): `src/data/tracks.ts`の実在プレイアブル**全コース**を基準構成で自然完走し、finished・破壊イベントゼロ・D04 stage none・D07 droop/irreversibleなし。**予算有効コースではmaxEnergyUsedRatio ≤ 0.85**(unsafeDischargeStartRatio 0.90に対する設計マージン0.05)。energy-runの実測0.807は既に適合している。

裁定原文は「対象電池」を明示的に変数として扱っている一方、`maxEnergyUsedRatio ≤ 0.85`の適合実証は`battery-lithium-polymer`(LiPo)の実測(0.807)のみを根拠にしていた。ゲート5是正版でこの条件を全電池(alkaline/NiMH/LiPo)×実在全5コースへ拡張実測した結果、alkaline・NiMHがenergy-runで0.85を超過することが判明した(下記appendix参照)。

---

## 全15組合せ実測表(全文、要約なし。2026-08-09計測、DT=1/120s、rng=()=>0.5固定)

素材選択: {wire: 'wire-copper-standard', magnet: 'magnet-neodymium', gear: 'gear-pom', battery: 対象電池}、player値すべて既定。destructionConfigは対象電池のprofileに応じ`mapD04BatteryDestructionConfig`(lipo)または`mapD03DestructionConfig`(nonLipo)経由で構築(いずれも実写像関数、値の手打ちなし)。

| コース(hasEnergyBudget) | 電池 | finalStep | status | eventCount | maxEnergyUsedRatio | D04 stage | D07 droop/irreversible |
|---|---|---|---|---|---|---|---|
| straight-10m(false) | alkaline | 2919 | finished | 0 | 0.6627222153495657 | N/A(nonLipo) | false/false |
| straight-10m(false) | NiMH | 2656 | finished | 0 | 0.6293847739447244 | N/A(nonLipo) | false/false |
| straight-10m(false) | LiPo | 2576 | finished | 0 | 0.5397765259772096 | none | false/false |
| hill-climb(false) | alkaline | 3945 | finished | 0 | 1.1045591102773815 | N/A(nonLipo) | false/false |
| hill-climb(false) | NiMH | 3355 | finished | 0 | 0.9514052021377244 | N/A(nonLipo) | false/false |
| hill-climb(false) | LiPo | 3085 | finished | 0 | 0.7382535465675194 | none | false/false |
| curve-balance(false) | alkaline | 2919 | finished | 0 | 0.6627222153495657 | N/A(nonLipo) | false/false |
| curve-balance(false) | NiMH | 2656 | finished | 0 | 0.6293847739447244 | N/A(nonLipo) | false/false |
| curve-balance(false) | LiPo | 2576 | finished | 0 | 0.5397765259772096 | none | false/false |
| rough-board(false) | alkaline | 2970 | finished | 0 | 0.6743848981828331 | N/A(nonLipo) | false/false |
| rough-board(false) | NiMH | 2694 | finished | 0 | 0.6388339075209862 | N/A(nonLipo) | false/false |
| rough-board(false) | LiPo | 2574 | finished | 0 | 0.5378967881824391 | none | false/false |
| **energy-run(true)** | **alkaline** | 4365 | finished | 0 | **0.9970256771300775** | N/A(nonLipo) | false/false |
| **energy-run(true)** | **NiMH** | 3988 | finished | 0 | **0.9337832895233851** | N/A(nonLipo) | false/false |
| energy-run(true) | LiPo | 3848 | finished | 0 | 0.8072783879089134 | none | false/false |

**15組合せ全てが「finished・破壊イベントゼロ・D07 droop/irreversibleなし」に適合し、LiPoは全コースでD04 stage='none'に適合している。不適合は太字の2件(energy-run×alkaline、energy-run×NiMH)の`maxEnergyUsedRatio ≤ 0.85`条件のみである。**

参考(予算無効コースでの同種の観測、本条件の対象外): hill-climb×alkalineは`maxEnergyUsedRatio=1.1046`(>1.0)であり、仮にこのコースが将来予算有効化された場合、alkalineは同種の不適合を起こす可能性が高い。

---

## 原因(構造的、値の誤りではない)

`maxEnergyUsedRatio`の分母は`computeEnergyBudgetJ(motorConfig)`であり、`motorConfig.batteryCapacityRatio`に依存する。この値は素材写像の較正値であり(人間再承認済み、`materialMapping.ts`の`BATTERY_CAPACITY_RATIO_CALIBRATION`):

```
alkaline: 1.0
nickel-metal-hydride: 1.0
lithium-polymer: 1.3
```

同一コース・同一走行構成であれば消費Joule量(分子)はほぼ同一だが、分母(電池容量)が小さいほど比率は高くなる。したがってalkaline/NiMHがLiPoより高い`maxEnergyUsedRatio`を示すのは、この人間再承認済み較正値の物理的に正しい帰結であり、sweep実測やcompose関数の不具合ではない。

より根本的には、**`0.85`という閾値自体が`unsafeDischargeStartRatio`(0.90)への設計マージンであり、`unsafeDischargeStartRatio`はD04(リポ過放電経路)固有の契約値である**。D04はリポ専用のモード(`BatteryDestructionProgress`判別unionにより`nonLipo`ではD04自体が構造的に存在しない、`src/engine/destructionModes.ts`)であるため、nonLipo電池に`0.85`(D04の閾値から導出された値)を適用すること自体に、物理的な参照先がない。

---

## 裁定を依頼する選択肢

**(a、Suu_mot3推奨)** 一般条件(finished・破壊イベントゼロ・D07 droop/irreversibleなし)は全電池×全コースで維持する。予算条件を電池の物理型別に分離する:
- LiPo(D04過放電経路が存在する): 現行どおり`maxEnergyUsedRatio ≤ 0.85`。
- nonLipo(alkaline/NiMH、D04過放電経路が構造的に存在しない): `energyExhausted`前に自然完走すること(`ratio < 1.0`)を要求する(D04固有の0.85マージンではなく、電池が physically 空にならないことそのものを条件とする)。

この案では現行の実測(表参照)が全15組合せで適合する。**これは閾値の弱体化ではなく、D04の閾値をそもそも持たない物理型(nonLipo)へ、その物理型に存在する契約(energyExhausted)で正しく物差しを分離するものである。**

**(b)** `0.85`を全電池へ維持したまま、`energy-run`の設計またはbatteryCapacityRatio較正値を変更する。**却下推奨理由**: batteryCapacityRatioはPhase 2人間承認済みの共有較正値であり、他の多数のsweep・受け入れ条件がこれに依存する。`energy-run`のコース設計もPhase 2/Phase 3を通じた既存資産である。D04固有のGate5がこれらへ波及的変更を加えるのは道具として不適切。

**(c)** 「実在プレイアブル全コース×対象電池」の基準をLiPoのみへ限定する。**却下推奨理由**: これはD03(nonLipo)側の「通常運用で構造的に非到達」という既存確認(Q13-2第2条件「構造型」の一部)の対象電池カバレッジを失う。

**(d)** その他(Fableの判断による代替案)。

---

## 依頼する裁定事項

1. **採用案**: (a)〜(d)のいずれを採用するか。
2. **人間再承認の要否**: Q13-2は正式Fable裁定により「docs反映+Suu_mot3照合で足りる」とされた定義であり(人間再承認対象はoverheated保留規則の1点のみ、`docs/phase3-p3-2-plan.md`§14.7)、Q13-2自体は人間再承認済みではない。採用案がこのQ13-2の適用範囲精密化(電池物理型別に明確化するのみで、既存の閾値・数値を変更しない)にとどまり同じ手続き(docs反映+Suu_mot3照合)で足りるか、それとも新たな契約変更として人間再承認を要するか。
3. **Fable再提出の要否**: 回答反映後にテストが全緑(15/15適合)になった場合、`docs/phase3-p3-2-gate5-calibration-review-request.md`のD03/D04較正確定と同様の手順(Fable再提出不要、Suu_mot3照合で足りる)で扱ってよいか。

---

## 検証環境・再現手順

実測値は`src/materials/__tests__/materialMapping.test.ts`の`describe('Q13-2通常運用確認(NORMAL_OPERATION基準構成、実在プレイアブル全コース×全電池、計画14.3節)')`で再現可能。実行コマンド:

```
npx vitest run src/materials/__tests__/materialMapping.test.ts -t "Q13-2"
```

15テスト中13成功・2失敗(energy-run×alkaline、energy-run×NiMH)、2026-08-09時点。production値(`materialMapping.ts`のstageDurations・batteryCapacityRatio較正値等)・テスト内の閾値(`0.85`)はいずれも本裁定依頼の作成にあたり一切変更していない。
