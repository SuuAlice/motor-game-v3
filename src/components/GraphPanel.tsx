import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useGameStore } from '../store/gameStore';

// spec docs/spec.md §4: 「サンドボックスのグラフには RPM・電流に加えて逆起電力もプロット」
// 毎フレーム(60Hz)ではなくサンプリングして、rechartsの描画負荷とバッファ量を抑える。
const SAMPLE_INTERVAL_MS = 100;
const HISTORY_WINDOW_SEC = 10;
const MAX_SAMPLES = (HISTORY_WINDOW_SEC * 1000) / SAMPLE_INTERVAL_MS;

interface Sample {
  t: number; // グラフ開始からの経過秒
  rpm: number;
  current: number;
  backEmf: number;
}

export function GraphPanel() {
  const [history, setHistory] = useState<Sample[]>([]);
  const startTimeRef = useRef(performance.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      const { simState } = useGameStore.getState();
      const t = (performance.now() - startTimeRef.current) / 1000;
      setHistory((prev) => {
        const next = [
          ...prev,
          { t, rpm: simState.rpm, current: simState.current, backEmf: simState.backEmf },
        ];
        return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
      });
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="h-56 w-full rounded-lg bg-white p-2 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history}>
          <XAxis dataKey="t" tickFormatter={(v) => `${Math.round(v)}s`} />
          {/* RPMは数百〜千のオーダー、電流/逆起電力は0〜3程度なので軸を分ける */}
          <YAxis yAxisId="rpm" />
          <YAxis yAxisId="volts" orientation="right" />
          <Tooltip labelFormatter={(v) => `${Number(v).toFixed(1)}秒`} />
          <Legend />
          <Line
            yAxisId="rpm"
            type="monotone"
            dataKey="rpm"
            name="回転数(RPM)"
            stroke="#d97706"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="volts"
            type="monotone"
            dataKey="current"
            name="電流(A)"
            stroke="#2563eb"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="volts"
            type="monotone"
            dataKey="backEmf"
            name="逆起電力(V)"
            stroke="#16a34a"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
