# ドキュメント一覧

Invisible Teleprompter の設計資料・チュートリアルを目的別に整理している。

---

## 何を知りたいかで読む場所を選ぶ

| 目的 | 参照先 |
|------|--------|
| プロダクトが何かを知りたい | [01-vision/](./01-vision/) |
| アーキテクチャ・技術スタックを知りたい | [02-architecture/](./02-architecture/) |
| 実装を追いたい（フェーズ別チュートリアル） | [03-build-guide/](./03-build-guide/) を phase-1 から順に |
| 事業計画・課金・多言語化の設計を知りたい | [04-business/](./04-business/) |

---

## 01-vision — プロダクトのビジョン

| ファイル | 内容 |
|---------|------|
| [01-concept.md](./01-vision/01-concept.md) | プロダクトコンセプト、3 つのコア機能、競合優位性 |
| [02-feature-proposal.md](./01-vision/02-feature-proposal.md) | 議事録保存・スライド連動・ユーザー操作フローの詳細 |
| [03-ai-strategy.md](./01-vision/03-ai-strategy.md) | AI への難問回答・現実的提案のための戦略、システムプロンプト設計 |
| [04-cross-platform.md](./01-vision/04-cross-platform.md) | Windows / Mac 両対応の方針と注意事項 |

## 02-architecture — 設計・技術スタック

| ファイル | 内容 |
|---------|------|
| [mvp-design.md](./02-architecture/mvp-design.md) | システム構成、画面設計、コア機能の処理フロー、10 日間ロードマップ |

## 03-build-guide — フェーズ別実装チュートリアル

**フェーズ 1〜5 を順番に読んで実装する。**

| ファイル | 内容 |
|---------|------|
| [phase-1-transparent-window.md](./03-build-guide/phase-1-transparent-window.md) | 環境構築、electron-vite テンプレート、透過ウィンドウ実装 |
| [phase-2-electron-routing.md](./03-build-guide/phase-2-electron-routing.md) | HashRouter による 3 画面構成、IPC 通信の土台 |
| [phase-3-speech-to-text.md](./03-build-guide/phase-3-speech-to-text.md) | マイク取得、Deepgram WebSocket、`useAudioTranscription` フック |
| [phase-4-gemini-integration.md](./03-build-guide/phase-4-gemini-integration.md) | `desktopCapturer` によるスクリーンショット、`useAiAdvisor` フック、グローバルショートカット |
| [phase-5-saas-foundation.md](./03-build-guide/phase-5-saas-foundation.md) | Prisma/SQLite、i18next 多言語、Stripe 決済、リーガルページ、ビルド・配布 |

## 04-business — 事業計画

| ファイル | 内容 |
|---------|------|
| [01-saas-plan.md](./04-business/01-saas-plan.md) | 料金プラン、原価計算（利益率 70%+）、認証・課金・関係者無料化ロジック |

---

プロジェクト全体の入口は [プロジェクトルートの README.md](../README.md) を参照。
