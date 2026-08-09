# P3-2ゲート5較正裁定依頼: Q13-1〜Q13-3(v4)

作成: alice_mot3(2026-08-09、v4)。本書はSuu_mot3のP3-2ゲート5レビュー(2026-08-09、初回P1〜P5指摘→v1提出後の必須追補6点指摘→v2提出後の提出前最終追補4点指摘→v3提出後の最終照合での意味論是正1点指摘)を受け、production-valid構成での再sweepで判明した構造的な対立・未確定事項について、正式Fable技術レビューへの補足裁定を依頼する文書である。

**pitfalls#1遵守の明記**: 本書はalice_mot3が作成した**依頼文のみ**であり、Fableの回答を自ら生成したものではない。正式なFable回答は、人間プロジェクトリードの直接提示、またはSuu_mot3が中継したものだけを正式回答として扱う(`AGENTS.md`/`CLAUDE.md` pitfalls#1)。本書のQ13-1〜Q13-3への回答は、Suu_mot3経由で正式ルートから受領するまで、いかなる形でも自己生成・代筆しない。

**v4での変更点(Suu_mot3のv3最終照合での意味論是正1点。契約・裁定選択肢・構造的対立の結論は変えない、証跡の正直さのみの修正)**:
1. `feasibility()`harnessが、production契約(burning到達=destructionTerminal、Phase3-Q2「既存物理終了後に継続stepしない」)に反して、burning成立後もstepを継続しoverheatedAtStepを測定していた。これにより、成立行(stageS=0.05)で「burningAtStep=19の後にoverheatedAtStep=21」という、実runでは同時に到達しない2値を1行に同居させてしまっていた。
2. harnessをburningまたはoverheatedの最初の終端でstepを停止するよう是正し、burningAtStepとoverheatedAtStepが相互排他になるようにした——成立行は例外なく`overheatedAtStep: null`(burning到達でstepが止まるため構造的に到達しない)、不成立行は`burningAtStep: null`のまま(従来どおり)。
3. `burningBeatsOverheat`の判定式を`burningAtStep !== null && overheatedAtStep === null`という相互排他な式に変更した(21行の実測でtieは発生していない)。
4. 表1〜表3・関連コメント・Appendix Aの該当値を「実際にそのrunで到達した値」へ同期した。不成立行のoverheatedAtStep(21または19)は、そのentry timingでD04が介入しなかった場合に実際にこの電池物理が到達する終端stepであり、これ自体は同一run内で実測された値である(成立させるにはD04の2段階合計がそのstepより前に完了する必要がある、という時間予算の議論として引き続き有効)。

**v3での変更点(Suu_mot3提出前最終追補4点の反映、参考として保持)**:
1. epsilon単一出典違反を是正——`materialMapping.test.ts`が独自に複製していた`DURATION_COMPARISON_EPSILON_S_FOR_TEST`を削除し、`destructionModes.ts`所有の`DURATION_COMPARISON_EPSILON_S`をexport化のうえ直接importする方式へ統一した(新規定数ではなく既存定数の可視性追加のみ、契約・物理変更なし)。
2. `pvMotorCar`のfixture builderをOmit方式(fail-open)からPick方式の許可リスト(fail-closed)へ変更——`motorOverrides`は`coilTurns`/`magnetDistanceMm`/`brushPressure`/`slitWidthMm`の4キー、`carOverrides`は`gearRatio`/`tireGrip`の2キーのみへ型レベルで閉じた(Appendix D更新)。
3. Appendix A(M4)・Appendix B(D07)を文字通りの「全文」へ拡張——条件1・条件3の写像後config全文、条件2のfinalStep/maxEnergyUsedRatio/finalD04Stage、条件3のfinalStep/maxEnergyUsedRatio/finalD04Stage/shortThresholdAtStep/runawayAtStep/burningInitiatingCauseを追加(M4)。D07条件2の正確なirreversibleAtStep(=36、初回版は「最終的に発生」としか書いていなかった)、条件1〜4全てのterminatedAtStep/finalStatus/droopAtStep/irreversibleAtStep/overheatedAtStep/minGauge/maxGauge/finalGaugeを統一表で追加(D07)。
4. Q2 fixtureの表現をファイル内で完全に統一——「production-validな状態として直接seed」という残存していた不正確な記述を「production-valid motorConfigを用いたschema-valid test-only isolated state」へ統一し、Appendix Cも同じ表現に揃えた。production自然到達(D07条件2)とisolated効果測定(Q2)の役割分担を明記した。

**v2での変更点(Suu_mot3必須追補6点の反映、参考として保持)**:
1. 「理論上最速entry」という事実誤認を訂正——`shortCircuitDurationLimitS=0.01秒`は固定dt(1/120秒≈0.00833秒)より大きく、triggerはstep1であり最速ではなかった。真に最速のentry(`1e-9秒`、trigger成立はstep0)の実測行を追加し、short閾値到達stepの算出方法もadvance後の実`destructionState.shared.shortCircuitDurationS`から求める方式へ訂正した。
2. Q13-3を「Gate 5をブロックしない将来原則の参考質問」と明記した。
3. Q13-1に既存裁定(Phase 3正式Fable「§15重点質問Q2」)の引用を追加し、これとP3-2独自のQ2(D07 RPM低下)を版・対象で明確に区別した。案(a)の記述誤り(「1段階1フレーム」→正しくは「0.05秒=60fpsで3描画フレーム」)を訂正した。
4. Q13-2の案(c)を論理的に正しいAND条件へ訂正し、OR条件は偽陰性リスク明記のうえ別案として提示した。
5. 是正証跡appendix(P1・P3・P4・P5の実測全文)を追加した。

