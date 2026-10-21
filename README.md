# MarketingHub

商品・サービスの情報から、24時間のマーケティング計画を作り、AIでウェブ検索付きの市場・競合リサーチを行うWebアプリです。定期実行機能を有効にすると、6時間ごとにAIが新しい調査と次のアクション案を作り、任意のWebhookへレポートを通知できます。

## 機能

- 商品・サービス、説明、ターゲット、目標、発信先を入力
- 24時間の時間帯別アクションプランを生成
- SNS投稿文のたたき台と成果指標を提案
- OpenAI Responses API + web search tool による市場・競合調査
- 参照元リンクを表示
- 定期実行（Vercel Cron）：6時間ごとのAIマーケティングチェック
- 任意のWebhookへ定期レポートを通知
- 計画・投稿文のコピー
- PC・スマートフォン向けのレスポンシブ表示
- APIが利用できない場合も、ローカルのルールベース計画は表示

## ローカルでの利用

静的ページのプレビューだけなら `index.html` をブラウザで開けます。24時間プランのローカル生成は動きますが、AIウェブリサーチと定期実行にはサーバー環境が必要です。

## AI分析・定期実行を有効にする（Vercel）

1. このリポジトリをVercelにインポートしてデプロイします。
2. Vercelプロジェクトの環境変数に `OPENAI_API_KEY` を設定します。
3. 必要に応じて `OPENAI_MODEL` を設定します（未設定時は `gpt-5.1`）。
4. 定期実行を使う場合は、十分にランダムな値を `CRON_SECRET` に設定します。
5. `MARKETING_CAMPAIGN_JSON` に対象の商品情報をJSONで設定します。例：

```json
{
  "product": "宮崎のクラフトコーラ",
  "description": "地元の素材を使ったクラフトコーラ",
  "audience": "地元グルメに関心のある20代",
  "goal": "認知度向上",
  "region": "宮崎県",
  "channels": ["Instagram", "X"],
  "lastResults": "初回運用。まだ実績なし"
}
```

6. 任意で `MARKETING_WEBHOOK_URL` に、レポートを受け取るHTTPS Webhook URLを設定します。Webhookの仕様によっては、そのままでは受け取れない場合があります。
7. 再デプロイします。Vercel Cronはデプロイ後に `/api/cron` を6時間ごとに呼び出します。手動テスト時も `Authorization: Bearer <CRON_SECRET>` ヘッダーが必要です。

APIキーやCRON_SECRETはサーバー側の環境変数にのみ保存してください。HTML、JavaScript、公開リポジトリに秘密情報を書き込まないでください。APIの利用には料金や利用上限が関係する場合があるため、事前に確認してください。

## 現時点での制限

- 定期実行が生成するのは調査・戦略・投稿文の「提案」です。SNSへの自動投稿、広告配信、顧客への自動連絡はまだ実装していません。
- 自動実行にはVercelへのデプロイ、環境変数の設定、利用可能なOpenAI APIが必要です。リポジトリにコードを追加しただけでは稼働しません。
- Webhookは任意の通知先へレポートを送りますが、受信サービスが `text` または `content` フィールドを受け付けるとは限りません。受信サービスに合わせた調整が必要な場合があります。
- AI分析は誤る可能性があります。重要な判断の前に参照元を確認してください。売上や成果を保証するものではありません。

## 技術構成

- HTML / CSS / Vanilla JavaScript
- Vercel Node.js serverless functions（`api/analyze.js`, `api/cron.js`）
- Vercel Cron
- OpenAI Responses API のウェブ検索ツール
