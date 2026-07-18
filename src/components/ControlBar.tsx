import { useGameStore } from '../store/gameStore';

// spec docs/spec.md §4末尾: サンドボックス/調整チャレンジは「始動」ボタンで
// 固定初速を与える(組み立てモードのフリックジェスチャーとは別方式)。
export function ControlBar() {
  const flickStart = useGameStore((s) => s.flickStart);
  const resetSim = useGameStore((s) => s.resetSim);

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={flickStart}
        className="flex-1 rounded-lg bg-amber-600 px-4 py-2 font-bold text-white"
      >
        始動
      </button>
      <button
        type="button"
        onClick={resetSim}
        className="flex-1 rounded-lg bg-slate-200 px-4 py-2 font-bold text-slate-700"
      >
        リセット
      </button>
    </div>
  );
}