---

## 背景

P3-2ゲート5(M4到達可能性・D07 Q11受け入れ条件・Q2独立sweep、`docs/phase3-p3-2-plan.md`v13 §3.3・§2.5)の初回実装(2026-08-08)は、Suu_mot3レビューでP1〜P5の5点を要修正として差し戻された。P1(production-valid fixture方針違反)・P3(通常運用の定義)・P4(D07非空虚性)・P5(Q2定常性)はテストコードの修正のみで是正できたが、**P2(D04段階時間とUI識別可能性の衝突)は候補値の変更では解決できない構造的な対立であることが、production-valid構成での再sweepにより判明した**。本書はこの対立の裁定(Q13-1)、通常運用の定義確認(Q13-2)、および現時点では非ブロッキングの参考質問(Q13-3)をFableへ依頼するものである。

---

## Q13-1: D04段階時間とUI識別可能性の構造的対立

### 契約の確認

- **M4到達可能性条件(3)**(計画v13 §3.3、正式Fable裁定範囲): 短絡構成では既存の`overheated`終端(`batteryHeat >= BATTERY_HEAT_LIMIT`)より先に`burning`へ到達できること。
- **UI識別可能性**(`docs/art-spec.md`「7. アニメーション時間規律」): 「ロジックは60fps、スプライトアニメは12fps格子(5フレーム毎)に載せる」。1段階(swelling/smoking)が最低でもこの12fps格子1個(5描画フレーム@60fps=1/12秒≈0.0833秒)以上持続しないと、人間が識別可能な症状アニメーションとして提示できない。
- **UI計画6-A**(`docs/phase3-ui-autopsy-plan-v5.md`§6-A): D04膨張・発煙段階は非終端の走行中HUD症状表示であり、UIはengine側の`DestructionState`を読み取り専用で参照するのみで、独自の閾値判定・独自の物理計算を行わない。
- **spec §1.2**: 「現象は隠さない」という難易度哲学。
- **既存裁定(Phase 3正式Fable技術レビュー、`docs/phase3-fable-review.md`「§15重点質問」Q2、`docs/phase3-plan-v12.md`804行目に「正式Fable Q2回答」として確定採用済み)**: 「**D04が既存物理終了後に継続stepしない**」——「膨張・発煙は電流・熱入力に駆動される段階であり、物理step停止で駆動項が消える。自己持続的熱暴走はburning到達のみが表現し、burningは即終端であるため走行後の時間発展を必要としない」。`energyExhausted`と`destructionTerminal`が同一run内で排他になる帰結も含む。**この「Q2」はPhase 3統合計画v12レビュー時の§15質問リスト固有の番号であり、本書が別途参照するP3-2独自の質問リスト内「P3-2-Q2」(D07可逆ダレによる定常RPM低下の観測可能性、`docs/phase3-p3-2-plan.md`§2.5)とは版・対象ともに完全に別物である。以下、前者を「Phase3-Q2(D04即終端)」、後者を「P3-2-Q2(D07 RPM低下)」と明示して区別する。**

### 発見した対立

held-short(持続短絡)構成で、entry timingを固定したまま、D04がburningへ到達するのに十分なだけ`stageDurations`を短くしなかった場合(不成立行)、この電池物理は**production-valid構成(LiPo電池、`battery-lithium-polymer`の内部抵抗ratio=0.15固定)で、離散時間シミュレーションとして達成可能な真に最速のentry(1フレーム目でtrigger成立)でも、19フレーム(0.158秒)でoverheatedへ到達し走行が凍結する**(これは実際にそのrunで到達した値——D04が間に合わなかった場合の実測終端)。

D04の状態機械が`swelling`→`smoking`→`burning`の2段階分の遷移(`stageDurations.swellingS + stageDurations.smokingS`)をこの時間予算の中で完了できれば、burningがoverheatedより先に成立しstepはburning側で止まる(その場合overheatedAtStepは構造的にnullになる——production契約上、burning到達後は既存物理が継続stepしないため)。12fps格子1個(0.0833秒)を1段階の最小可視時間とすると、2段階の合計最小可視時間は0.1667秒になる。

以下のfeasibility実測表(全文、要約なし。テストコード`src/materials/__tests__/materialMapping.test.ts`の「D04段階時間feasibility」describe内で数値回帰として固定済み。**最終是正〈v4〉: harnessはburningまたはoverheatedの最初の終端でstepを停止するよう修正済みであり、以下の値はすべて実際にそのrunで到達した値である。成立行のoverheatedAtStepは`null`——burning到達でstepが止まるため、この設定のまま走行を続けた場合にoverheatedへ到達するかどうかは、この表からは主張しない**)のとおり、**entry timingをどれだけ早めても、1段階あたり12fps格子1個以上を確保した構成は例外なく`overheated`に間に合わない**。

#### 表1: entry=現行候補(shortCircuitDurationLimitS=0.05秒・runawayHeatThreshold=0.3)

production-valid構成(`wire-copper-standard`・`magnet-neodymium`・`gear-pom`・`battery-lithium-polymer`、held-short〈`slitWidthMm:0`〉、DT=1/120秒固定、rng=()=>0.5固定、2026-08-09計測〈v4是正後〉。short閾値到達stepはadvance後の実`destructionState.shared.shortCircuitDurationS`をproduction本体〈advanceD04〉と同じepsilon比較〈+1e-9>=limit〉で判定。burningまたはoverheatedの最初の到達でrunを停止するため両者は相互排他):

