const MAX_OUTPUT_TOKENS = 2200;

function safeText(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function extractResponse(payload) {
  const texts = [];
  const sources = [];
  for (const item of payload.output || []) {
    if (item.type === "message") {
      for (const part of item.content || []) {
        if (part.type === "output_text" && part.text) {
          texts.push(part.text);
          for (const annotation of part.annotations || []) {
            if (annotation.type === "url_citation" && annotation.url) {
              sources.push({ title: annotation.title || annotation.url, url: annotation.url });
            }
          }
        }
      }
    }
    if (item.type === "web_search_call" && item.action && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) {
        if (source.url) sources.push({ title: source.title || source.url, url: source.url });
      }
    }
  }
  return {
    text: texts.join("\n\n").trim(),
    sources: Array.from(new Map(sources.filter(s => /^https?:\/\//i.test(s.url)).map(s => [s.url, s])).values()).slice(0, 10)
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "GET または POST のみ利用できます。" });
  }

  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== "Bearer " + secret) {
    return res.status(401).json({ error: "認証されていません。CRON_SECRET の設定を確認してください。" });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY が設定されていません。" });
  }

  let campaign;
  try {
    campaign = JSON.parse(process.env.MARKETING_CAMPAIGN_JSON || "{}");
  } catch (_) {
    return res.status(500).json({ error: "MARKETING_CAMPAIGN_JSON は有効な JSON ではありません。" });
  }

  const product = safeText(campaign.product, 120);
  if (!product) {
    return res.status(400).json({ error: "MARKETING_CAMPAIGN_JSON に product を設定してください。" });
  }

  const prompt = [
    "あなたは小規模事業者向けの慎重なマーケティング担当AIです。日本語で回答してください。",
    "これは定期実行のマーケティングチェックです。ウェブ検索を使い、今回新しく確認できる情報を調べてください。",
    "確認できた事実と仮説を分け、根拠のない統計・価格・競合情報を作らないでください。見つからない情報は不明と明記してください。",
    "次の6時間に取り組む優先タスクを最大3件、具体的な手順と成果指標つきで提案してください。必要ならSNS投稿案を1件作ってください。",
    "重要：投稿、広告配信、顧客への連絡などを実際に実行したと主張しないでください。公開・送信は別途人間の確認が必要です。成果を保証しないでください。",
    "## 今回の確認事項",
    "## 優先タスク（最大3件）",
    "## SNS投稿案（任意・下書きのみ）",
    "## 成果指標",
    "## 出典と不確実性",
    "",
    "商品・サービス: " + product,
    "説明: " + safeText(campaign.description, 700),
    "対象顧客: " + safeText(campaign.audience, 200),
    "目標: " + safeText(campaign.goal, 100),
    "地域: " + safeText(campaign.region, 100),
    "発信先: " + (Array.isArray(campaign.channels) ? campaign.channels.slice(0, 6).map(x => safeText(x, 40)).join("、") : "未指定"),
    "前回の成果・メモ: " + safeText(campaign.lastResults, 500)
  ].join("\n");

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.1",
        tools: [{ type: "web_search" }],
        input: prompt,
        max_output_tokens: MAX_OUTPUT_TOKENS
      })
    });
    const payload = await upstream.json();
    if (!upstream.ok) {
      console.error("Scheduled marketing AI error:", upstream.status, JSON.stringify(payload).slice(0, 800));
      return res.status(502).json({ error: "定期AI分析に失敗しました。API設定や利用上限を確認してください。" });
    }

    const result = extractResponse(payload);
    if (!result.text) return res.status(502).json({ error: "AIから分析結果を取得できませんでした。" });

    const report = {
      app: "MarketingHub",
      product,
      generatedAt: new Date().toISOString(),
      analysis: result.text,
      sources: result.sources,
      note: "これはAIによる提案です。SNS投稿や広告配信は実行していません。"
    };

    const webhook = process.env.MARKETING_WEBHOOK_URL;
    if (webhook) {
      let webhookUrl;
      try {
        webhookUrl = new URL(webhook);
      } catch (_) {
        return res.status(500).json({ error: "MARKETING_WEBHOOK_URL が有効なURLではありません。" });
      }
      if (webhookUrl.protocol !== "https:") {
        return res.status(400).json({ error: "Webhook は HTTPS URL を指定してください。" });
      }
      const notification = [
        "MarketingHub 定期マーケティングレポート",
        "商品: " + product,
        "生成日時: " + report.generatedAt,
        "",
        result.text,
        "",
        "参照元:",
        ...result.sources.slice(0, 5).map(s => "- " + s.title + " — " + s.url),
        "",
        report.note
      ].join("\n");
      const sent = await fetch(webhookUrl.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: notification, content: notification })
      });
      if (!sent.ok) {
        console.error("Marketing webhook failed:", sent.status);
        return res.status(502).json({ error: "AI分析は完了しましたが、通知先への送信に失敗しました。" });
      }
      report.notificationSent = true;
    } else {
      report.notificationSent = false;
      report.note += " 通知先を設定していないため、結果は実行ログにのみ返されます。";
    }

    return res.status(200).json(report);
  } catch (error) {
    console.error("Scheduled marketing job error:", error && error.message);
    return res.status(502).json({ error: "定期マーケティング処理に接続できませんでした。" });
  }
};
