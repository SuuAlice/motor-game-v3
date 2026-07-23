# Phase 2末見積り(d) v4: 整流モデルの進角拡張

作成日: 2026-07-23
担当: alice_mot3(エンジン・写像)
根拠: `docs/phase2-step10-plan.md` v4(承認済み)、`docs/spec.md` §2(d)・§9.2、CLAUDE.md「エンジン凍結方針」
状態: **v4・Fable技術レビュー完了(`docs/phase2-step10-fable-review.md`)・判定「§2(d)降格条項発動、将来枠へ降格」はFable技術判定として確定・プロジェクトとしての最終決定とspec.md/CLAUDE.md/AGENTS.md編集は人間承認待ち**

v3からの変更点(Suu_mot3最終レビュー、v4で反映):
7. 「将来枠へ降格することが確定した」等の記述について、Fable技術判定としては確定だがプロジェクトとしての最終決定は人間承認待ちであることを状態欄・変更点・8節で明示的に分離した(Suu_mot3必須修正1点目、他の1点(e)のspec追記の要否は本書ではなく`docs/phase2-step10-lap-lateral-extension-estimate.md`側の論点)

本書は`src/engine/commutator.ts`・`src/engine/motorPhysics.ts`・`src/engine/recipeCode.ts`・関連テストの読み取り専用調査に基づく見積りである。engine/への変更は一切行っていない。**8節のFable技術レビューにより、(d)は将来枠へ降格することが相当と判定された(プロジェクトとしての最終決定は人間承認待ち)。** 本Stepの範囲では見積り文書の作成のみを行い、spec.md/CLAUDE.md/AGENTS.mdへの反映は別途人間承認を得てから行う(`docs/phase2-step10-plan.md` v4参照)。

v1からの変更点(Suu_mot3事前レビュー、v2で反映):
1. `recipeCode.ts`への影響を「未確認」のまま残さず、実際に読み取り調査した結果(`motorConfigToFields`/`normalizeMotorFields`の権威的なフィールド管理、版数方針の論点)を具体化し、対象ファイルを2ファイルから3ファイル(+テスト2本)へ訂正(3.2節・4節)
2. production直接呼び出し(1箇所)とテスト直接呼び出し(`commutator.test.ts`9件)を区別して明記(1節・3.3節)
3. `sinTheta`位相シフトを「後者を採る場合」という前提つきの記述から、ローター磁束結合とブラシ切替位相が別概念であることを明記した中立的な選択肢A/Bの提示へ訂正(3.1節・6節)

v2からの変更点(Fable技術レビュー、v3で反映):
4. 選択肢A(commutationSignのみシフト、sinThetaはθの生値のまま)が物理的に正しく、選択肢Bは無効(進角ゼロと等価)であることがFable技術判定として確定した(8節)
5. **重大な発見**: 選択肢Aを現行の無誘導(記憶なし)電気モデルへ導入しても、spec §9.2が要求する「高回転寄り/トルク寄りの特性シフト」は原理的に再現できない。実現には電機子インダクタンス(電流の一次遅れ)の導入という、`computeElectricalState`を記憶なし状態から状態持ちへ変える中核的な電気モデル拡張が必要と判明し、規模は「中規模」から実質的に「大規模」相当へ再評価された(8節)
6. Fableの判定により、spec §2(d)の降格条項(「大規模なら進角は将来枠へ降格する」)発動が相当と判定され、(d)は将来枠(V3後期またはV3.x、インダクタンス導入とMC4-新設を一体パッケージとして再見積り)へ降格することがFable技術判定として確定した(プロジェクトとしての最終決定は人間承認待ち、8節)

---

## 1. 現状の実装

`src/engine/commutator.ts`(26行、全2関数):

