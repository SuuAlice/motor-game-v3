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
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<CarRecipe | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const currentRecipe: CarRecipe = {
    motorConfig: config,
    carConfig,
    appearance: { bodyColorId: selection.bodyColorId, accentColorId: selection.accentColorId },
    seed,
  };

  async function copyRecipe() {
    const encoded = encodeRecipe(currentRecipe);
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
    if (!preview) return;
    loadCarRecipe(preview);
    setMessage('車体込みレシピを読み込みました。');
    setPreview(null);
  }

  return (
    <section className="w-full rounded-2xl border border-violet-200 bg-violet-50 p-4" aria-labelledby="recipe-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="recipe-title" className="font-black text-slate-900">車体込みレシピ</h2><p className="text-xs text-slate-600">MC2形式 / シード {seed}</p></div>
        <button type="button" onClick={randomizeSeed} className="text-xs font-bold text-violet-800 underline">シードを変更</button>
      </div>
      <textarea value={code} onChange={(event) => { setCode(event.target.value); setPreview(null); }} placeholder="MC2- または M15- で始まるレシピコード" aria-label="レシピコード" className="mt-3 h-24 w-full rounded-xl border border-violet-200 bg-white p-3 font-mono text-xs" />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={copyRecipe} className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white">現在の設定をコピー</button>
        <button type="button" onClick={inspectRecipe} className="rounded-xl border border-violet-400 bg-white px-3 py-2 text-sm font-black text-violet-900">内容を確認</button>
      </div>
      {preview && <div className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700">
        <p className="font-black text-slate-900">読み込み内容</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <dt>モーター</dt><dd className="font-bold">{preview.motorConfig.coilTurns}回 / {preview.motorConfig.magnetDistanceMm} mm</dd>
          <dt>車体</dt><dd className="font-bold">{preview.carConfig.massG} g / {preview.carConfig.gearRatio}:1</dd>
          <dt>車輪</dt><dd className="font-bold">{preview.carConfig.wheelDiameterMm} mm</dd>
          <dt>外観ID</dt><dd className="font-bold">{preview.appearance.bodyColorId} / {preview.appearance.accentColorId}</dd>
        </dl>
        <button type="button" onClick={applyRecipe} className="mt-3 w-full rounded-xl bg-emerald-700 px-3 py-2 font-black text-white">この設定を読み込む</button>
      </div>}
      {message && <p role="status" className="mt-2 text-xs text-slate-700">{message}</p>}
    </section>
  );
}
