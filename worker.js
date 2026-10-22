const MAX_OUTPUT_TOKENS = 2400;

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function clean(value, max = 1200) {
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
          for (const a of part.annotations || []) {
            if (a.type === "url_citation" && a.url) sources.push({ title: a.title || a.url, url: a.url });
          }
        }
      }
    }
    if (item.type === "web_search_call" && item.action && Array.isArray(item.action.sources)) {
      for (const s of item.action.sources) if (s.url) sources.push({ title: s.title || s.url, url: s.url });
    }
  }
  return {
    text: texts.join("\n\n").trim(),
    sources: Array.from(new Map(sources.filter(s => /^https?:\/\//i.test(s.url)).map(s => [s.url, s])).values()).slice(0, 12)
  };
}

async function askOpenAI(env, prompt, tokens = MAX_OUTPUT_TOKENS) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY が未設定です。");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.1",
      tools: [{ type: "web_search" }],
      input: prompt,
      max_output_tokens: tokens
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    console.error("OpenAI API error", response.status, JSON.stringify(payload).slice(0, 600));
    throw new Error("AI分析に失敗しました。API設定や利用上限を確認してください。");
  }
  const result = extractResponse(payload);
  if (!result.text) throw new Error("AIから分析結果を取得できませんでした。");
  return result;
}

async function analyzeRequest(request, env, origin) {
  let body;
  try { body = await request.json(); } catch (_) {
    return json({ error: "JSON形式のリクエストを送信してください。" }, 400, origin);
  }
  const product = clean(body.product, 120);
  if (!product) return json({ error: "商品・サービス名を入力してください。" }, 400, origin);
  const description = clean(body.description, 1200);
  const audience = clean(body.audience, 240);
  const goal = clean(body.goal, 80);
  const channels = Array.isArray(body.channels) ? body.channels.slice(0, 6).map(x => clean(x, 40)) : [];
  const prompt = [
    "あなたは慎重で実務的なマーケティングリサーチャーです。日本語で回答してください。",
    "ウェブ検索を使って市場環境と競合を調査してください。確認できた事実と仮説・提案を区別し、競合名・価格・統計を捏造しないでください。見つからない情報は不明と書いてください。",
    "広告配信やSNS投稿を実行したと主張しないでください。成果を保証しないでください。",
    "## 1. 市場の状況（出典付き）",
    "## 2. 競合・代替手段と差別化",
    "## 3. 想定顧客とニーズ（事実と仮説を区別）",
    "## 4. すぐ試せる施策3案（手順・低コスト案）",
    "## 5. 次の24時間の実行順序",
    "## 6. 成果指標と検証方法",
    "## 7. 不確実性",
    "",
    "商品・サービス: " + product,
    "説明: " + (description || "未入力"),
    "対象顧客: " + (audience || "未指定"),
    "目標: " + (goal || "認知度向上"),
    "発信先: " + (channels.join("、") || "未指定"),
    "地域: 日本。説明に地域があれば優先。",
    "小規模事業者や個人でも実行できる案を優先。"
  ].join("\n");
  try {
    const result = await askOpenAI(env, prompt, 2600);
    return json({ analysis: result.text, sources: result.sources, model: env.OPENAI_MODEL || "gpt-5.1", generatedAt: new Date().toISOString() }, 200, origin);
  } catch (error) {
    return json({ error: error.message || "AIリサーチに接続できませんでした。" }, 502, origin);
  }
}

async function scheduledReport(env) {
  let campaign = {};
  try { campaign = JSON.parse(env.MARKETING_CAMPAIGN_JSON || "{}"); }
  catch (_) { throw new Error("MARKETING_CAMPAIGN_JSON は有効なJSONではありません。"); }
  const product = clean(campaign.product, 120);
  if (!product) throw new Error("MARKETING_CAMPAIGN_JSON に product を設定してください。");
  const prompt = [
    "あなたは小規模事業者向けの慎重なマーケティング担当AIです。日本語で回答してください。",
    "ウェブ検索を使って今回新しく確認できる情報を調べてください。事実と仮説を分け、根拠のない統計・価格・競合情報を作らないでください。",
    "次の6時間に取り組む優先タスクを最大3件、具体的な手順と成果指標つきで提案してください。必要ならSNS投稿案を1件作ってください。",
    "SNS投稿、広告配信、顧客への連絡を実行したと主張しないでください。提案と下書きのみを作成してください。",
    "## 今回の確認事項\n## 優先タスク（最大3件）\n## SNS投稿案（下書きのみ）\n## 成果指標\n## 出典と不確実性",
    "商品・サービス: " + product,
    "説明: " + clean(campaign.description, 700),
    "対象顧客: " + clean(campaign.audience, 200),
    "目標: " + clean(campaign.goal, 100),
    "地域: " + clean(campaign.region, 100),
    "発信先: " + (Array.isArray(campaign.channels) ? campaign.channels.slice(0, 6).map(x => clean(x, 40)).join("、") : "未指定"),
    "前回の成果・メモ: " + clean(campaign.lastResults, 500)
  ].join("\n");
  const result = await askOpenAI(env, prompt, MAX_OUTPUT_TOKENS);
  const report = [
    "MarketingHub 定期マーケティングレポート",
    "商品: " + product,
    "生成日時: " + new Date().toISOString(),
    "",
    result.text,
    "",
    "参照元:",
    ...result.sources.slice(0, 8).map(s => "- " + s.title + " — " + s.url),
    "",
    "これはAIによる提案です。SNS投稿や広告配信は実行していません。"
  ].join("\n");
  if (env.MARKETING_WEBHOOK_URL) {
    const url = new URL(env.MARKETING_WEBHOOK_URL);
    if (url.protocol !== "https:") throw new Error("Webhook URLにはHTTPSを指定してください。");
    const sent = await fetch(url.href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: report, content: report })
    });
    if (!sent.ok) throw new Error("Webhook通知に失敗しました: " + sent.status);
  }
  console.log(report.slice(0, 12000));
}

export default {
  async fetch(request, env) {
    const expectedOrigin = env.APP_ORIGIN || "";
    const requestOrigin = request.headers.get("Origin") || "";
    const allowedOrigin = expectedOrigin ? (requestOrigin === expectedOrigin ? expectedOrigin : "") : "*";
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (!allowedOrigin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    if (url.pathname !== "/api/analyze") return json({ app: "MarketingHub API", status: "ok", endpoint: "/api/analyze" }, 200, allowedOrigin || "*");
    if (request.method !== "POST") return json({ error: "POSTリクエストのみ利用できます。" }, 405, allowedOrigin || "*");
    if (expectedOrigin && requestOrigin !== expectedOrigin) return json({ error: "許可されていないアクセス元です。APP_ORIGINを確認してください。" }, 403, expectedOrigin);
    return analyzeRequest(request, env, allowedOrigin || "*");
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(scheduledReport(env).catch(error => {
      console.error("Scheduled MarketingHub report failed:", error && error.message);
    }));
  }
};