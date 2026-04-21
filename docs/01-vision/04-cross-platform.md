---
title: Windows と Mac 両対応について
original: ⑥WindowsとMac両対応について.docx
phase: vision
---

# Windows と Mac 両対応について

**対応済み。** 開発基盤として採用した **Electron** がクロスプラットフォーム対応のため、1 つのコードから両 OS 向けのアプリをビルドできる。

## ビルドコマンド

```bash
npm run build:win   # Windows (.exe)
npm run build:mac   # macOS (.app / .dmg)
npm run build:linux # Linux
```

## 注意事項

- **Mac**: システム音声の取得に「画面収録」権限が必要（macOS のセキュリティ仕様）
- **MVP 開発優先順位**: Mac 優先で実装し、動作確認後に Windows へ展開
- **音声取得の実装方針**: MVP では「PC のマイクから相手の声と自分の声をまとめて拾う」シンプルアプローチを採用（OS 差異を最小化するため）

詳細は [`../03-build-guide/phase-3-speech-to-text.md`](../03-build-guide/phase-3-speech-to-text.md) 参照。