- `getCommutationSign(theta): 1 | -1` — θを`normalizeAngle`で`[0, 2π)`に正規化し、`< π`なら`+1`、それ以外は`-1`を返す。整流の切り替わりはθ=0とθ=πの2点に固定
- `isInDeadZone(theta, slitWidthMm): boolean` — `deadZoneRad = slitWidthMm / R_COMMUTATOR_MM`(定数`R_COMMUTATOR_MM = 5.0mm`、`constants.ts`)からデッドゾーン半幅を求め、θ=0・πそれぞれの近傍`±halfWidth`をデッドゾーンとする

`motorPhysics.ts`側の結合(唯一の呼び出し箇所、`computeElectricalState`関数内):

```typescript
const s = getCommutationSign(theta);
const sinTheta = Math.sin(theta);
const deadZone = isInDeadZone(theta, config.slitWidthMm);
const shorted = config.slitWidthMm <= 0;
const backEmf = K_E * B * config.coilTurns * omega * sinTheta * s;
// ...
const iRaw = shorted || deadZone ? 0 : (config.batteryVoltage - backEmf) / (rCoil + rContact + rBatteryInternal);
```

`s`(`commutationSign`)は`MotorElectricalState`として`computeMagneticTorque`へも伝播し、そちらでも`electrical.sinTheta * electrical.commutationSign`の形で使われる(トルク計算式の符号)。つまり`getCommutationSign`・`sinTheta`(θの生値)の2つが、backEmfとトルクの両方に共通して使われている。

**呼び出し箇所の区別(Suu_mot3指摘)**:
- **production直接呼び出し**: `motorPhysics.ts`の`computeElectricalState`内の1箇所のみ
- **テスト直接呼び出し**: `src/engine/__tests__/commutator.test.ts`(9件全件が`getCommutationSign`/`isInDeadZone`を直接呼ぶユニットテスト)。`motorPhysics.test.ts`・`motorPhysicsV15.test.ts`はこの2関数を直接呼ばず、`computeElectricalState`/`step`経由の間接呼び出しのみ

両者は性質が異なる: production側は関数シグネチャ変更に伴う呼び出し元コード1箇所の更新で済むが、テスト側は`commutator.test.ts`の既存9件全件が新シグネチャに合わせた引数追加を必要とする(3.3節)。

## 2. spec要求の再確認(§9.2)

spec §9.2の巻線記録写像表: 「溝掘り位置(整流子工程)→整流タイミング(進角)→高回転寄り/トルク寄りの特性シフト。掘りすぎ・位置ズレは整流不良」。溝の**仕上げ**(粗さ)は別項目で「接触品質→チャタリング」に写像され、これは既存`sandingQuality`パラメータ(`R_CONTACT_SCALE`計算に使用済み)がカバーしている概念であり、進角とは別軸である。つまりspecが要求する進角は、**Phase4の巻線記録(溝掘り位置の記録値)からコミュテーションのタイミングオフセットへ写像される新規パラメータ**であり、現行`sandingQuality`等の既存パラメータの延長では表現できない。

実在のブラシ付きDCモーターにおける「進角(brush advance)」は、ブラシ位置を中性軸からずらすことで整流タイミングを前後させ、電機子反作用による火花を抑える(高回転寄り)か、低速トルクを稼ぐ(トルク寄り)かの特性シフトを生む現象である。spec §9.2の記述(「高回転寄り/トルク寄りの特性シフト」)はこの実物理と整合する。

## 3. 具体的な改修点

### 3.1 型・関数シグネチャ変更