| stageS(秒) | short閾値到達step | runawayHeatThreshold到達step | swelling到達step | smoking到達step | burning到達step | overheated到達step | burningがoverheatedより先か |
|---|---|---|---|---|---|---|---|
| 0.0500 | 5 | 7 | 7 | 13 | 19 | null(burning到達でstep停止、到達しない) | **成立** |
| 0.0833(5/60、12fps格子1個) | 5 | 7 | 7 | 17 | null(未到達) | 21 | 不成立 |
| 0.1000 | 5 | 7 | 7 | 19 | null(未到達) | 21 | 不成立 |
| 0.2500 | 5 | 7 | 7 | null(未到達) | null(未到達) | 21 | 不成立 |
| 0.5000 | 5 | 7 | 7 | null(未到達) | null(未到達) | 21 | 不成立 |
| 1.0000 | 5 | 7 | 7 | null(未到達) | null(未到達) | 21 | 不成立 |
| 2.0000 | 5 | 7 | 7 | null(未到達) | null(未到達) | 21 | 不成立 |

#### 表2: entry=早期候補(shortCircuitDurationLimitS=0.01秒・runawayHeatThreshold=0.01、**sub-dtではない**——固定dt=1/120秒≈0.00833秒より0.01秒の方が大きいため、triggerはstep1成立であり最速ではない。参考データとして残す)

同構成、2026-08-09計測〈v4是正後〉:

| stageS(秒) | short閾値到達step | runawayHeatThreshold到達step | swelling到達step | smoking到達step | burning到達step | overheated到達step | burningがoverheatedより先か |
|---|---|---|---|---|---|---|---|
| 0.0500 | 1 | 0 | 1 | 7 | 13 | null(burning到達でstep停止、到達しない) | **成立** |
| 0.0833(5/60、12fps格子1個) | 1 | 0 | 1 | 11 | null(未到達) | 19 | 不成立 |
| 0.1000 | 1 | 0 | 1 | 13 | null(未到達) | 19 | 不成立 |
| 0.2500 | 1 | 0 | 1 | null(未到達) | null(未到達) | 19 | 不成立 |
| 0.5000 | 1 | 0 | 1 | null(未到達) | null(未到達) | 19 | 不成立 |
| 1.0000 | 1 | 0 | 1 | null(未到達) | null(未到達) | 19 | 不成立 |
| 2.0000 | 1 | 0 | 1 | null(未到達) | null(未到達) | 19 | 不成立 |

#### 表3(v2追加): entry=真に最速(shortCircuitDurationLimitS=1e-9秒・runawayHeatThreshold=1e-9、validatorが要求する「正の有限数」の下限に近い値。1フレーム目〈shortThresholdAtStep=0〉でtrigger成立し、離散時間シミュレーションとしてこれ以上早いentryは構造的に存在しない)

同構成、2026-08-09計測〈v4是正後〉:

| stageS(秒) | short閾値到達step | runawayHeatThreshold到達step | swelling到達step | smoking到達step | burning到達step | overheated到達step | burningがoverheatedより先か |
|---|---|---|---|---|---|---|---|
| 0.0500 | 0 | 0 | 0 | 6 | 12 | null(burning到達でstep停止、到達しない) | **成立** |
| 0.0833(5/60、12fps格子1個) | 0 | 0 | 0 | 10 | null(未到達) | 19 | 不成立 |
| 0.1000 | 0 | 0 | 0 | 12 | null(未到達) | 19 | 不成立 |
| 0.2500 | 0 | 0 | 0 | null(未到達) | null(未到達) | 19 | 不成立 |
| 0.5000 | 0 | 0 | 0 | null(未到達) | null(未到達) | 19 | 不成立 |
| 1.0000 | 0 | 0 | 0 | null(未到達) | null(未到達) | 19 | 不成立 |
| 2.0000 | 0 | 0 | 0 | null(未到達) | null(未到達) | 19 | 不成立 |

### 結論

離散時間シミュレーションとして達成可能な真に最速のentry(表3、1フレーム目でtrigger成立、これより早いentryは存在しない)でも、結果は表1・表2と定性的に同じである——不成立行はいずれもD04が2段階を完了できずoverheated(step19〈表2・表3〉または21〈表1〉)で走行が凍結する。stageSを0.05秒(3描画フレーム@60fps、12fps格子未満)まで削らない限り、D04はこの時間予算内でburningまで到達できない。**現行の`overheated`終端規則(`batteryHeat >= BATTERY_HEAT_LIMIT`で即座に走行を凍結する)と現行のheat物理式(held-short時のI²R発熱)のままでは、D04の各段階に12fps格子1個以上を割り当てることと、M4条件(3)〈burningがoverheatedより先に成立すること〉は両立不可能である**。これは候補値のチューニングでは解決しない構造的な対立であり、以下いずれかの契約変更が必要と考えられる。

### 裁定を依頼する選択肢

