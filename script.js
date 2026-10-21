const form = document.querySelector("#marketing-form");
const output = document.querySelector("#plan-output");
const emptyState = document.querySelector("#empty-state");
const subtitle = document.querySelector("#result-subtitle");
const copyButton = document.querySelector("#copy-plan");

const goalLabels = { awareness: "認知度を上げる", sales: "購入・申込を増やす", visits: "来店・訪問を増やす", leads: "問い合わせを増やす" };
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, function(char) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];
  });
}
function makePlan(data) {
  const product = data.product;
  const target = data.audience || "商品・サービスに関心を持つ可能性がある人";
  const detail = data.description || "商品の特徴や利用するメリットを、具体例とともに伝える";
  const channels = data.channels;
  const channelText = channels.length ? channels.join("・") : "利用可能なSNS・Webサイト";
  const goalAction = {
    awareness:"まず知ってもらうことを優先し、保存・シェアされる情報を発信する",
    sales:"購入する理由と購入方法を明確にし、商品ページへの導線を整える",
    visits:"訪問するメリット、場所、営業時間、アクセス方法をわかりやすく伝える",
    leads:"相手の悩みと解決策を示し、問い合わせ方法をひとつに絞って案内する"
  }[data.goal];
  const tasks = [
    ["00:00–02:00","伝える価値をひとつ決める","商品の特徴から、相手にとっての具体的なメリットをひとつ選ぶ。類似商品との違いも確認する。"],
    ["02:00–04:00","発信先と導線を確認",channelText+" のプロフィール、リンク、問い合わせ先を確認。次の行動に迷わない状態にする。"],
    ["04:00–07:00","投稿コンテンツを作成","「"+target+"」に向け、悩み・メリット・具体例・次の行動の順で短い投稿を作る。"],
    ["07:00–10:00","最初の投稿を公開","読みやすい画像や動画とともに公開。誇張した表現や裏付けのない効果は避ける。"],
    ["10:00–14:00","反応を見て会話する","届いたコメントや質問に返信。よくある疑問を記録し、説明不足があれば補足する。"],
    ["14:00–18:00","切り口を変えて再発信","使い方、開発背景、利用シーンなど、最初と異なる角度で発信する。"],
    ["18:00–22:00","導線と反応をチェック","閲覧数だけでなく、保存・クリック・問い合わせなど目標に近い反応を確認する。"],
    ["22:00–24:00","結果を記録し次へつなぐ","実施内容、反応、学びを記録。反応が良かった要素を次に検証する仮説にする。"]
  ];
  const postCopy = "【"+product+"】\n\n"+detail+"\n\n"+goalAction+"。\n\n気になる方は、ぜひ詳細をチェックしてみてください。\n\n#"+product.replace(/[^ぁ-んァ-ヶ一-龠A-Za-z0-9]/g,"")+" #おすすめ";
  const metrics = {
    awareness:["リーチ・表示回数","保存・シェア数","プロフィール閲覧数"],
    sales:["商品ページへのクリック","購入・申込数","ページ訪問から購入への割合"],
    visits:["地図・アクセスページの閲覧","来店予約・問い合わせ数","投稿経由の来店確認"],
    leads:["問い合わせページへのクリック","問い合わせ数","問い合わせにつながった投稿"]
  }[data.goal];
  const tags = channels.map(function(c){return '<span class="tag">'+escapeHTML(c)+'</span>';}).join("");
  const schedule = tasks.map(function(task){return '<div class="schedule-item"><div class="schedule-time">'+task[0]+'</div><div><strong>'+escapeHTML(task[1])+'</strong><p>'+escapeHTML(task[2])+'</p></div></div>';}).join("");
  const metricList = metrics.map(function(item){return "<li>"+escapeHTML(item)+"</li>";}).join("");
  return '<div class="plan-intro"><div class="section-kicker">YOUR CAMPAIGN SNAPSHOT</div><h3>'+escapeHTML(product)+'｜24時間アクションプラン</h3><p>'+escapeHTML(target)+'に向けて「'+escapeHTML(goalLabels[data.goal])+'」を目指します。最初の24時間は小さく実行し、結果から次の施策を判断します。</p><div class="tag-row"><span class="tag">'+escapeHTML(goalLabels[data.goal])+'</span>'+tags+'</div></div>'+
  '<div class="plan-grid"><article class="plan-card"><h3><span>◎</span> ターゲットへの訴求</h3><p><strong>相手：</strong>'+escapeHTML(target)+'<br><strong>伝えること：</strong>'+escapeHTML(detail)+'<br><strong>基本方針：</strong>'+escapeHTML(goalAction)+'。</p></article>'+
  '<article class="plan-card"><h3><span>✎</span> 投稿文のたたき台</h3><p class="caption-text" style="white-space:pre-line">'+escapeHTML(postCopy)+'</p><button type="button" class="secondary-button copy-caption" style="margin-top:12px">投稿文をコピー</button></article></div>'+
  '<article class="plan-card"><h3><span>◷</span> 24時間の実行スケジュール</h3><div class="schedule">'+schedule+'</div></article>'+
  '<div class="plan-grid"><article class="plan-card"><h3><span>↗</span> 成果を測る指標</h3><ul>'+metricList+'</ul><p style="margin-top:8px">公開前に現状値を記録し、24時間後に比較しましょう。</p></article><article class="plan-card"><h3><span>✦</span> 次に検証する仮説</h3><p>「'+escapeHTML(target)+'は、商品の特徴そのものより具体的な利用シーンに反応するのでは？」など、ひとつの仮説を決めて反応で検証します。</p></article></div>';
}
form.addEventListener("submit",function(event){
  event.preventDefault();
  const fd = new FormData(form);
  const product = String(fd.get("product") || "").trim();
  if(!product){document.querySelector("#product").focus();return;}
  const data = {product:product,description:String(fd.get("description")||"").trim(),audience:String(fd.get("audience")||"").trim(),goal:String(fd.get("goal")||"awareness"),channels:fd.getAll("channel").map(String)};
  output.innerHTML = makePlan(data);
  output.hidden = false;
  emptyState.hidden = true;
  subtitle.textContent = product+" の情報から、実行できる行動案を作成しました。";
  copyButton.disabled = false;
  document.querySelector("#results").scrollIntoView({behavior:"smooth",block:"start"});
});
async function copyText(text) {
  if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(text);return;}
  const area = document.createElement("textarea");
  area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
  document.body.appendChild(area); area.select();
  const ok = document.execCommand("copy"); area.remove();
  if(!ok) throw new Error("Copy failed");
}
copyButton.addEventListener("click",async function(){
  try{await copyText(output.innerText);copyButton.textContent="✓ コピーしました";setTimeout(function(){copyButton.textContent="▢ コピー";},1800);}
  catch(error){copyButton.textContent="コピーできませんでした";}
});
output.addEventListener("click",async function(event){
  const button = event.target.closest(".copy-caption");
  if(!button)return;
  const caption = button.parentElement.querySelector(".caption-text").innerText;
  try{await copyText(caption);button.textContent="✓ コピーしました";setTimeout(function(){button.textContent="投稿文をコピー";},1800);}
  catch(error){button.textContent="コピーできませんでした";}
});