import { useState } from 'react';
import { decodeRecipe, encodeRecipe, RecipeCodeError } from '../data/recipeCodec';
import { useGameStore } from '../store/gameStore';

export function RecipePanel() {
  const config = useGameStore((s) => s.config);
  const seed = useGameStore((s) => s.recipeSeed);
  const loadRecipe = useGameStore((s) => s.loadRecipe);
  const randomizeSeed = useGameStore((s) => s.randomizeRecipeSeed);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function copyRecipe() {
    const recipe = encodeRecipe({ config, seed });
    try {
      await navigator.clipboard.writeText(recipe);
      setMessage('レシピをクリップボードへコピーしました。');
    } catch {
      setCode(recipe);
      setMessage('自動コピーできませんでした。表示したコードをコピーしてください。');
    }
  }

  function pasteRecipe() {
    try {
      const recipe = decodeRecipe(code);
      loadRecipe(recipe.config, recipe.seed);
      setMessage('レシピを読み込みました。範囲外の値は物理範囲へ補正されています。');
    } catch (error) {
      setMessage(error instanceof RecipeCodeError ? error.message : 'レシピを読み込めません。');
    }
  }

  return (
    <section className="w-full rounded-lg bg-white p-4 shadow-sm" aria-labelledby="recipe-title">
      <div className="flex items-center justify-between gap-3">
        <div><h2 id="recipe-title" className="font-bold text-slate-800">モーターレシピ</h2><p className="text-xs text-slate-500">シード: {seed}</p></div>
        <button type="button" onClick={randomizeSeed} className="text-xs text-slate-500 underline">シードを変更</button>
      </div>
      <textarea
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="M15-で始まるレシピコード"
        aria-label="レシピコード"
        className="mt-3 h-20 w-full rounded border border-slate-300 p-2 font-mono text-xs"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={copyRecipe} className="rounded bg-violet-700 px-3 py-2 text-sm font-bold text-white">レシピをコピー</button>
        <button type="button" onClick={pasteRecipe} className="rounded border border-violet-300 px-3 py-2 text-sm font-bold text-violet-800">レシピを読み込む</button>
      </div>
      {message && <p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}
    </section>
  );
}
