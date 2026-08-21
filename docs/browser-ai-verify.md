# ブラウザAI検証

人間が手順を出し、AIが「開いて、押して、画面を見て報告」するときの切り分けと道具。実機USB・WDA・ゲームSDK埋め込みは使わない。

## 判定(このリポジトリ)

**種類C. ハイブリッド**(Unity WebGLではない)。

| 層 | 実装 | AIがボタンを見つける方法 |
|---|---|---|
| タイトル・モード選択・計測・店相当のメニュー | React DOMの`<button>` | アクセシビリティツリーで名前指定。vision不要 |
| 走行・モーター断面 | Canvas 2D(`RaceCanvas` / `MotorCanvas` / `CourseRaceCanvas`) | スクショ+座標クリック。`--caps=vision` |
| ガレージ車体・走行中の車 | SVG(`CarSprite`)。走行Canvasの上に重ねる | 見た目はスクショ。操作は下のHTMLボタン |
| 実験ノートの時系列再生 | Canvas 2D | 見た目確認のみ |

DevToolsで「標準車体でテスト走行」を選ぶとElementsは`<button>`になる。走行画面のトラック地面だけを選ぶと`<canvas>`になる。

V3 Phase 1以降、メニューも低解像度Canvasへ寄せるなら種類B寄りになる。そのときはvision必須のまま、`window.__DEBUG__`でscene判定する。

## 使う道具

1. **主**: Playwright MCP + vision(`.cursor/mcp.json`)。メニューはDOMスナップショット、Canvasはスクショ
2. **証拠**: chrome-devtools-mcp。クリック無反応のときコンソール・通信・スクショを取る
3. **状態**: `window.__DEBUG__`(`src/debug/gameDebug.ts`)。スクショは見た目、JSはscene/phase判定
4. **繰り返し**: 同じ手順を何回も回す、またはCanvas座標がずれるなら Midscene + Playwright へ移す。初回はMCPで足りる

Playwright MCPとchrome-devtools-mcpを同時に使うとブラウザが2つ立つことがある。遷移はPlaywright、原因調査だけchrome-devtools。

## `window.__DEBUG__`

起動時に`attachGameDebug()`がgetterを載せる。読むたびに現在のDOMとstoreから作る。物理エンジンは知らない。

含むもの: `scene` / `buttons` / `disabledButtons` / `lastClick` / `surfaces` / 走行phase / 生の計測値(`rpm`、`positionM`など)。

含まないもの: 診断の原因、修理すべきパラメータ、図鑑の正解。仕様§1.2の「答えを教えない」をデバッグ口でも守る。

判定例:

```js
const debug = window.__DEBUG__;
debug.scene === 'testRun';
debug.buttons.includes('手で押してスタート');
debug.testRunPhase === 'running';
```

## 最初に回す手順

`npm run dev`のあと、localhost:5173で次を実行する。

1. タイトルが出ること。見出しは「走れ!手作りモーターカー」。`__DEBUG__.scene === 'title'`
2. 「標準車体でテスト走行」を押す。見出し「標準車体テスト走行」と「手で押してスタート」が見えること
3. スタートを押す。走行Canvasが見え、`testRunPhase`が`running`か`complete`になること
4. 各ステップのスクショと、コンソールerrorを残す

「工作コースに挑戦」のコース選択は、テスト走行で10 m直線を完走するまでロックされる。コース画面を見る依頼では先にテスト走行を完走させる。

## まだ任せないこと

音ゲー並みのフレーム単位操作、色の厳密一致、シェーダ1フレーム欠け、クロスオリジンiframe内のDOM。メニュー遷移・文言・レイアウト崩れ・コンソールエラーは現構成で任せる。
