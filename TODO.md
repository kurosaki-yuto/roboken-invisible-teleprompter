# Mienaq TODO

GitHub（移管先）: https://github.com/robokenjp/mienaq
GitHub（旧公開リポ）: https://github.com/syun3032-tech/Mienaq ← 非公開化必要
Chatwork: room 433356233
ドメイン: mienaq.com（5/1取得済）
インフラ: AWS（GW明けに小林さんLP/インフラ構築）

## 即対応

### #3 GitHub非公開化確認
- ステータス: 未着手（小林さん指摘4/30、対応すると返信したのみ）
- 作業:
  1. `https://github.com/syun3032-tech/Mienaq` を private へ変更
  2. 最新コードを `robokenjp/mienaq` へ Push 完了確認
  3. 旧リポは確認後アーカイブ or 削除判断
- 注意: 弊社（ロボケン）発注プロダクトは原則弊社リソース内で開発（小林さん4/30方針）

## 高優先

### #2 課金機能（Stripe月額20ドル）実装
- ステータス: 未着手
- 納期: 5月中
- 仕様:
  - 月額20ドル（税抜）サブスク
  - APIキー入力前提（Gemini必須/Deepgram推奨/Anthropic任意/OpenAI任意）
  - 内輪（ロボケン・もちもつ）は無料
- 状況:
  - chatGPT/多言語対応 4/30 実装済
  - Stripe ideactor とは別アカウント作成中（小林さん）
  - LP/AWSインフラ GW明け（土山・小林）
- 連動: 土山さんがLP/AWSインフラ準備、Stripe決済フォーム連携待ち

## 環境構築メモ

```bash
# Electronアプリ（macOS/Windows両対応）
npm install
# APIキー: Gemini/Deepgram/Anthropic/OpenAI
npm run dev  # 設定画面でキー入力
```

## 機能リスト（4/27時点）

- 商談中相手から見えない透過カンペ
- 自分・相手のリアルタイム文字起こし
- ホットキー Cmd+K / F9 でAI次の一言提案
- Auto Coach（相手発話の間に自動サジェスト）
- AI: Gemini / Claude / ChatGPT 切替可
- スライド自動切替検知
- 議事録・要約・スライド画像のローカル保存
- APIキーはOS暗号化領域保存（セキュア）
- パニックキー（緊急非表示）
- 多言語対応（4/30 追加実装）

## ユースケース（寺田氏例示）

オンライン商談・講座・面接・YouTuber・MTG・ITヘルプデスク・投資家ピッチ・ウェビナーQA・多言語MTG・コードレビュー・デザインレビュー・法務交渉・記者会見・コンサル・調達価格交渉
