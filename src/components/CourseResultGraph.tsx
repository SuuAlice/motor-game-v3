import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { resolveSegmentAt, type ValidatedTrackDefinition } from '../engine/trackPhysics';
import type { TestRunSample } from '../store/gameStore';

export function CourseResultGraph({ history, track }: { history: TestRunSample[]; track: ValidatedTrackDefinition }) {
  const data = history.map((sample) => ({
    ...sample,
    slopeDeg: resolveSegmentAt(track, sample.positionM)?.segment.slopeDeg ?? 0,
  }));
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 p-3">
      <h4 className="px-2 font-black text-slate-800">走行データ</h4>
      <p className="px-2 text-xs text-slate-500">速度・回転数・電流・勾配を同じ時刻軸で表示します。</p>
      <div className="mt-2 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="t" tickFormatter={(value) => `${Number(value).toFixed(0)}秒`} />
            <YAxis yAxisId="speed" width={42} />
            <YAxis yAxisId="rpm" orientation="right" width={52} />
            <YAxis yAxisId="current" hide />
            <YAxis yAxisId="slope" hide />
            <Tooltip labelFormatter={(value) => `${Number(value).toFixed(2)} 秒`} />
            <Legend />
            <Line yAxisId="speed" dataKey="velocityMps" name="速度 (m/s)" stroke="#0284c7" dot={false} isAnimationActive={false} />
            <Line yAxisId="rpm" dataKey="rpm" name="回転数 (RPM)" stroke="#d97706" dot={false} isAnimationActive={false} />
            <Line yAxisId="current" dataKey="currentA" name="電流 (A)" stroke="#dc2626" dot={false} isAnimationActive={false} />
            <Line yAxisId="slope" dataKey="slopeDeg" name="勾配 (°)" stroke="#7c3aed" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
