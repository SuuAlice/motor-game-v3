export interface CarAppearance {
  chassisColor: string;
  accentColor: string;
}

export type BatteryPositionPreset = 'rear' | 'center' | 'front';

interface CarSpriteProps {
  wheelDiameterMm: number;
  batteryPositionPreset: BatteryPositionPreset;
  appearance: CarAppearance;
  wheelAngleRad: number;
  motorAngleRad: number;
  isSlipping: boolean;
  vibrationOffset: number;
}

const BATTERY_X: Record<BatteryPositionPreset, number> = {
  rear: 410,
  center: 445,
  front: 480,
};

export function CarSprite({
  wheelDiameterMm,
  batteryPositionPreset,
  appearance,
  wheelAngleRad,
  motorAngleRad,
  isSlipping,
  vibrationOffset,
}: CarSpriteProps) {
  const wheelRadius = 42 * (wheelDiameterMm / 30);
  const batteryX = BATTERY_X[batteryPositionPreset];
  const wheelRotationDeg = wheelAngleRad * (180 / Math.PI);
  const motorRotationDeg = motorAngleRad * (180 / Math.PI);
  const coilDepthScale = 0.18 + Math.abs(Math.cos(motorAngleRad)) * 0.82;

  return (
    <svg viewBox="70 120 570 230" role="img" aria-label="部品が露出した手作りモーターカーの側面" className="h-full w-full overflow-visible">
      <g transform={`translate(0 ${vibrationOffset})`}>
        <ellipse cx="345" cy="310" rx="250" ry="9" fill="#0f172a" opacity="0.12" />

        <g data-part="wheels">
          <Wheel cx={190} cy={270} radius={wheelRadius} rotationDeg={wheelRotationDeg} />
          <Wheel cx={510} cy={270} radius={wheelRadius} rotationDeg={wheelRotationDeg} />
          {isSlipping && (
            <g stroke={appearance.accentColor} strokeWidth="5" strokeLinecap="round" opacity="0.9">
              <path d="M135 324h-34M147 337h-24M565 324h34M553 337h24" />
            </g>
          )}
        </g>

        <g data-part="chassis">
          <rect x="125" y="216" width="450" height="19" rx="3" fill={appearance.chassisColor} stroke="#8a6a3d" strokeWidth="3" />
          <path d="M135 226h428" stroke="#8a6a3d" strokeWidth="2" strokeDasharray="7 6" opacity="0.55" />
          <rect x="174" y="234" width="30" height="27" fill="#b98a54" stroke="#8a6a3d" strokeWidth="2" />
          <rect x="495" y="234" width="30" height="27" fill="#b98a54" stroke="#8a6a3d" strokeWidth="2" />
        </g>

        <g data-part="gear">
          <g transform={`rotate(${wheelRotationDeg} 207 224)`}>
            <circle cx="207" cy="224" r="28" fill="#fbbf24" stroke="#b45309" strokeWidth="4" strokeDasharray="4 4" />
            <path d="M207 200v10M207 238v10M183 224h10M221 224h10" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
            <circle cx="207" cy="224" r="5" fill="#7c2d12" />
          </g>
          <g transform={`rotate(${-motorRotationDeg} 243 202)`}>
            <circle cx="243" cy="202" r="14" fill="#fde047" stroke="#b45309" strokeWidth="3" strokeDasharray="3 3" />
            <path d="M243 190v7M243 207v7" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="243" cy="202" r="3" fill="#7c2d12" />
          </g>
        </g>

        <g data-part="motor">
          <path d="M243 202h187" stroke="#9aa0a6" strokeWidth="5" strokeLinecap="round" />
          <rect x="292" y="168" width="55" height="13" rx="2" fill="#6b7280" stroke="#374151" strokeWidth="2" />
          <rect x="292" y="223" width="55" height="13" rx="2" fill="#6b7280" stroke="#374151" strokeWidth="2" />
          <text x="319" y="178" textAnchor="middle" fontSize="10" fill="#fff">N</text>
          <text x="319" y="233" textAnchor="middle" fontSize="10" fill="#fff">S</text>
          <g transform={`translate(320 202) scale(1 ${coilDepthScale}) translate(-320 -202)`}>
            {[31, 25, 19, 13].map((rx) => (
              <ellipse key={rx} cx="320" cy="202" rx={rx} ry={rx * 0.58} fill="none" stroke="#b87333" strokeWidth="3" />
            ))}
            <path d="M289 202h62M320 184v36" stroke="#f59e0b" strokeWidth="2.5" opacity="0.9" />
            <circle cx="320" cy="202" r="4" fill="#7c4a12" />
          </g>
          <g transform={`rotate(${motorRotationDeg} 405.5 202)`}>
            <rect x="398" y="193" width="15" height="18" rx="2" fill="#b87333" stroke="#7c4a12" strokeWidth="2" />
            <path d="M405.5 193v18" stroke="#fcd34d" strokeWidth="2" />
          </g>
          <path d="M430 196h-14l-8 4M430 208h-14l-8-4" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
        </g>

        <g data-part="battery-wires" fill="none" strokeWidth="3" strokeLinecap="round">
          <path d={`M${batteryX - 10} 185 C${batteryX - 28} 182 444 190 430 196`} stroke="#dc2626" />
          <path d={`M${batteryX + 91} 187 C${batteryX + 105} 222 468 222 430 208`} stroke="#1f2937" />
        </g>
        <g data-part="battery" transform={`translate(${batteryX - 445} 0)`}>
          <rect x="435" y="173" width="94" height="29" rx="9" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="2" />
          <rect x="468" y="173" width="31" height="29" fill={appearance.accentColor} />
          <rect x="529" y="181" width="7" height="13" fill="#9ca3af" />
          <circle cx="435" cy="185" r="3" fill="#dc2626" />
        </g>

        <g data-part="flag">
          <path d="M558 216v-58" stroke="#8a6a3d" strokeWidth="4" />
          <path d="M558 158l48 9-48 13z" fill={appearance.accentColor} />
        </g>
      </g>
    </svg>
  );
}

function Wheel({ cx, cy, radius, rotationDeg }: { cx: number; cy: number; radius: number; rotationDeg: number }) {
  return (
    <g transform={`rotate(${rotationDeg} ${cx} ${cy})`}>
      <circle cx={cx} cy={cy} r={radius} fill="#23262b" />
      <circle cx={cx} cy={cy} r={radius * 0.64} fill="#e5e7eb" stroke="#9ca3af" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={radius * 0.14} fill="#4b5563" />
      <path d={`M${cx} ${cy - radius * 0.7}v${-radius * 0.23}`} stroke="#fff" strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}