- `getCommutationSign(theta: number): 1 | -1` → `getCommutationSign(theta: number, advanceAngleRad: number): 1 | -1`(切り替え点をθ=0・πから`advanceAngleRad`・`π + advanceAngleRad`へシフト)
- `isInDeadZone(theta: number, slitWidthMm: number): boolean` → `isInDeadZone(theta: number, slitWidthMm: number, advanceAngleRad: number): boolean`(デッドゾーン中心も同様にシフト)
- `MotorConfig`へ新規フィールド`advanceAngleRad?: number`(既定0=進角なし、既存回帰互換)を追加
- `computeElectricalState`内の`sinTheta`の扱いに関する**設計上の選択肢**(6節、Fable判断事項): ローターの物理角θによる磁束結合(`sinTheta`が表す磁束鎖交の位相)と、ブラシの整流切り替え位相(`commutationSign`が表す接点の物理的な切り替えタイミング)は、実物理としては**別の概念**である。「進角を導入する=両方を同じ量だけシフトする」ことが物理的に自明に正しいわけではない。少なくとも次の2つの選択肢があり、本見積りではどちらが正しいかを断定しない:
  - (選択肢A)`commutationSign`の切り替え点(θ=0・π)のみを`advanceAngleRad`だけシフトし、`sinTheta`(磁束結合・磁石とコイルの物理的な位置関係)はθの生値のまま据え置く。この場合、進角の効果は「同じ磁束結合カーブに対して、電流の向きが切り替わるタイミングだけが前後する」という、非対称なトルクリップルを生む効果になる
  - (選択肢B)`sinTheta`の位相も`advanceAngleRad`だけ一緒にシフトする(`Math.sin(theta - advanceAngleRad)`)。この場合、磁束結合自体の位相もずれることになり、ブラシの物理的な取り付け角そのものを回転させたことに相当するモデルになる
  どちらがspec §9.2の「高回転寄り/トルク寄りの特性シフト」を正しく再現するかはFableの物理判断を仰ぐ(6節)

### 3.2 呼び出し箇所・`recipeCode.ts`への影響(Suu_mot3指摘により具体化)

`computeElectricalState`(production 1箇所)を除き、`getCommutationSign`/`isInDeadZone`のproduction直接呼び出しは他に存在しない。しかし**`recipeCode.ts`(440行)は当初「未確認」としていたが、読み取り調査の結果、確実に変更が必要と判明した**。`recipeCode.ts`は`MotorConfig`の全optionalフィールドについて、短縮キー(`ct`・`sw`・`sq`等)への相互変換(`motorConfigToFields`/`normalizeMotorFields`)・authoritativeなclamp範囲によるnumAtデフォルト解決・MC3-往復(round-trip)保持を行う権威的な実装であり、`wireResistivityRatio`等Step5a/5bで追加された既存4フィールドも同じ枠組みで扱われている(`wr`・`wz`・`br`・`bc`キー)。`advanceAngleRad`をレシピコードとして永続化・共有する場合、次が必須になる:

- `motorConfigToFields`(`encodeRecipe`側)へ新規キー(例: `aa`)の追加
- `normalizeMotorFields`(`decodeRecipe`側)へ`aa`キーのnumAt解決・clamp範囲の決定・デフォルト値(旧コードとの互換のため`0`が自然)の追加
- **version方針の判断**: Step6の確定方針は「MC3-は常時出力、MC2-/M15-は読み込みのみ後方互換」であり、Step5a/5bの4フィールド追加はMC3-の**新設と同時**に行われた。`advanceAngleRad`をMC3-の枠内に追加フィールドとして後乗せするか(既存MC3-コードは`aa`キー欠落→デフォルト0で意味互換のまま読める)、新版数(仮称MC4-)を新設するかは、Suu/Fableの判断が必要な版数戦略の論点である
- `src/engine/__tests__/recipeCode.test.ts`(619行、約41件のテストケース)側の影響: 新規フィールドの往復テスト追加、既存の`MC2-`/`M15-`固定fixtureとの意味互換テスト(新フィールドがデフォルト値で補われることの確認)を追加する必要がある

### 3.3 テストへの影響

- `commutator.test.ts`: **既存9件全件がシグネチャ変更の影響を受ける**(引数を1つ追加する必要があるため、テストコードの記述自体を書き換える必要がある。「無改修で通る」わけではない)。新規に「進角≠0のとき切り替え点がシフトすること」を確認するテストを追加する必要がある(概算+3〜5件)
- `motorPhysics.test.ts`・`motorPhysicsV15.test.ts`の性質ベーステスト: `MotorConfig`が`advanceAngleRad?`をoptionalとして持ち、未指定時に既定0で動く設計にすれば、既存のテストコード自体(configオブジェクトのリテラル)は無改修で通る見込み。ただし3.1節の選択肢Bを採る場合、対称性を前提にした既存アサーション(θ=0/π境界での挙動)に影響がないか個別確認が必要
- `recipeCode.test.ts`: 3.2節のとおり新規フィールドの往復テスト・意味互換テストの追加が必要(概算+3〜8件)

