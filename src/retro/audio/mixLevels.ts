// Task#19(最悪ケースタブでモーター音がBGMより大きすぎる)の根本原因は、
// BGM側(sequencer.ts computeChannelMix)がチャンネル数で等分する形で
// 合算クリップ防止の予算を持つのに対し、モーター側(motorSound.ts
// computeMotorGain)には同種の予算がなく常時ゲイン1.0固定だったこと。
// BGM・モーター音が同時に鳴る画面(最悪ケースタブ・音源タブ)で合算が
// クリップ(絶対値1.0)を超えないよう、両者の最大予算をここで一元管理する。
// BGM_MASTER_GAIN + MOTOR_MASTER_GAIN <= 1.0 を保つこと(テストで固定)。
//
// Task#AUDIO-MIX-FIX(Suu承認): 人間試聴で「BGM全体が小さい、モーター音が
// 大きすぎる」との指摘を受け、0.8/0.2から0.9/0.1へ再配分した(最終音量凍結
// ではなく実試聴用の第一候補。耳での確認後、必要なら数値のみ再調整する)。
//
// Task#AUDIO-MIX-FIX2(Suu承認): 再試聴で「BGMがまだ小さい、motorはもう少し
// 抑えて」との指摘を受け、0.9/0.1から0.93/0.07へ再配分した。あわせて
// sequencer.ts computePlaybackPlanのgain分割方式を「固定チャンネル数で均等
// 分割」から「譜面から実測した最大同時発音voice数で分割」(score.ts
// computeMaxConcurrentVoices)へ変更しており、体感音量の向上は主にこちらの
// 分割方式変更による(定数の変更幅自体は小さい)。
// P3-4 G7-D(項目M、UI計画§8.3・R21、人間再承認済み): 破壊モードSE用の第三チャンネル
// 予算`SE_MASTER_GAIN`を新設し、既存2チャンネルを0.93/0.07から0.85/0.05へ再配分する。
// BGM_MASTER_GAIN + MOTOR_MASTER_GAIN + SE_MASTER_GAIN <= 1.0 を保つこと(テストで固定)。
//
// **3値とも初期候補**である。G8の人間の耳による較正で最終確定するため、この値を
// 前提に他の音量値を調整しない(§19の分類表)。
export const BGM_MASTER_GAIN = 0.85;
export const MOTOR_MASTER_GAIN = 0.05;

/**
 * 破壊モードSE(D01〜D09)全体で共有する第三チャンネルの予算(初期候補0.10)。
 *
 * 単一のSEバスで管理する——D01/D02・D04炎/D09の継続音と、D02/D03/D04/D05/D06の
 * イベント音は**モードを横断して同時に鳴りうる**ため、モード内だけの上限では
 * 予算超過を防げない(§8.3のv7の誤りとJ3是正)。
 */
export const SE_MASTER_GAIN = 0.1;

// Task#AUDIO-MIX-FIX(Suu承認): 個別楽器の単独試聴(AudioDemo.tsx
// handlePlayInstrument)専用のゲイン。「音色確認用の単独試聴レベル」であり、
// BGM合奏中のvelocity再現ではない。試聴は常にBGM・モーター音を停止してから
// 単独再生する仕様(AudioDemo.tsx側で排他制御)のため、BGM_MASTER_GAIN +
// MOTOR_MASTER_GAIN <= 1.0の同時ミックス予算には含めない。
export const INSTRUMENT_PREVIEW_GAIN = 0.16;

// Task#AUDIO-REVERB-FIX(Suu承認): 残響ON時、BGM信号はdry経路(GainNode×
// REVERB_DRY_MIX)とwet経路(GainNode×REVERB_WET_MIX→Convolver)へ同時分岐して
// destinationで合成する(残響OFF時はdestination直結でREVERB_DRY_MIXの影響を
// 受けない)。REVERB_DRY_MIX + REVERB_WET_MIX <= 1.0 は「dry予算を維持しつつ
// wetを決定論的な基準へ校正する」ための配分係数の予算規律であり、
// Convolver適用後の瞬間振幅がplan.gainを超えないことを保証するものではない
// (畳み込みは時間的にエネルギーが拡散するため、瞬間ピークの数学的保証は
// できない)。
//
// REVERB_IR_TARGET_ENERGY=1は、reverb.ts normalizeImpulseResponseEnergyで
// IRのエネルギー(sum(h^2))を白色雑音相当の入力に対しおおむねユニティRMS利得と
// なる基準へ校正するための目標値であり、任意波形に対する厳密な利得保証ではない。
//
// 数値の経緯: 人間試聴で「残響をつけると小さくなる」との指摘を受け、原因は
// BGMが残響ON時100%Convolver経由(dry成分ゼロ)かつIRが正規化されずConvolverNode
// の既定(normalize=true、ブラウザ内部アルゴリズム依存)任せだったことと判明。
// dry=0.85/wet=0.15はノート再生中の実測RMSがOFF比約81.6%(-1.8dB程度)に収まる
// 第一候補として採用した。
//
// Task#AUDIO-REVERB-MIX-BALANCE(Suu承認): その後の人間試聴で「音量が下がった
// だけで残響がついているか怪しい」との指摘を受け、TASK-AUDIO-REVERB-DIAGの
// 診断用A/B(dry-only/wet-only/mix)で原因切り分けを行った結果、配線は正常で
// wet-only(wet=1.0)では残響(停止後の尾を含む、約1秒)が明確に知覚できることを
// 確認した。つまり原因は配線ではなく、dry=0.85/wet=0.15の配分比ではwet成分が
// dryに埋もれて聞こえないことだった。dry=0.70/wet=0.30(合計1.0を維持)へ
// 再配分し、wetのdry比を17.6%→42.9%(約2.4倍)へ引き上げた。
//
// Task#AUDIO-REVERB-MIX-AESTHETIC(Suu承認): dry=0.70/wet=0.30は機能項目(知覚・
// 音量・ON/OFF・BGM+motor・再生停止反復・尾)はすべて合格したが、人間から
// 「直前に試聴したwet-only(wet=1.0)寄りの残響感の方が好ましい」との美的評価を
// 受けた。TASK-AUDIO-REVERB-MIX-AESTHETIC-DIAGの一時A/B/C比較(現行0.70/0.30・
// 候補1 0.60/0.40・候補2 0.50/0.50)から候補2が選ばれ、dry=0.50/wet=0.50
// (合計1.0を維持)を最終値とする。
export const REVERB_DRY_MIX = 0.5;
export const REVERB_WET_MIX = 0.5;
export const REVERB_IR_TARGET_ENERGY = 1;
