// spec §5.4: 会場選択は家の見取り図様式(俯瞰の間取り図に会場アイコンを配置)。
// Mode7ズーム試作の題材として、卓上世界の間取り図をプロシージャルに生成する
// ダミーソースピクセル関数(実画像ファイルは使わない、内製手続き生成の原則)。
import { PALETTE } from '../../retro/palette';

export const FLOOR_PLAN_WIDTH_PX = 160;
export const FLOOR_PLAN_HEIGHT_PX = 120;

interface Room {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  color: string;
}

// spec §5.1の会場カタログ(工作机サーキット・廊下ストレート・階段スロープ・
// 縁側〜庭・模型店ジオラマ)を大まかな部屋割りとして配置する。
const ROOMS: Room[] = [
  { x: 4, y: 4, widthPx: 56, heightPx: 46, color: PALETTE.W3 }, // 工作机サーキット
  { x: 64, y: 4, widthPx: 92, heightPx: 26, color: PALETTE.B5 }, // 廊下ストレート
  { x: 64, y: 34, widthPx: 46, heightPx: 46, color: PALETTE.S3 }, // 階段スロープ
  { x: 114, y: 34, widthPx: 42, heightPx: 46, color: PALETTE.G4 }, // 縁側〜庭
  { x: 4, y: 54, widthPx: 152, heightPx: 62, color: PALETTE.W2 }, // 模型店ジオラマ
];

const WALL_GRID_PX = 20;

// (x, y)がソース範囲外ならnull、壁線ならN1、部屋の中ならその部屋の色、
// どこにも属さなければ床の地色N4を返す。
export function getFloorPlanPixel(x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= FLOOR_PLAN_WIDTH_PX || y >= FLOOR_PLAN_HEIGHT_PX) return null;
  if (x % WALL_GRID_PX === 0 || y % WALL_GRID_PX === 0) return PALETTE.N1;
  for (const room of ROOMS) {
    if (x >= room.x && x < room.x + room.widthPx && y >= room.y && y < room.y + room.heightPx) {
      return room.color;
    }
  }
  return PALETTE.N4;
}
