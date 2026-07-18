// spec docs/spec.md §3.7 物理定数表(値・単位ともに表のとおり)。
// §3.7の設計目標(適正パラメータで約1000RPM収束・電流比40〜60%・
// brushPressure=1.0で停止/0.3で回転)から逆算した値。
export const J_NAIL = 2.0e-5; // kg·m²(釘+軸+整流子の基礎慣性)
export const K_J = 5.0e-8; // kg·m²/turn(1巻きあたりの慣性寄与、§3.1)
export const K_T = 2.0e-3; // N·m/(T·A·turn)(トルク定数、§3.2)
export const K_E = 2.0e-3; // V·s/(T·turn·rad)(逆起電力定数、§3.3。K_Tと同一値)
export const R_COIL_PER_TURN = 0.02; // Ω/turn
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
