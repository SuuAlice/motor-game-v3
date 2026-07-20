interface IndoorCourseDecorProps {
  positionM: number;
}

export function IndoorCourseDecor({ positionM }: IndoorCourseDecorProps) {
  const farOffset = (positionM * 36) % 720;
  // near層(180 px/m)との距離が近いため、mid層は0.55倍で追従させる。
  const midOffset = (positionM * 99) % 720;

  return (
    <svg viewBox="0 0 720 360" aria-hidden="true" className="h-full w-full">
      <g data-layer="far" transform={`translate(${-farOffset} 0)`} opacity="0.72">
        <FarWallNotes x={80} />
        <FarWallNotes x={800} />
      </g>
      <g data-layer="mid" transform={`translate(${-midOffset} 0)`}>
        <DeskItems x={20} />
        <DeskItems x={740} />
      </g>
    </svg>
  );
}

function FarWallNotes({ x }: { x: number }) {
  return (
    <g data-part="wall-notes" transform={`translate(${x} 0)`}>
      <rect x="0" y="66" width="58" height="42" rx="2" fill="#fef3c7" stroke="#d6b96f" strokeWidth="2" />
      <path d="M10 79h38M10 89h29M10 99h34" stroke="#b89a57" strokeWidth="2" />
      <circle cx="29" cy="66" r="4" fill="#ef4444" />
      <rect x="520" y="72" width="76" height="34" rx="2" fill="#e0f2fe" stroke="#93c5fd" strokeWidth="2" />
      <path d="M531 84h53M531 94h38" stroke="#60a5fa" strokeWidth="2" />
    </g>
  );
}

function DeskItems({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <g data-part="parts-box" transform="translate(48 157)">
        <rect x="0" y="0" width="150" height="48" rx="6" fill="#dbeafe" fillOpacity="0.88" stroke="#64748b" strokeWidth="2.5" />
        <path d="M50 2v44M100 2v44M2 24h146" stroke="#94a3b8" strokeWidth="2" />
        <g data-part="gears" fill="#eab308" stroke="#854d0e" strokeWidth="1.5">
          <path d="M24 5l3 3 4-1 1 4 4 2-2 4 1 4-5 1-2 3-4-3-4 1-1-4-4-2 2-4-1-4 5-1z" />
          <circle cx="24" cy="15" r="4" fill="#dbeafe" />
          <path d="M40 9l2 2 3-1 1 3 3 1-1 3 1 3-3 1-1 3-3-1-2 2-2-3-3-1 1-3-2-2 3-2v-3z" fill="#f97316" />
          <circle cx="41" cy="16" r="2.5" fill="#dbeafe" />
        </g>
        <g data-part="screws" stroke="#475569" strokeWidth="2" strokeLinecap="round">
          <path d="M58 9l13 9M64 7l12 7M78 8l-12 12M84 7l8 12M58 19l10-8M82 20l10-9" />
          <path d="M57 8l4-2M62 6l4-2M76 7l4-2M83 6l4-1M56 18l-3-3M81 19l4-2" strokeWidth="3" />
        </g>
        <g data-part="wire-bundles" fill="none" strokeWidth="2.6">
          <path d="M108 7c12-5 30 1 29 7-1 7-22 7-27 2-5-5 10-10 25-5" stroke="#dc2626" />
          <path d="M105 17c7-8 30-8 35-2 5 7-16 10-27 6-11-4-2-11 14-12" stroke="#2563eb" />
          <path d="M107 11c10 8 27 11 34 4" stroke="#f59e0b" />
          <path d="M111 20l-5 3M136 19l6 3" stroke="#334155" />
        </g>
        <g data-part="small-parts">
          <circle cx="15" cy="34" r="5" fill="#64748b" />
          <circle cx="28" cy="37" r="4" fill="#f59e0b" />
          <rect x="35" y="29" width="10" height="11" rx="2" fill="#0f766e" />
          <path d="M55 33h35M59 29l8 12M73 28l-6 14M82 30l8 8" stroke="#b45309" strokeWidth="2.4" />
          <circle cx="115" cy="34" r="7" fill="none" stroke="#64748b" strokeWidth="3" />
          <circle cx="132" cy="36" r="5" fill="none" stroke="#f97316" strokeWidth="3" />
          <path d="M104 42c10-9 25-10 38-4" fill="none" stroke="#16a34a" strokeWidth="2.5" />
        </g>
        <rect x="2" y="2" width="146" height="44" rx="4" fill="#eff6ff" fillOpacity="0.16" />
        <rect x="56" y="-5" width="38" height="9" rx="4" fill="#475569" />
      </g>

      <g data-part="tester" transform="translate(278 145)">
        <rect x="0" y="0" width="74" height="62" rx="7" fill="#fbbf24" stroke="#713f12" strokeWidth="3" />
        <rect x="12" y="9" width="50" height="18" rx="2" fill="#d9f99d" stroke="#365314" strokeWidth="2" />
        <path d="M20 18h25M49 14v8" stroke="#365314" strokeWidth="2" />
        <circle cx="37" cy="42" r="10" fill="#334155" stroke="#0f172a" strokeWidth="2" />
        <path d="M37 42l7-7" stroke="#f8fafc" strokeWidth="2" />
        <circle cx="19" cy="54" r="3" fill="#111827" />
        <circle cx="55" cy="54" r="3" fill="#dc2626" />
        <path d="M19 56c-5 8 4 11 11 6M55 56c5 8-4 11-11 6" fill="none" stroke="#334155" strokeWidth="2.5" />
        <path d="M30 62h14" stroke="#64748b" strokeWidth="5" strokeLinecap="round" />
      </g>

      <g data-part="toolbox" transform="translate(456 134)">
        <path d="M38 12V5c0-4 4-5 8-5h34c4 0 8 1 8 5v7" fill="none" stroke="#7f1d1d" strokeWidth="6" />
        <rect x="0" y="12" width="130" height="54" rx="7" fill="#dc2626" stroke="#7f1d1d" strokeWidth="3" />
        <path d="M2 34h126" stroke="#fecaca" strokeWidth="3" />
        <rect x="55" y="28" width="20" height="13" rx="2" fill="#fde68a" stroke="#854d0e" strokeWidth="2" />
        <path d="M17 52h34M80 52h34" stroke="#991b1b" strokeWidth="3" strokeLinecap="round" />
      </g>
    </g>
  );
}
