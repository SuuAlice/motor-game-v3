// spec docs/spec.md §3.7 物理定数表(値・単位ともに表のとおり)。
// §3.7の設計目標(適正パラメータで約1000RPM収束・電流比40〜60%・
// brushPressure=1.0で停止/0.3で回転)から逆算した値。
export const J_NAIL = 2.0e-5; // kg·m²(釘+軸+整流子の基礎慣性)
// K_J・R_COIL_PER_TURN(1巻きあたりの慣性寄与・抵抗、§3.1/§3.3)は、
// spec-v1.5.md §2.1で線径依存の式に置き換えられたため、下のR_REF/K_J_REFに
// 統合した(d=D_REF・S=1のときの値としてそちらに引き継がれている。定義はそちらを参照)
export const K_T = 2.0e-3; // N·m/(T·A·turn)(トルク定数、§3.2)
export const K_E = 2.0e-3; // V·s/(T·turn·rad)(逆起電力定数、§3.3。K_Tと同一値)
export const R_COMMUTATOR_MM = 5.0; // mm(整流子半径、§3.2のデッドゾーン換算に使用)
export const MU_BRUSH = 2.5e-2; // N·m(ブラシ圧P=1時の摩擦係数、§3.4)
export const C_DRAG = 1.0e-6; // N·m·s/rad(粘性抵抗係数、§3.4)
export const OMEGA_EPS = 0.5; // rad/s(静止判定の閾値、§3.4)
// K_VIB: spec表で「チューニング対象」と明記された定数。以下はサンドボックスでの
// チューニングを前提とした出発点(§3.7末尾の目安RPMを崩さない範囲で選定)。
export const K_VIB = 1.0e-4;

// spec docs/spec.md §3.7.1 磁束密度Bの算出用定数(v2で追加)
export const B_MATERIAL_MIN = 0.028; // T(magnetStrength=0、フェライト相当)
export const B_MATERIAL_MAX = 0.14; // T(magnetStrength=1、ネオジム相当)
export const B_REF_DISTANCE_MM = 5.0; // mm(距離減衰の基準距離。可動域下限と一致)
export const K_B_DISTANCE = 0.04; // 1/mm(距離による指数減衰係数)
export const B_FLOOR_RATIO = 0.15; // 遠距離での下限をB_materialの何倍にするか

// ここから下はspec §3.7の表にない追加定数(spec本文が式の骨格のみを規定している
// 箇所を実装するために必要。サンドボックスでのチューニング対象)。

// 接触抵抗モデル(§3.3「削り残し度とブラシ圧から算出」の実装、指数減衰+floor)
export const R_CONTACT_FLOOR = 0.05; // Ω(削り・圧が理想的でも残る下限抵抗)
export const R_CONTACT_SCALE = 5.0; // Ω(削り残し・圧不足による抵抗増加の規模)
export const K_SANDING = 3.0; // 削り具合に対する減衰の鋭さ
export const K_PRESSURE = 3.0; // ブラシ圧に対する減衰の鋭さ

// チャタリングモデル(§3.5「ブラシ圧が閾値未満のとき、フレームごとに確率で瞬断」の実装)
export const CHATTER_PRESSURE_THRESHOLD = 0.2; // これ未満のbrushPressureで瞬断が起こりうる
export const CHATTER_MAX_PROB = 0.3; // brushPressure=0のときの1ステップあたりの瞬断発生確率
// Phase3バランス調整で追加。瞬断は単発(1フレーム)だと慣性・RPM移動平均に埋もれて
// ☆2(10秒間±10%安定)の判定を破れないため、発生した瞬断はこのフレーム数だけ持続する
// バーストにする。scripts/tune-chatter.tsでの実験値: 24フレーム(0.2秒)でbrushPressure
// <0.2は確実に☆2を落とす(stalledまたは不安定)一方、0.3以上(spec設計目標の適正値)は
// 無傷であることを確認した。
export const CHATTER_BURST_FRAMES = 24;

// RPM表示の指数移動平均(SimState.rpmは「表示用・移動平均」とのみ規定されており、
// 窓幅はspecに明記がないため追加)
export const RPM_SMOOTHING_ALPHA = 0.1;

// UI操作用の追加定数(spec §3.7の物理定数表には含まれない、engine外のstore/UI層が
// 参照する)。サンドボックス/調整チャレンジの「始動」ボタンが与える固定初速。
// OMEGA_EPS(静止摩擦クランプの閾値)とデッドゾーンを確実に超え、確実に回転を
// 開始させる値から出発する。サンドボックスでのチューニング対象。
export const FLICK_INITIAL_OMEGA = 15; // rad/s

// トラブル診断モード用の追加定数(spec §7タスク8)。「なおった!」と判定する
// 回転数のしきい値。data/brokenMotors.tsの各プリセットは適正パラメータで
// 約1000〜1200RPMに収束するよう作られているため、その半分程度を「健全」の
// 目安にする(修理途中の中途半端な値では成立しない水準)。
export const DIAGNOSIS_HEALTHY_RPM = 500;

// 組み立てモードの始動フリック(spec §4末尾: モーター描画エリアを指ではじく
// ジェスチャー)用の上限クランプ。強く弾きすぎても際限なく初速が乗らないようにする。
// FLICK_INITIAL_OMEGA(ボタン方式の固定初速)よりは強く弾けるが、物理的に
// 不自然にならない範囲を目安にした。
export const MAX_FLICK_OMEGA = 40; // rad/s

