# P3-0 commit・tagに関する人間PM判断記録

決定日: 2026-08-03

決定者: プロジェクトリード(人間PM)

根拠: `docs/phase3-p3-0-fable-implementation-review.md`のcommit承認条件1〜3。

## 明示承認事項

人間PMは次の3点を明示承認した。

1. P3-0の統治文書を実装と同一commitまたは隣接commitへ含める。Phase 3計画の利用可能な過去版は履歴として保存する。
2. `PROVISIONAL_DISCOVERY_REWARD_G = 500`を、Phase 5で再調整する試遊用仮値として明示認知し、P3-0への導入を承認する。
3. P3-0の全commit完了後、その最終commitへgit tag `p3-0-complete`を付与する。

## 統治文書のcommit対象

- `AGENTS.md` / `CLAUDE.md`
- `docs/spec.md` / `docs/art-spec.md`
- `docs/phase3-plan-v2.md`〜`docs/phase3-plan-v12.md`のうち存在する全版
- `docs/phase3-ui-autopsy-plan.md`(v2)・v3・v4・v5
- `docs/phase3-p3-0-plan.md`
- `docs/phase3-p3-0-implementation-review-request.md`
- `docs/phase3-p3-0-fable-implementation-review.md`
- 本判断記録

## commit対象からの除外

- 人間PMまたはSuu_mot3による正式中継を出所としない`docs/phase3-fable-review.md`と`docs/phase3-fable-action-items.md`
- 正典へ差し替え済みの重複元`docs/spec_1.md`と`docs/art-spec-r2.md`
- Suuレビュー草稿・提出ゲート類
- P3-0と無関係なPhase 2資料
- `docs/temp/`・`shareimg/`・`.codex/`等の一時資料

除外ファイルは本判断で削除を承認したものではない。未追跡のまま保持し、P3-0の選別stageへ含めない。

## 500G仮報酬の認知

`PROVISIONAL_DISCOVERY_REWARD_G = 500`は、新規発見1件につき500Gを加算する。初期所持金1000Gに対して有意な額であり、計画の事前承認後にSuuレビュー是正で追加された経済値であることを人間PMは認知している。

この値は専用定数とUI注記「試遊用の仮値」を伴う暫定値であり、数値保証・本較正はPhase 5で行う。
