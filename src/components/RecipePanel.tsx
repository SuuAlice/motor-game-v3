import { useState } from 'react';
import {
  decodeRecipe,
  encodeRecipe,
  RecipeCodeError,
  type CarRecipe,
} from '../engine/recipeCode';
import {
  DEFAULT_GARAGE_SELECTION,
  resolveGarageBuild,
} from '../data/partPresets';
import { useGameStore } from '../store/gameStore';
import { useSaveStore } from '../store/saveStore';
import { selectEquippedWindingRecord } from '../store/equippedWinding';

const DEFAULT_BUILD = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
const DEFAULT_APPEARANCE = {
  bodyColorId: DEFAULT_GARAGE_SELECTION.bodyColorId,
  accentColorId: DEFAULT_GARAGE_SELECTION.accentColorId,
};

export function RecipePanel() {
  const config = useGameStore((state) => state.config);
  const carConfig = useGameStore((state) => state.carConfig);
  const selection = useGameStore((state) => state.garageSelection);
  const seed = useGameStore((state) => state.recipeSeed);
  const loadCarRecipe = useGameStore((state) => state.loadCarRecipe);
  const randomizeSeed = useGameStore((state) => state.randomizeRecipeSeed);
  const inventory = useSaveStore((state) => state.inventory);
  const equipmentLoadout = useSaveStore((state) => state.equipmentLoadout);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<CarRecipe | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // P4-1B B5: 装備中ローターの記録は`selectEquippedWindingRecord`が単一出典。
  // ここで`equipmentLoadout`と`rotorAssemblies`を突き合わせ直すと、recipeKeyや
  // 走行構築と**別の記録**を参照しうる。
  const windingRecord = selectEquippedWindingRecord(inventory, equipmentLoadout);
  // 記録が無いのは旧個体(legacy)か壊れたloadout。どちらもMC4は作れない。
  const canExport = windingRecord !== null;

  const currentRecipe: CarRecipe = {
    motorConfig: config,
    carConfig,
    appearance: { bodyColorId: selection.bodyColorId, accentColorId: selection.accentColorId },
    seed,
    windingRecord,
  };

  async function copyRecipe() {
    if (!canExport) return;
    // `encodeRecipe`はMC4のfail-closed契約により、記録と`coilTurns`の不一致や
    // 巻きスペース超過でthrowする。LabModeのParamPanelは装備ローターの記録とは
    // 独立に`coilTurns`・線径・並列本数を動かせるため、この経路は**実際に到達する**。
    // tryの外で呼ぶと未捕捉例外になるので、生成もここで囲んで理由を表示する。
    let encoded: string;
    try {
      encoded = encodeRecipe(currentRecipe);
    } catch (error) {
      setCode('');
      setMessage(error instanceof RecipeCodeError
        ? `この構成ではレシピを共有できません: ${error.message}`
        : 'この構成ではレシピを共有できません。');
      return;
    }
    setCode(encoded);
    try {
      await navigator.clipboard.writeText(encoded);
      setMessage('車体込みレシピをコピーしました。');
    } catch {
      setMessage('自動コピーできませんでした。表示したコードをコピーしてください。');
    }
  }

  function inspectRecipe() {
    try {
      const decoded = decodeRecipe(code, DEFAULT_BUILD.carConfig, DEFAULT_APPEARANCE);
      setPreview(decoded);
      setMessage(code.trim().startsWith('M15-') ? '旧レシピを標準車体で補完しました。内容を確認してください。' : '内容を確認してください。');
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof RecipeCodeError ? error.message : 'レシピを読み取れません。');
    }
  }

  function applyRecipe() {
    if (!preview || preview.windingRecord !== null) return;
    loadCarRecipe(preview);
    setMessage('車体込みレシピを読み込みました。');
    setPreview(null);
  }

  return (
    <section className="w-full rounded-2xl border border-violet-200 bg-violet-50 p-4" aria-labelledby="recipe-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="recipe-title" className="font-black text-slate-900">車体込みレシピ</h2><p className="text-xs text-slate-600">MC4形式 / シード {seed}</p></div>
        <button type="button" onClick={randomizeSeed} className="text-xs font-bold text-violet-800 underline">シードを変更</button>
      </div>
      <textarea value={code} onChange={(event) => { setCode(event.target.value); setPreview(null); }} placeholder="MC4-、MC3-、MC2- または M15- で始まるレシピコード" aria-label="レシピコード" className="mt-3 h-24 w-full rounded-xl border border-violet-200 bg-white p-3 font-mono text-xs" />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {/* 記録が無い機体でも**ボタンは消さない**。押せない理由を常設ノードで示す。 */}
        <button type="button" onClick={copyRecipe} disabled={!canExport}
          className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white disabled:bg-slate-400">
          現在の設定をコピー
        </button>
        <button type="button" onClick={inspectRecipe} className="rounded-xl border border-violet-400 bg-white px-3 py-2 text-sm font-black text-violet-900">内容を確認</button>
      </div>
      <p role="status" className="mt-2 min-h-[1rem] text-xs text-slate-700">
        {canExport
          ? `巻線の記録あり(${windingRecord?.length ?? 0}ターン)`
          : '巻線の記録はありません(この機体を作った時点では記録していませんでした)'}
      </p>
      {preview && <div className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700">
        <p className="font-black text-slate-900">読み込み内容</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <dt>モーター</dt><dd className="font-bold">{preview.motorConfig.coilTurns}回 / {preview.motorConfig.magnetDistanceMm} mm</dd>
          <dt>車体</dt><dd className="font-bold">{preview.carConfig.massG} g / {preview.carConfig.gearRatio}:1</dd>
          <dt>車輪</dt><dd className="font-bold">{preview.carConfig.wheelDiameterMm} mm</dd>
          <dt>外観ID</dt><dd className="font-bold">{preview.appearance.bodyColorId} / {preview.appearance.accentColorId}</dd>
          <dt>巻線</dt><dd className="font-bold">
            {preview.windingRecord === null ? '記録なし' : `記録あり(${preview.windingRecord.length}ターン)`}
          </dd>
        </dl>
        {/* 巻線記録つきのMC4は**破損ではない**。読み込めないのは能力の境界であり、
            その理由をそのまま出す(型紙機能が入るまで記録を再現できない)。 */}
        <button type="button" onClick={applyRecipe} disabled={preview.windingRecord !== null}
          className="mt-3 w-full rounded-xl bg-emerald-700 px-3 py-2 font-black text-white disabled:bg-slate-400">
          この設定を読み込む
        </button>
        {preview.windingRecord !== null && (
          <p role="status" className="mt-2 text-xs text-slate-700">
            このレシピの巻線記録の再現は、型紙機能の実装後に対応します
          </p>
        )}
      </div>}
      {message && <p role="status" className="mt-2 text-xs text-slate-700">{message}</p>}
    </section>
  );
}
