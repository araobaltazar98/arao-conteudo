// Código do nó "Processar respostas" do workflow n8n/telegram-receber-aprovacoes.json (gerado a partir do JSON; para colar no n8n).
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
st.offset = st.offset || 0;
st.decisoes = st.decisoes || {};
st.motivos = st.motivos || {};
const eu = (id) => String(id) === String(cfg.chat_id);
const upd = await tg('getUpdates', { offset: st.offset, timeout: 0, allowed_updates: ['callback_query', 'message'] });
const log = [];

for (const u of (upd.result || [])) {
  st.offset = u.update_id + 1;
  try {
    if (u.callback_query) {
      const q = u.callback_query;
      if (!eu(q.from.id)) { await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Sem permissão.' }); continue; }
      const [acao, pr, data] = q.data.split('|');
      const info = await gh(`pulls/${pr}`);
      if (info.state !== 'open') {
        await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Esta semana já foi concluída.' });
        continue;
      }
      st.decisoes[pr] = st.decisoes[pr] || {};

      {
        // Grava a decisão no post.json da branch: o workflow do Instagram publica
        // posts aprovados mesmo antes de a semana inteira ser respondida.
        const caminho = `fila/${data}/post.json`;
        const arq = await gh(`contents/${caminho}?ref=${encodeURIComponent(info.head.ref)}`);
        const post = JSON.parse(Buffer.from(arq.content, 'base64').toString('utf8'));
        if (acao === 'r') { post.status = 'reprovado'; delete post.aprovado_em; }
        else { post.status = 'aprovado'; post.aprovado_em = new Date().toISOString(); }
        await gh(`contents/${caminho}`, { method: 'PUT', body: {
          message: `${acao === 'r' ? 'Não aprovado' : 'Aprovado'} no Telegram: ${data}`,
          content: Buffer.from(JSON.stringify(post, null, 2) + '\n', 'utf8').toString('base64'),
          sha: arq.sha, branch: info.head.ref,
        } });
      }
      st.decisoes[pr][data] = acao;

      await tg('editMessageReplyMarkup', { chat_id: cfg.chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
      await tg('answerCallbackQuery', { callback_query_id: q.id, text: acao === 'a' ? 'Aprovado' : 'Não aprovado' });
      const [a, m, dd] = data.split('-');
      if (acao === 'a') {
        await tg('sendMessage', { chat_id: cfg.chat_id, reply_to_message_id: q.message.message_id, text: `Aprovado. Sai em ${dd}/${m}, às 12h.` });
      } else {
        const p = await tg('sendMessage', { chat_id: cfg.chat_id, reply_to_message_id: q.message.message_id,
          text: `Não aprovado: o post de ${dd}/${m} não será publicado. O que ajustar? Responda a esta mensagem, ou escreva "pular".`,
          reply_markup: { force_reply: true } });
        st.motivos[p.result.message_id] = { pr, data };
      }

      const datas = await datasDoPR(pr);
      const dec = st.decisoes[pr];
      if (datas.every(d => dec[d])) {
        if (datas.some(d => dec[d] === 'a')) {
          await gh(`pulls/${pr}/merge`, { method: 'PUT', body: { merge_method: 'squash', commit_title: `Aprovado no Telegram: posts da semana (#${pr})` } });
          await tg('sendMessage', { chat_id: cfg.chat_id, text: 'Semana concluída. Os posts aprovados estão na fila de publicação.' });
        } else {
          await gh(`pulls/${pr}`, { method: 'PATCH', body: { state: 'closed' } });
          await tg('sendMessage', { chat_id: cfg.chat_id, text: 'Nenhum post aprovado nesta semana. Nada será publicado.' });
        }
        delete st.decisoes[pr];
      }
      log.push({ pr, data, acao });
    } else if (u.message && eu(u.message.chat.id) && u.message.reply_to_message && st.motivos[u.message.reply_to_message.message_id]) {
      const { pr, data } = st.motivos[u.message.reply_to_message.message_id];
      delete st.motivos[u.message.reply_to_message.message_id];
      const texto = (u.message.text || '').trim();
      if (texto && texto.toLowerCase() !== 'pular') {
        await gh(`issues/${pr}/comments`, { method: 'POST', body: { body: `Ajuste pedido no Telegram para o post de ${data}:\n\n> ${texto.replace(/\n/g, '\n> ')}` } });
        await tg('sendMessage', { chat_id: cfg.chat_id, text: 'Anotado. O pedido ficou registrado para a próxima versão.' });
      }
      log.push({ pr, data, motivo: texto });
    }
  } catch (e) {
    log.push({ erro: e.message });
    await tg('sendMessage', { chat_id: cfg.chat_id, text: `Não consegui processar a sua resposta: ${e.message}` });
  }
}
return [{ json: { processados: log.length, log } }];