**(a) 0.05秒(12fps格子未満)を時間圧縮として受容する**
- 内容: D04のswelling/smokingは「本来もっと長い時間で進行する現象を、短絡という緊急シナリオに限り時間圧縮して見せる」という演出上の割り切りとして受け入れる。
- 訂正(v2): 0.05秒は「1段階1フレーム」ではなく、**60fps描画で3描画フレーム**に相当する(0.05秒×60fps=3フレーム)。12fps格子(5描画フレーム)には届かないが、完全な単一フレーム点滅ではない。
- 影響: art-spec §7の12fps格子規律に対する明示的な例外規定が必要。UI側(brabit)が「3描画フレームだけの短い表示」を12fpsアニメーションとしてどう解釈するか(格子を無視して3フレームそのまま表示するか、あるいはUI側で別途「圧縮された段階を疑似的に引き延ばして見せる」演出を検討するか。ただし後者はengine状態と無関係な演出専用stateになり、v12の「HUD読み取り専用境界」「演出専用state禁止」原則に抵触するリスクがある)を検討する必要がある。

**(b) D04進行開始後のoverheated終端規則を変更する**
- 内容: D04がswellingへ突入した後は、通常の`overheated`終端(`batteryHeat>=BATTERY_HEAT_LIMIT`によるvehicle状態の即時凍結)を一時的に無効化し、D04の状態機械が`burning`まで進行することを優先する(例: D04がactiveな間はoverheated判定を保留する、または`overheated`と`destructionTerminal`が同一step以内で競合した場合はdestructionTerminal側を優先する既存のM4条件(3)の判定規則を、判定タイミングだけでなく物理そのものへ拡張する)。
- **影響(v2で追加、重要)**: この案は**Phase3-Q2(D04即終端)の確定裁定「D04は既存物理終了後に継続stepしない。物理step停止で駆動項が消え、burningのみ自己持続・即終端」に直接抵触する**。案(b)が求めるのは「overheated(既存物理の終了条件の1つ)が本来なら成立する状況でも、D04を優先してstepを継続させる」ことであり、これはPhase3-Q2が明示的に否定した「D04が既存物理終了後も継続stepする」動作そのものである。したがって案(b)は単なる`overheated`ロジックの調整ではなく、**Phase3-Q2という確定済み裁定を上書きする契約変更**として扱う必要がある。
- 影響(既存): `vehiclePhysics.ts`の既存`overheated`判定ロジック(D01〜D09登場以前からの既存契約)への変更が必要になる可能性がある。

**(c) 既存heat物理式/閾値側を再較正する**
- 内容: `BATTERY_HEAT_LIMIT`(現在1.0固定)や`HEAT_DISSIPATION`(3.0固定)、あるいはLiPo電池のheld-short時の発熱速度自体(`battery-lithium-polymer`の`batteryInternalResistanceRatio=0.15`という素材写像値)を見直し、runaway到達からoverheated到達までの時間窓自体を広げる。
- 影響: `BATTERY_HEAT_LIMIT`/`HEAT_DISSIPATION`はD01〜D03(V2から凍結継承の物理エンジン核)が依拠する既存定数であり、変更すればD03(短絡による電池消耗)等の既存sweep較正値(D03の3.0秒等)にも影響が波及する可能性がある。LiPoの内部抵抗ratio(0.15)を変更する場合はStep7b/`computeBatteryInternalResistanceRatioCalibration`の較正根拠(現状「一次資料なし、素材間の相対関係のみを表現する設計較正値」)の再検討が必要。

**(d) その他**(Fableの判断による代替案)

各案が次の既存裁定・原則へ与える影響を明記して裁定いただきたい:
- **Phase3-Q2(D04即終端、上記引用)**——案(b)がこれを上書きする契約変更に該当することの確認、または上書きを正式に承認するかどうか。
- **P3-2-Q2(D07 RPM低下、`docs/phase3-p3-2-plan.md`§2.5)**——これはD07固有の「症状として実際に識別可能であること」という要求であり、D04にも同種の要求を及ぼすべきかは別途の判断が必要(混同しないこと)。
- エンジン凍結方針(`CLAUDE.md`「エンジン凍結方針」、V2から継承した`src/engine/`構造・二段API・決定論)——案(b)(c)がこの凍結範囲の変更に該当するか。
- 演出専用state禁止(v12「UIはHUD読み取り専用参照以外の経路で症状の有無を推測しない」)——案(a)の「疑似的に引き延ばす演出」がこの原則に抵触するか。

---

## Q13-2: 「通常運用構成で非到達」の正確な定義

### 発見した問題

P3-2計画・Suu_mot3レビューはたびたび「通常運用構成」「現実的なレース長」という言葉を用いるが、`docs/spec.md`・`docs/baseline-v2.0.md`・`docs/handoff.md`のいずれにも、これを一意に定める記述が存在しない(2026-08-09、`rg`実査で確認)。判明した近傍情報は次の3種のみで、相互に整合しない:

1. `src/data/tracks.ts`の実在プレイアブルコース: 4コースが`lengthM=10`(目標タイム4.2〜15秒)、1コース(`energy-run`)が`lengthM=15`・`hasEnergyBudget:true`(明示的なtargetTimeなし、`maxEnergyJ`目標のみ)。
2. `docs/spec.md`のP4-0(垂直スライス)記述: 「30〜60秒で1本巻く→固定レシピのライバル1台と20〜30秒コースを走る」——「20〜30秒コース」という設計意図の記述はあるが、これは実装対象コースの長さそのものを規定するものではなく、Phase 4-0時点のビジョン記述である。
3. これまでのP3-1/P3-2の各sweep証跡で使われてきた「通常運用」の時間窓は、モードごとにバラバラである: D03は120秒間(`materialMapping.test.ts`795行目台)、D04は初回30秒間→90秒間→30秒間(2026-08-08に一度90秒へ広げたが、90秒走らせると通常負荷でも最終的にunsafeDischargeStartRatioへ到達してしまうことが判明し30秒へ差し戻した)、D07は20秒間→30秒間。

