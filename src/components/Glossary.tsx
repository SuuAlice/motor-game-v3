interface GlossaryProps {
  onClose: () => void;
}

const TERMS = [
  {
    term: '逆起電力',
    description: 'コイルが回転することで生じ、電池電圧と逆向きに働く電圧。回転数が上がるほど電流を抑える。',
  },
  {
    term: 'コギング',
    description: '磁石と鉄芯の吸引力によって、回転角度ごとに生じる周期的な抵抗。磁石を近づけるほど強くなる。',
  },
  {
    term: '整流',
    description: '半回転ごとにコイルの電流方向を切り替え、回転トルクの向きを保つ動作。',
  },
  {
    term: 'デューティ',
    description: '1周期のうち通電している時間の割合。整流子のスリット幅や接触状態によって変化する。',
  },
  {
    term: '電池内部抵抗',
    description: '電池の内部にある電気抵抗。大電流時の電圧降下と発熱を生む。',
  },
  {
    term: '慣性モーメント',
    description: '回転速度の変化しにくさを表す量。線径、巻き数、並列本数が増えるほど大きくなる。',
  },
  {
    term: 'RPM',
    description: '1分間あたりの回転数。1,000 RPMは1分間に1,000回転することを示す。',
  },
  {
    term: '変動係数',
    description: '標準偏差を平均値で割った値。回転数や電流のばらつきを、平均値に対する割合で比較できる。',
  },
] as const;

export function Glossary({ onClose }: GlossaryProps) {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 p-4" aria-labelledby="glossary-title">
      <div className="flex items-center justify-between">
        <h2 id="glossary-title" className="text-xl font-bold text-slate-800">
          用語集
        </h2>
        <button type="button" onClick={onClose} className="text-sm text-slate-500 underline">
          閉じる
        </button>
      </div>
      <p className="text-sm text-slate-600">計測とチューニングで使用する用語です。</p>
      <dl className="grid gap-3">
        {TERMS.map(({ term, description }) => (
          <div key={term} className="rounded-lg bg-white p-4 shadow-sm">
            <dt className="font-bold text-slate-800">{term}</dt>
            <dd className="mt-1 text-sm leading-6 text-slate-600">{description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