## 4. 規模分類: **中規模**(v1「小〜中規模」から訂正、Suu_mot3指摘)

- 変更対象ファイルは`commutator.ts`(2関数のシグネチャ変更)・`motorPhysics.ts`(1箇所の呼び出し更新+`MotorConfig`型に1フィールド追加)・**`recipeCode.ts`(新規キーのエンコード/デコード追加+版数方針の判断)**の3ファイルに、対応するテストファイル2本(`commutator.test.ts`・`recipeCode.test.ts`)を加えた規模になる
- production側の呼び出し箇所自体は`computeElectricalState`の1箇所に閉じており、その点は小規模だが、**`recipeCode.ts`という「MotorConfigの全フィールドを権威的に扱う」既存の大きな契約に触れる**ことがv1見積りで見落としていた実質的な規模要因である
- 3.1節の選択肢Bを採る場合、`computeMagneticTorque`側にも軽微な変更が及ぶ可能性があり、その場合はさらに規模が増す
- 版数戦略(MC3-拡張かMC4-新設か)の判断次第で、`recipeCode.ts`側の作業量がさらに変わりうる(MC4-新設の場合は新しいprefix定数・新旧判定分岐が追加で必要になる)

## 5. 既存の凍結方針・決定論・二段階APIへの影響

- 二段階API(`evaluateMotorFrame`/`advanceMotorState`)の構造自体への影響はない(`computeElectricalState`は`evaluateMotorFrame`が呼ぶ既存の内部関数であり、新規引数を追加するだけで呼び出し順序・API形状は変わらない)
- 決定論・シードには一切関与しない(進角は乱数を使わないconfig値)
- `energyUsedJ`の正統性(唯一の正)には影響しない見込み(電流計算式の構造自体は変えず、切り替えタイミングだけをずらすため)

## 6. 不確実性・要確認事項(断定しない)

1. **`sinTheta`位相シフトの選択肢A/B(3.1節)**: ローターの磁束結合位相とブラシ切替位相は別概念であり、「両方を一緒にシフトする」ことが自明に正しいわけではない。どちらがspec §9.2の「高回転寄り/トルク寄りの特性シフト」を正しく再現するかはFableの物理判断を仰ぐ
2. **`recipeCode.ts`の版数方針**: `advanceAngleRad`をMC3-の枠内へ後乗せするか、新版数(MC4-)を新設するか。Suu/Fableの判断が必要
3. **「掘りすぎ・位置ズレは整流不良」の実装範囲**: spec §9.2は進角の範囲外(掘りすぎ等)で「整流不良」になることも示唆しているが、これが具体的にどのエンジン挙動(チャタリング増・D05火花増等)に対応するのかは本見積りの範囲外とし、Phase4の巻線記録方式実装時に個別設計する
4. Phase4の巻線記録(溝掘り位置の記録値)から`advanceAngleRad`への写像関数自体は、本見積りの対象外(写像層はPhase4実装時に`materialMapping.ts`的な純関数として別途設計する想定)

## 7. 見積り担当としての所見(v2時点、決定権はSuu/Fable/人間にある)

v1見積りでは`recipeCode.ts`への影響を「未確認」のまま規模評価から除外しており、これは過小評価だった(Suu_mot3指摘により訂正)。`recipeCode.ts`・`recipeCode.test.ts`を含めた実質的な規模は「中規模」であり、production呼び出し箇所自体は1箇所に閉じるという性質は変わらないものの、MC3-という既存の大きな契約に触れる作業が伴う。6節の不確実性(特に1番目のsinTheta位相選択肢、2番目の版数方針)はFableの物理判断・Suuの版数戦略判断を仰ぐべき論点である。**この所見は8節のFableレビューにより更新された。**