// ============================================================
// ここから spec-v1.5.md で追加。v1.0の§3.7物理定数表(上記)は変更しない。
// ============================================================

// spec-v1.5.md §2.1: 線径・並列巻きの物理。D_REF/R_REF/K_J_REFは、v1.0の
// 暗黙の基準(線径0.4mm・シングル巻き)における実測値をそのまま使う
// (後方互換の要。d=D_REF・S=1のとき新公式は旧定数と完全に一致する)。
export const D_REF = 0.4; // mm(v1.0の暗黙の基準線径)
export const R_REF = 0.02; // Ω/turn(旧R_COIL_PER_TURNの値。d=D_REF・S=1での抵抗)
export const K_J_REF = 5.0e-8; // kg·m²/turn(旧K_Jの値。d=D_REF・S=1での慣性寄与)
// 「d=0.4mm・シングル巻きで150回巻ける」(v1.0のcoilTurns上限)から逆算:
// COIL_WINDOW / (0.4² · 1) = 150 → COIL_WINDOW = 24
export const COIL_WINDOW = 24; // mm²(巻きスペースの物理制約)

// spec-v1.5.md §2.2: ワニス固め工程と高回転崩壊。
// 「無ワニスで2000RPM超を数秒維持すると崩壊」という設計目標をそのまま単位変換した
// (2000RPM = 2000·2π/60 rad/s、3秒 = 3/dt フレーム)。COIL_DEFORM_PENALTY_MMは
// axisOffsetMmの可動域(0–3mm)に対して明確にわかる分量として1mmを初期値にした。
export const COIL_DEFORM_OMEGA = (2000 * 2 * Math.PI) / 60; // rad/s(2000RPM相当)
export const COIL_DEFORM_FRAMES = 360; // 3秒(dt=1/120)
export const COIL_DEFORM_PENALTY_MM = 1.0; // axisOffsetMmへの恒久加算量(セッション中不可逆)

// spec-v1.5.md §3: コギングトルク T_cog = -K_COG·B²·sin(2θ)。
//
// 【構造変更の経緯】§3.1の表(遠い20-30mm→コギング無視できる/中間8-15mm→
// v1.0のバランス帯/近い2-7mm→始動が渋くなる)を満たす単一のK_COGを、T_mag・
// e_backと共有するcomputeB()(磁石距離での減衰がB_FLOOR_RATIO=0.15の下限を持ち、
// 遠距離でも減衰しきらない)にそのまま適用して探索したが、定数調整だけでは
// 両立不可能と実測で判明した: distance=2mmとdistance=15mmの応答比が小さすぎる
// ため、両方の設計目標を満たすK_COGの範囲が0.45〜0.455という極めて狭い窓に
// なる上、その値ではcoilTurns=70(適正値80のわずか下)やdistance=18mm以上
// (§3.1表で「無視できる」はずの遠距離帯)まで完全停止させてしまい、通常の
// チャレンジ構成を破壊した(scripts/配下の一時検証スクリプトで確認、コミット外)。
// そのため、コギング専用の距離減衰(下限なし・T_mag/e_backより急峻)を導入し、
// 近距離でのみコギングが強く効くようにした。事前承認された「定数調整で
// 不十分と判明した場合のみのエンジン構造変更」に該当する。
// K_COG_B_DISTANCE=0.15での実測: distance=2mm(neodymium)はFLICK_INITIAL_OMEGAでは
// 始動できないが2倍では始動できる/distance=15mmはFLICK_INITIAL_OMEGAで始動できる、
// を両立するK_COGの安全な範囲は約0.25〜0.52(30シードで確認)。coilTurns=30
// (既にWEAK_COIL_TURNS_THRESHOLD未満で「弱い」判定対象)以外の通常構成
// (coilTurns 40–80、magnetDistanceMm 10–30)は無傷であることも確認済み。
// 中央値のK_COG=0.4を採用。値を変える場合はmotorPhysicsV15.test.tsを再実行すること。
export const K_COG = 0.4;
export const K_COG_B_DISTANCE = 0.15; // 1/mm(コギング専用の距離減衰係数。下限なし。近距離ほど急激に強まり、遠距離でほぼ消える)

// spec-v1.5.md §4: 電池内部抵抗と発熱。アルカリ単3相当を1.5V時の値とし、
// 3.0V(2本直列)は内部抵抗も直列で加算されるため2倍にする。
export const R_BATTERY_INTERNAL_1_5V = 0.15; // Ω(アルカリ単3相当)
export const R_BATTERY_INTERNAL_3V = 0.3; // Ω(1.5Vの2倍)
// 適正運転(短絡でない)では発熱が上がらず、短絡時は単調に上限へ向かうよう
// 数値実験で調整した値。通常運転(適正パラメータ〜太線・低抵抗レシピまで)の
// 電池損失は実測で最大約1.6W程度、短絡時は約22Wに達するため、その間に余裕を
// 持って設定した。
export const HEAT_DISSIPATION = 3.0; // W相当(この値未満のP_battery_lossなら発熱は下がる)
export const BATTERY_HEAT_LIMIT = 1.0; // これに達すると発熱失敗
