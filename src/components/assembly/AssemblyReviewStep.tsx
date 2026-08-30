import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { PresetButtons, SliderRow } from '../ParamPanel';
import { BATTERY_PRESETS, MAGNET_PRESETS } from '../../data/parameterPresets';
import { currentLot, currentRecord } from './windingStepState';
import { computeConsumedWireM } from '../../materials/assumedGeometry';
import { WIRE_MATERIALS } from '../../materials/materials';
import { WindingTraceView } from './WindingTraceView';

// spec docs/spec.md §2手順5: 「軸受けに軸を乗せ、磁石を釘の下に置き、電池を接続」
// P4-1B B2: 完成前に**ローター図と材料消費の事実**を確認できるようにする(UI計画§3-5)。
export function AssemblyReviewStep({ draft, setDraft, winding }: AssemblyStepProps) {
  const lot = currentLot(winding);
  const record = currentRecord(winding);
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        軸受けに軸を乗せ、磁石を釘の下に置いて、電池をつなごう。
      </p>

      <PresetButtons
        label="磁石の強さ"
        options={MAGNET_PRESETS}
        value={draft.magnetStrength}
        onChange={(v) => setDraft((prev) => ({ ...prev, magnetStrength: v }))}
      />
      <SliderRow
        label="磁石との距離"
        value={draft.magnetDistanceMm}
        min={2}
        max={30}
        step={1}
        unit="mm"
        onChange={(v) => setDraft((prev) => ({ ...prev, magnetDistanceMm: v }))}
      />
      <PresetButtons
        label="電池"
        options={BATTERY_PRESETS}
        value={draft.batteryVoltage}
        onChange={(v) => setDraft((prev) => ({ ...prev, batteryVoltage: v }))}
      />

      {/* 巻いた記録そのものを見せる。数値表より先に形で確かめられるようにする。 */}
      <WindingTraceView record={record} />

      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <p className="mb-1 font-bold text-slate-700">使う材料</p>
        {lot === null ? (
          <p>まだ巻いていません。</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
            <li>線材: {WIRE_MATERIALS.find((m) => m.id === lot.wireMaterialId)?.nameJa ?? lot.wireMaterialId}</li>
            <li>消費: {computeConsumedWireM(record.length, lot.windingParallelStrands)} メートル</li>
          </ul>
        )}
      </div>

      <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <p className="mb-1 font-bold text-slate-700">できあがったモーター</p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
          {/* 巻き数は記録の長さそのもの。UIが別に持たない。 */}
          <li>巻き数: {record.length}ターン</li>
          <li>線径: {lot?.windingWireGaugeMm ?? draft.wireGaugeMm ?? 0.4}mm</li>
          <li>並列本数: {lot?.windingParallelStrands ?? draft.parallelStrands ?? 1}本</li>
          <li>ワニス: {(draft.varnished ?? false) ? 'あり' : 'なし'}</li>
          <li>スリット幅: {draft.slitWidthMm.toFixed(1)}mm</li>
          <li>削り具合: {Math.round(draft.sandingQuality * 100)}%</li>
          <li>ブラシ圧: {draft.brushPressure.toFixed(2)}</li>
          <li>磁石の強さ: {draft.magnetStrength.toFixed(2)}</li>
          <li>磁石との距離: {draft.magnetDistanceMm}mm</li>
          <li>電池: {draft.batteryVoltage}V</li>
          <li>軸のずれ: {draft.axisOffsetMm.toFixed(1)}mm</li>
        </ul>
      </div>
    </div>
  );
}