## 8. Fable技術レビュー結果(v3新設、`docs/phase2-step10-fable-review.md`全文、Fable技術判定として確定・プロジェクトとしての最終決定は人間承認待ち)

### 8.1 選択肢A/Bの物理判断: **Aが正しく、Bは無効**

進角(brush advance)はブラシ取付角の回転であり、動くのは「整流の切替タイミング」だけである。`sinTheta`が表す磁束鎖交は磁石とローターの物理的位置関係で決まり、ブラシをどこへ回そうと磁石は動かない。よって`sinTheta`はθの生値のまま(選択肢A)。選択肢Bは切替点と磁束位相を同量シフトするが、これはθ→θ−αという座標の付け替えにすぎず、コギング・デッドゾーンとの相対関係を除けば**進角ゼロと等価**——「効果が出ない実装」になるため無効。

### 8.2 重大な発見: 現行の無誘導モデルでは spec §9.2 の特性シフトを再現できない

選択肢Aを現行の電気モデルへ導入しても、spec §9.2の「高回転寄り/トルク寄りの特性シフト」は**原理的に再現できない**。現行モデルは無誘導(電流が毎瞬`(V−backEmf)/R`で決まる記憶なしのオーム的モデル)であり、この場合の進角αの平均効果を解析すると、ストールトルクと無負荷回転数が共に`cos α`倍される**左右対称の純粋な劣化**になる(切替直後の逆トルク区間が生じるだけで、どの速度域にも利得がない)。実物で進角が高回転側の利得を生む機構は電機子インダクタンスによる電流反転の遅れ(L/Rの時定数)であり、現行engineに存在しない。

specの約束を果たすには、進角フィールドの追加(3節の「中規模」見積り)に加えて**電流の一次遅れ(インダクタンス)の導入**という、電気モデルの中核への実拡張が必要になる。これは`computeElectricalState`を記憶なしから状態持ちへ変える変更であり、全回帰・性質テストに波及する。3〜4節の「中規模」見積りは、spec要求を満たす実装としては**過小**である。

### 8.3 判定: spec §2(d)の降格条項発動・進角は将来枠へ降格することが相当(Fable技術判定、人間最終承認待ち)

- spec §2(d)は「大規模なら進角は将来枠へ降格する」とあらかじめ定めており、本件はその条項の想定どおりの帰結である
- 溝掘りジェスチャーはspec §9.2の予定フォールバックどおり「接触品質(チャタリング・D05)のみ」に接続してPhase 4を実装する。工作要素としての溝掘りは失われない
- 進角を入れるなら「インダクタンス導入+進角」を一体のパッケージとして将来(V3後期またはV3.x)に再見積りする。偽の非対称式(物理を装った速度依存ボーナス)で誤魔化す案は、本シリーズの流儀に反するため検討対象にしない
- 版数論点(6節2番目)は降格により消滅する。将来実装時は、確立済みの原則(版数=フィールド集合)に従いMC4-新設とする
- **docs対応(人間承認が必要、本Stepでは未実施)**: `docs/spec.md` §9.2の進角行への「将来枠(§2(d)発動、2026-07-23)」注記と§2(d)の状態更新を、Phase 2ゲートのdocs-only変更として人間承認に載せる。具体的な変更案は`docs/phase2-step10-plan.md` v3の該当節を参照

## 9. 見積り担当としての最終所見(v3、Fable判定を受けて)

Fableの判定(8節)を全面的に妥当と判断する。8.2節の発見(現行の無誘導モデルではspec §9.2の特性シフトを原理的に再現できない)は、本見積りの下調べだけでは気づけなかった、電気モデルの根本に関わる論点であり、Fableレビューの意義を示す好例である。(d)を将来枠へ降格し、Phase4は溝掘りジェスチャーを接触品質(チャタリング・D05)のみへ接続する既定フォールバックで進めることに同意する。spec.md/CLAUDE.md/AGENTS.mdへの反映は、本見積り文書の確定とは別に、人間承認を経てから行う。