### 今回の対応(暫定)

ゲート5是正版では、`energy-run`(実在コース、15m、`hasEnergyBudget:true`)をproduction-valid構成(`wire-copper-standard`・`magnet-neodymium`・`gear-pom`・`battery-lithium-polymer`、既定player値)で自然完走させ、finalStatus='finished'・finalStep=3848(32.0667秒)・maxEnergyUsedRatio≈0.8073・D04最終stage='none'であることを実測した(M4条件1のテスト、詳細はappendix A参照)。この32秒という完走時間は、spec.md P4-0の「20〜30秒コース」という設計意図とも大きく乖離しない。

### 依頼事項

「通常運用構成で〈危険な症状〉に到達しない」という受け入れ条件全般(D03・D04・D07問わず)について、**正式な基準となるコース・走行時間・車体構成の定義**をFableへ確認いただきたい。候補:
- (a) `src/data/tracks.ts`の実在コースのうち特定の1本(例: `energy-run`)を正式な「通常運用」基準コースとして固定する。
- (b) spec.md P4-0の「20〜30秒」を正式な時間基準として固定し、コース長は問わない(現行の「infinite trackを時間で打ち切る」sweep手法を正式契約にする)。
- (c、v2で訂正)**実在基準コースを完走し、かつ定めた時間窓でも危険症状へ到達しないこと——両方をAND条件として満たすことを要求する**(旧v1案は「いずれか一方でも満たせば」というOR条件になっており、基準を弱めてしまう誤りだった。AND条件なら、短時間で終わる実在コースの完走だけでは見逃す「長時間運用時の緩やかな到達」〈D04の過放電経路のように、時間をかければ通常負荷でも到達しうる経路〉も、時間窓側の条件が別途検出する)。
- (c-OR、v2で追加、別案として提示): (c)のAND条件が厳しすぎる場合の代替として、「いずれか一方でも満たせば」というOR条件も検討しうるが、**この場合は偽陰性リスクがある**——実在コースの完走(通常は短時間)だけを根拠に「通常運用で非到達」と判定してしまうと、同じ構成のまま走行時間だけを延ばした場合に到達しうる経路(D04の過放電のように、緩やかに閾値へ近づく経路)を見逃す。OR条件を採用する場合は、この偽陰性リスクを許容する明示的な理由が必要。
- (d) その他。

---

## Q13-3(v2訂正: 非ブロッキングの参考質問): production-valid構成でD07条件2/3が成立しない場合の較正原則

**本項目は現時点でGate 5を一切ブロックしない。** 以下のとおり、production-valid構成の範囲内でD07条件2・条件3はすでに成立しており、Q13-1のような構造的対立は存在しない。将来のバランス調整で同種の対立が生じた場合に備えた参考質問であり、**Q13-1・Q13-2の回答を待つ間、本項目の回答を待たずにGate 5照合・Gate 6解禁の判断を進めていただいて構わない。**

### 現状(成立している)

ゲート5是正版でのproduction-valid再sweep(2026-08-09計測、appendix B参照)では、D07 Q11の受け入れ条件2(高負荷でダレ到達可能)・条件3(持続過負荷で不可逆到達がoverheatedより先)は、`conductionCoefficient=0.25`のまま、player-adjustable値(`coilTurns`・`magnetDistanceMm`・`brushPressure`・`gearRatio`・`tireGrip`・`slopeDeg`)の調整のみで到達可能であることを確認できた(条件2: `droopAtStep=21`〈30秒以内〉、条件3: `droopAtStep=17`・`irreversibleAtStep=28`・`overheatedAtStep=72`、いずれもproduction-valid素材選択+player-adjustable調整のみ)。**したがって現時点でD07側はD04側のような構造的対立には陥っていない。**

### 依頼事項(参考、非ブロッキング)

上記のとおり現状は成立しているが、今後のバランス調整(sweepでの微調整、素材テーブルの追加等)によって、production-valid構成の範囲内でD07条件2/3が成立しなくなるケースが生じた場合に備え、較正の優先順位をあらかじめ確認したい:
- (a) `thermal.conductionCoefficient`/`dissipationCoefficient`(HUD熱ゲージの蓄積速度そのもの)を調整する。
- (b) `magnetHeatGaugeLimit`/`reversibleDroopThreshold`(不可逆到達・可逆ダレの閾値位置)を調整する。
- (c) 磁石素材写像(`MAGNET_STRENGTH_CALIBRATION`)側の較正値を見直す。
- (d) 「production-valid構成の範囲内では到達不可能」という結論を受け入れ、D07条件2/3を「意図的なチューニング〈素材選択+player-adjustable値〉が必要な上級者向け症状」として最終DoDの表現を調整する。

いずれを優先すべきかの原則(例: 「較正値〈設計初期候補値〉から先に調整し、素材写像自体〈人間再承認済みの較正値〉は最後の手段とする」等)をご教示いただきたい。

---

## Appendix A: M4到達可能性3条件・feasibility表の実測全文(P1・P3是正証跡)

### A.1 素材選択・写像後config全文・player入力・trackの種別

