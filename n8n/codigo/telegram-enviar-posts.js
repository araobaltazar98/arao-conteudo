// Código do nó "Enviar posts da semana" do workflow n8n/telegram-enviar-aprovacao.json (para colar no n8n).
const cfg = $input.first().json;
const gh = (caminho, opts = {}) => this.helpers.httpRequest({
  url: `https://api.github.com/repos/${cfg.repo}/${caminho}`,
  headers: { Authorization: `Bearer ${cfg.github_token}`, 'User-Agent': 'n8n-arao-conteudo', Accept: 'application/vnd.github+json' },
  json: true, ...opts,
});
const tg = (metodo, corpo) => this.helpers.httpRequest({
  method: 'POST', url: `https://api.telegram.org/bot${cfg.telegram_token}/${metodo}`, body: corpo, json: true,
});
const datasDoPR = async (pr) => {
  const arquivos = await gh(`pulls/${pr}/files?per_page=100`);
  return [...new Set(arquivos.map(f => (f.filename.match(/^fila\/(\d{4}-\d{2}-\d{2})\/post\.json$/) || [])[1]).filter(Boolean))].sort();
};
const st = $getWorkflowStaticData('global');
st.enviados = st.enviados || [];
const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const prs = await gh('pulls?state=open&per_page=20');
const saida = [];

for (const pr of prs) {
  if (!pr.head.ref.startsWith('semana-')) continue;
  if (st.enviados.includes(pr.number) && !cfg.reenviar) continue;
  const datas = await datasDoPR(pr.number);
  if (!datas.length) continue;

  await tg('sendMessage', { chat_id: cfg.chat_id, text: `Posts da semana para aprovar: ${datas.length}, um por dia. Toque em Aprovar ou Não aprovar em cada um. Cada post aprovado sai no dia dele, às 12h, mesmo antes de você responder os outros. Para publicar antes, toque em Antecipar dia e horário.` });

  for (const d of datas) {
    const base = `https://raw.githubusercontent.com/${cfg.repo}/${pr.head.ref}/fila/${d}`;
    let post = await this.helpers.httpRequest({ url: `${base}/post.json`, qs: { t: Date.now() }, json: true });
    if (typeof post === 'string') post = JSON.parse(post);
    if (post.imagens.length === 1) {
      await tg('sendPhoto', { chat_id: cfg.chat_id, photo: `${base}/${post.imagens[0]}` });
    } else {
      await tg('sendMediaGroup', {
        chat_id: cfg.chat_id,
        media: post.imagens.slice(0, 10).map(f => ({ type: 'photo', media: `${base}/${f}` })),
      });
    }
    const [a, m, dd] = d.split('-').map(Number);
    const dia = dias[new Date(Date.UTC(a, m - 1, dd, 12)).getUTCDay()];
    const texto = `${dia}, ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')} · ${post.tema}\n\nLegenda:\n${post.legenda}`.slice(0, 4000);
    await tg('sendMessage', {
      chat_id: cfg.chat_id, text: texto,
      reply_markup: { inline_keyboard: [[
        { text: '✅ Aprovar', callback_data: `a|${pr.number}|${d}` },
        { text: '❌ Não aprovar', callback_data: `r|${pr.number}|${d}` },
      ], [
        { text: '🕒 Antecipar dia e horário', callback_data: `h|${pr.number}|${d}` },
      ]] },
    });
    await new Promise(r => setTimeout(r, 1500)); // evita o limite de mensagens do Telegram
  }
  if (!st.enviados.includes(pr.number)) st.enviados.push(pr.number);
  saida.push({ json: { pr: pr.number, datas } });
}
return saida.length ? saida : [{ json: { resultado: 'nenhum post novo para aprovar' } }];
