const MAX_FIELD = 1200;

function clean(value, max = MAX_FIELD) {
  return String(value || "").trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST リクエストのみ利用できます。" });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "AI分析はまだ設定されていません。デプロイ環境に OPENAI_API_KEY を設定してください。"
    });
  }

  const body = req.body || {};
  const product = clean(body.product, 120);
  const description = clean(body.description);
  const audience = clean(body.audience, 240);
  const goal = clean(body.goal, 80);
  const channels = Array.isArray(body.channels) ? body.channels.slice(0, 6).map(x => clean(x, 40)) : [];

  if (!product) return res.status(400).json({ error: "商品・サービス名を入力してください。" });

  const prompt = [
    "あなたは慎重で実務的なマーケティングリサーチャーです。日本語で回答してください。",
    "ウェブ検索を使って、商品・サービスの市場環境と競合を調査してください。",
    "重要ルール：確認できた事実と仮説・提案を明確に分ける。情報が見つからない場合は不明と書く。競合名、価格、統計、トレンドを捏造しない。検索結果に基づく具体的な事実には出典名とURLを示す。検索日を前提に最新性を過大に主張しない。",
    "出力は次の見出しを使って、具体的かつ簡潔にまとめてください。",
    "## 1. 市場の状況（検索で確認できたことと出典）",
    "## 2. 競合・代替手段（実在確認できたもの、特徴、差別化の余地）",
    "## 3. 想定顧客とニーズ（事実と仮説を区別）",
    "## 4. すぐ試せるマーケティング施策3案（優先順位、手順、費用をかけない代替案）",
    "## 5. 次の24時間の実行順序",
    "## 6. 成果指標と検証方法",
    "## 7. 不確実性・追加で確認したい情報",
    "広告配信やSNS投稿を実行したと偽らない。売上や成果を保証しない。根拠のない統計や数字は使わない。",
    "",
    "【商品・サービス】" + product,
    "【説明】" + (description || "未入力"),
    "【ターゲット】" + (audience || "未指定。検索情報から仮説を示す"),
    "【目標】" + (goal || "認知度向上"),
    "【発信先】" + (channels.join("、") || "未指定"),
    "【地域】日本。商品説明に地域があれば優先して考慮する。",
    "調査は小規模事業者や個人でも実行できる現実的な案を優先してください。"
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
        max_output_tokens: 2600
      })
    });

    const payload = await upstream.json();
    if (!upstream.ok) {
      console.error("OpenAI Responses API error:", upstream.status, JSON.stringify(payload).slice(0, 1000));
      return res.status(502).json({
        error: upstream.status === 401
          ? "AI APIの認証に失敗しました。OPENAI_API_KEY の設定を確認してください。"
          : "AIリサーチに失敗しました。API設定や利用上限を確認して、もう一度お試しください。"
      });
    }

    const textParts = [];
    const sources = [];
    for (const item of (payload.output || [])) {
      if (item.type === "message") {
        for (const part of (item.content || [])) {
          if (part.type === "output_text" && part.text) {
            textParts.push(part.text);
            for (const annotation of (part.annotations || [])) {
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

    const uniqueSources = Array.from(new Map(sources.filter(s => /^https?:\/\//i.test(s.url)).map(s => [s.url, s])).values()).slice(0, 12);
    const answer = textParts.join("\n\n").trim();
    if (!answer) return res.status(502).json({ error: "AIから回答を取得できませんでした。もう一度お試しください。" });

    return res.status(200).json({
      analysis: answer,
      sources: uniqueSources,
      model: process.env.OPENAI_MODEL || "gpt-5.1",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Market research endpoint error:", error && error.message);
    return res.status(502).json({ error: "AIリサーチに接続できませんでした。ネットワークや設定を確認してください。" });
  }
};