**条件1(通常負荷)**: 素材ID = {wire: 'wire-copper-standard', magnet: 'magnet-neodymium', gear: 'gear-pom', battery: 'battery-lithium-polymer'}。
```
motorConfig = {coilTurns:80, slitWidthMm:1.5, sandingQuality:0.9, brushPressure:0.3, magnetStrength:0.9, magnetDistanceMm:10, batteryVoltage:3, axisOffsetMm:0, wireGaugeMm:0.4, parallelStrands:1, varnished:true, wireResistivityRatio:1, wireDensityRatio:1, batteryInternalResistanceRatio:0.15, batteryCapacityRatio:1.3}
carConfig = {massG:150.61261056745002, gearEfficiency:0.8, gearRatio:4, wheelDiameterMm:30, tireGrip:0.7, axleFriction:0, wheelAlignmentMm:0, centerOfMassHeightMm:20, motorMountOffsetMm:0}
```
player入力: なし(全フィールドが既定値または素材写像値。wireResistivityRatio/wireDensityRatioが1なのはwire-copper-standardがcanonical anchorであるため)。track: **実在コース**`energy-run`(`src/data/tracks.ts`、15m・`hasEnergyBudget:true`)。

診断値全文: `finalStatus='finished'`、`finalStep=3848`(32.0667秒)、`maxEnergyUsedRatio≈0.8073`、`D04最終stage='none'`。

**条件2(高負荷LiPo)**: 素材ID = {wire: 'wire-silver', magnet: 'magnet-neodymium', gear: 'gear-titanium', battery: 'battery-lithium-polymer'}。
```
motorConfig = {coilTurns:20, slitWidthMm:1.5, sandingQuality:0.9, brushPressure:0.5, magnetStrength:0.9, magnetDistanceMm:5, batteryVoltage:3, axisOffsetMm:0, wireGaugeMm:0.4, parallelStrands:1, varnished:true, wireResistivityRatio:0.9464285714285714, wireDensityRatio:1.1707589285714286, batteryInternalResistanceRatio:0.15, batteryCapacityRatio:1.3}
carConfig = {massG:150.69717333795853, gearEfficiency:0.7200000000000001, gearRatio:8, wheelDiameterMm:30, tireGrip:0.9, axleFriction:0, wheelAlignmentMm:0, centerOfMassHeightMm:20, motorMountOffsetMm:0}
```
player入力: coilTurns(20)・brushPressure(0.5)・magnetDistanceMm(5)・gearRatio(8)・tireGrip(0.9)のみ。他は素材写像値(magnetStrength=neodymium実測上限0.9、batteryInternalResistanceRatio/batteryCapacityRatio=LiPo写像固定値、wireResistivityRatio/wireDensityRatio=wire-silver写像値、massG/gearEfficiency=gear-titanium+baseline由来)。track: **schema-valid test-only synthetic track**(`g5LongTrack`、lengthM=100000、`hasEnergyBudget:true`)。

診断値全文(v3で追加: finalStep/maxEnergyUsedRatio/finalD04Stage): `reachedBurning=true`、`finalStep=909`、`finalStatus='running'`、`finalD04Stage='burning'`、`maxEnergyUsedRatio≈0.9127`、`unsafeDischargeEnteredAtStep=897`、`shortThresholdAtStep=null`・`runawayAtStep=null`(短絡を一切発生させていないためどちらも到達なし)、`swellingAtStep=897`、`smokingAtStep=903`、`burningAtStep=909`(7.575秒)、`burningEnergyUsedRatio≈0.9127`、`burningInitiatingCause={shortCircuitDurationS:0, overDischargeRatio≈0.9011}`(是正: v1記載の「overDischargeRatio≈0.9127」は誤記だった。overDischargeRatioはburning到達フレームのenergyUsedRatioそのものではなく、cause log内で別途評価される値であり実測は≈0.9011)。

**条件3(短絡)**: 素材ID = {wire: 'wire-copper-standard', magnet: 'magnet-neodymium', gear: 'gear-pom', battery: 'battery-lithium-polymer'}。
```
motorConfig = {coilTurns:80, slitWidthMm:0, sandingQuality:0.9, brushPressure:0.3, magnetStrength:0.9, magnetDistanceMm:10, batteryVoltage:3, axisOffsetMm:0, wireGaugeMm:0.4, parallelStrands:1, varnished:true, wireResistivityRatio:1, wireDensityRatio:1, batteryInternalResistanceRatio:0.15, batteryCapacityRatio:1.3}
carConfig = {massG:150.61261056745002, gearEfficiency:0.8, gearRatio:4, wheelDiameterMm:30, tireGrip:0.7, axleFriction:0, wheelAlignmentMm:0, centerOfMassHeightMm:20, motorMountOffsetMm:0}
```
player入力: `slitWidthMm:0`のみ(条件1と同じ素材写像、slitWidthMmだけplayer入力で0へ変更)。track: **schema-valid test-only synthetic track**(`g5LongTrack`、lengthM=100000、`hasEnergyBudget:false`)。

診断値全文(v3で追加: finalStep/maxEnergyUsedRatio/finalD04Stage/shortThresholdAtStep/runawayAtStep/burningInitiatingCause): `reachedBurning=true`、`finalStep=19`、`finalStatus='running'`、`finalD04Stage='burning'`、`maxEnergyUsedRatio=0`(`hasEnergyBudget:false`のため常に0)、`swellingAtStep=7`、`smokingAtStep=13`、`burningAtStep=19`、`shortThresholdAtStep=5`、`runawayAtStep=7`(feasibility表1・stageS=0.05秒の行と一致することを確認済み)、`burningInitiatingCause={shortCircuitDurationS≈0.0667, overDischargeRatio:null}`。

### A.2 feasibility表(全行、entry timing3水準×stageS7候補=21行)

本文のQ13-1 表1〜表3を参照(全文掲載済み、要約なし)。

---

## Appendix B: D07 Q11受け入れ条件4つの実測全文(P1・P4是正証跡、v3で統一表へ拡張)

### B.1 素材選択・写像後config・player入力

**条件1(通常運用)**: 素材ID = {wire: 'wire-copper-standard', magnet: 'magnet-neodymium', gear: 'gear-pom', battery: 'battery-alkaline'}。player入力: なし(既定値のみ)。track: schema-valid test-only synthetic track(平坦、`hasEnergyBudget:false`)。30秒間(3600フレーム)走行継続。

**条件2(高負荷)**: 素材ID = {wire: 'wire-silver', magnet: 'magnet-neodymium', gear: 'gear-titanium', battery: 'battery-alkaline'}。player入力: coilTurns(20)・magnetDistanceMm(5)・brushPressure(0.5)・gearRatio(8)・tireGrip(0.9)。track: 平坦、synthetic。30秒上限。

**条件3(持続過負荷)**: 素材ID = {wire: 'wire-silver', magnet: 'magnet-neodymium', gear: 'gear-titanium', battery: 'battery-alkaline'}。player入力: coilTurns(15)・magnetDistanceMm(3)・brushPressure(0.5)・gearRatio(10)・tireGrip(1.0)・slopeDeg(20、コース勾配)。track: 勾配20°、synthetic。60秒上限。

**条件4(ferrite極端入力回帰)**: 素材ID = {wire: 'wire-copper-standard', magnet: 'magnet-ferrite', gear: 'gear-pom', battery: 'battery-alkaline'}。player入力: なし。motor-only文脈(`stepMotorWithDestruction`、120step、極端電流入力)。**この条件は「全step・全構成」の網羅性を主張するものではなく、ferrite単一構成・120stepの極端入力回帰である**——全入力に対する構造的網羅性(`Math.min(1,Math.max(0,...))`によるclamp・demagnetizing/nonDemagnetizing両kindの分岐)は、`src/engine/__tests__/destructionModes.test.ts`(Gate3)がadvanceD07本体の実装そのものに対して既に保証している。

### B.2 診断値全文(統一表、v3で追加。条件4はmotor-onlyのため同じ診断表に入らず別行で明示)

| | 条件1(通常運用) | 条件2(高負荷) | 条件3(持続過負荷) | 条件4(ferrite、motor-only) |
|---|---|---|---|---|
| terminatedAtStep | null | 147 | 72 | 対象外(固定120step) |
| finalStatus | 'running' | 'overheated' | 'overheated' | 対象外 |
| droopAtStep | null | 21 | 17 | 対象外(reversibleDroopActiveは常時false) |
| irreversibleAtStep | null | **36**(v3で追加、初回版は「最終的に発生」としか記載せず欠落していた) | 28 | 対象外(irreversibleTriggeredは常時false) |
| overheatedAtStep | null | 147 | 72 | 対象外 |
| minGauge | ≈0.00325(v3是正: 初回記載の「0」は誤り) | ≈0.0247 | ≈0.0317 | 0 |
| maxGauge | ≈0.3271(droopThreshold 0.5未到達) | 1(上限到達) | 1(上限到達) | ≈0.3674(単調増加、0-1 clamp未到達) |
| finalGauge(v3で追加) | ≈0.3184 | 1 | 1 | ≈0.3674(単調増加のためmaxGaugeと一致) |
| reversibleDroopActive/irreversibleTriggered(最終) | false/false | true/true | true/true | false/false |

不可逆到達(条件3: 28)がoverheated終端(条件3: 72)より先に成立することを確認済み。条件2は「ダレへの到達可能性」のみを要求する計画§2.5原文どおりであり、最終的にoverheated終端へ到達すること自体は条件2の不成立を意味しない(P4是正時に確認済み、v3で正確なirreversibleAtStep=36を追加)。

---

## Appendix C: Q2独立sweep(可逆ダレRPM低下)窓平均の実測全文(P5是正証跡、v3で表現統一)

素材選択: {wire: 'wire-copper-standard', magnet: 'magnet-neodymium', gear: 'gear-pom', battery: 'battery-lithium-polymer'}(既定player値)。loadTorque=0.007Nm(トルク制限領域の負荷、motor-only文脈)。

**fixtureの正確な表現(v3是正)**: 本sweepは**production-valid motorConfigを用いたschema-valid test-only isolated state**を使う——motorConfigは`composeConfigFromMaterials`の実出力(production-valid)のまま、`destructionConfig.d07.thermal.conductionCoefficient`のみ`1e-9`(実質ゼロ)へ差し替えて熱蓄積の継続的進行を遮断し、`reversibleDroopActive`フラグを直接seedする。この状態自体はvalidateDestructionConfigを通るがmaterialMapping.tsのいかなる較正値にも対応しないため「schema-valid test-only isolation」であり、「production-validな状態」ではない(v1〜v2で一部「production-validな状態として直接seed」という不正確な記述が残っていたが、v3でファイル内の表現を完全に統一した)。

**役割分担(v3で明記)**: 実運用でこの状態(reversibleDroopActive=true)へ自然に到達することは、Appendix B条件2(production-valid構成のまま`droopAtStep=21`で自然到達することを確認済み)が別途保証する。本Q2 sweepはそこからさらに踏み込み、「ダレという状態が定常RPMへ与える効果」だけを他の変動要因(熱蓄積の継続的進行)から分離して測定する——production自然到達可能性(Appendix B)とisolated効果測定(本appendix)は別の役割を持つ、という1文で固定する。

末尾240フレーム(2秒間、全体1200フレーム中)窓の実測値全文:

| | droop無効時 | droop有効時 |
|---|---|---|
| meanAll(窓平均、主張の根拠) | 399.986 | 348.981 |
| meanFirst(窓前半平均) | 400.104 | 348.956 |
| meanSecond(窓後半平均) | 399.868 | 349.006 |
| min | 393.920 | 338.210 |
| max | 407.685 | 362.648 |
| 前半/後半差(定常性確認、全体平均比) | 0.059% | 0.014% |

窓平均からの低下率: `(399.986 - 348.981) / 399.986 ≈ 0.1275`(12.75%、5%以上の有意な低下)。

参考(主張には使わない、末尾1フレーム目の瞬間値): droop無効時394.079、droop有効時358.933(窓平均とは異なる、コギング/整流リップルによる瞬間値のブレを示す参考データ)。

---

## Appendix D: pvMotorCar型制約の依存閉包(P1是正証跡、v3でPick方式へ強化)

`rg "pvMotorCar\("`で`src/materials/__tests__/materialMapping.test.ts`内の全呼び出し箇所(10箇所)を実測した結果、実際に使われているoverrideキーは次のとおり:
- motorOverrides: `coilTurns`・`magnetDistanceMm`・`brushPressure`・`slitWidthMm`の4キーのみ。
- carOverrides: `gearRatio`・`tireGrip`の2キーのみ。

**v3是正**: v2までは素材写像所有キー(`magnetStrength`・`batteryInternalResistanceRatio`・`batteryCapacityRatio`・`wireResistivityRatio`・`wireDensityRatio`・`massG`・`gearEfficiency`)だけを`Omit<Partial<MotorConfig>, ...>`/`Omit<Partial<CarConfig>, ...>`で除外する方式だったが、これはfail-open(残り全フィールドを自動的に許可)であり、MotorConfig/CarConfigへ将来新しい素材所有フィールドが追加された際に無検査で上書き可能になる欠陥だった。v3で許可リスト(Pick方式、fail-closed)へ変更し、`motorOverrides: Partial<Pick<MotorConfig, 'coilTurns' | 'magnetDistanceMm' | 'brushPressure' | 'slitWidthMm'>>`・`carOverrides: Partial<Pick<CarConfig, 'gearRatio' | 'tireGrip'>>`の現利用6キーだけへ型レベルで閉じた。将来player-adjustable値を追加する場合は、テスト計画・レビューを経てこの許可リストへ明示的にキーを追加する(自動拡張しない)。

---

## 検証環境・再現手順

いずれの実測値も、`src/materials/__tests__/materialMapping.test.ts`の`describe('P3-2ゲート5(是正版): ...')`ブロック内のテストコードで再現可能。実行コマンド:

```
npx vitest run src/materials/__tests__/materialMapping.test.ts
```

全82テスト成功(2026-08-09時点)。DT=1/120秒固定、rng=()=>0.5固定(乱数依存を排除した決定論的実測)。production-valid構成は`composeConfigFromMaterials`(`src/materials/materialMapping.ts`)の実出力をそのまま使用し、素材写像値(`magnetStrength`・`batteryInternalResistanceRatio`・`batteryCapacityRatio`等)は型レベルで上書き不能にしている(appendix D参照)。到達可能性harness(M4条件2・3、D07全条件、feasibility表)が使う長距離trackはschema-valid test-only synthetic track(`g5LongTrack`)であり、実在コースでの検証はM4条件1(`energy-run`自然完走)のみが行う。

epsilon単一出典(v3是正): `destructionModes.ts`の`DURATION_COMPARISON_EPSILON_S`をexport化し、`materialMapping.test.ts`はこれを直接importする。`rg "DURATION_COMPARISON_EPSILON_S" src/engine/destructionModes.ts src/materials/__tests__/materialMapping.test.ts`で、production側(`advanceD04`・`advanceD03`)とテスト側(feasibility関数・M4 sweep関数のshortThresholdAtStep判定)が同一のexport定数を参照していることを確認済み。独自の`_FOR_TEST`複製定数は削除した。

feasibility harnessの終端相互排他化(v4是正): `feasibility()`のループ条件を`overheatedAtStep===null`単独から`burningAtStep===null && overheatedAtStep===null`(最初の終端で停止)へ変更。targeted test再実行(`npx vitest run src/materials/__tests__/materialMapping.test.ts src/engine/__tests__/destructionModes.test.ts`)で destructionModes 40件・materialMapping 82件、計122件成功を確認。

全体test/build/lint(v4、2026-08-09時点): `npx tsc -b`エラーなし、`npm run test -- --run`68 files/1225 tests成功、`npm run build`784.24kB/gzip 219.69kB(変化なし)、`npm run lint`exit 0、`cmp AGENTS.md CLAUDE.md`差分なし、`git diff --check`exit 0。`materialMapping.test.ts`は82テストのまま(是正ラウンド2の統合と是正ラウンド3の追加が相殺、v4はtoEqual内の既存フィールド値変更のみでテスト数に変化なし)。
