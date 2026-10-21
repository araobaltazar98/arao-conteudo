// Código do nó "Processar respostas" do workflow n8n/telegram-receber-aprovacoes.json (para colar no n8n).
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
st.horarios = st.horarios || {};
const eu = (id) => String(id) === String(cfg.chat_id);
const TZ = 'America/Sao_Paulo';
const FUSO = '-03:00'; // America/Sao_Paulo, sem horário de verão desde 2019
const ddmm = (d) => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; };
const quandoTexto = (dt) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  .format(dt).replace(', ', ' às ');
const botaoHorario = (pr, data) => ({ inline_keyboard: [[{ text: '🕒 Antecipar dia e horário', callback_data: `h|${pr}|${data}` }]] });

const lerPost = async (data, branch) => {
  const caminho = `fila/${data}/post.json`;
  const arq = await gh(`contents/${caminho}?ref=${encodeURIComponent(branch)}`);
  return { caminho, sha: arq.sha, post: JSON.parse(Buffer.from(arq.content, 'base64').toString('utf8')) };
};
const gravarPost = ({ caminho, sha, post }, branch, mensagem) => gh(`contents/${caminho}`, { method: 'PUT', body: {
  message: mensagem, content: Buffer.from(JSON.stringify(post, null, 2) + '\n', 'utf8').toString('base64'), sha, branch,
} });

// Quando todos os posts da semana têm resposta: merge (se houver aprovado) ou fecha o PR
const concluirSeTerminou = async (pr) => {
  const datas = await datasDoPR(pr);
  const dec = st.decisoes[pr] || {};
  if (!datas.every(d => dec[d])) return;
  if (datas.some(d => dec[d] === 'a')) {
    await gh(`pulls/${pr}/merge`, { method: 'PUT', body: { merge_method: 'squash', commit_title: `Aprovado no Telegram: posts da semana (#${pr})` } });
    await tg('sendMessage', { chat_id: cfg.chat_id, text: 'Semana concluída. Os posts aprovados estão na fila de publicação.' });
  } else {
    await gh(`pulls/${pr}`, { method: 'PATCH', body: { state: 'closed' } });
    await tg('sendMessage', { chat_id: cfg.chat_id, text: 'Nenhum post aprovado nesta semana. Nada será publicado.' });
  }
  delete st.decisoes[pr];
};

// Entende "22/10 09:30", "22/10 9h", "22/10 às 14h", "22/10/2026 14:00" ou "agora"
const lerHorario = (texto) => {
  const t = texto.trim().toLowerCase();
  if (t === 'agora') return new Date();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:às|as|,)?\s*(\d{1,2})(?:[:h](\d{2})?)?\s*h?$/);
  if (!m) return null;
  const [dia, mes, hora, min] = [Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5] || 0)];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || min > 59) return null;
  const p2 = (n) => String(n).padStart(2, '0');
  const anoAtual = Number(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric' }).format(new Date()));
  const montar = (ano) => new Date(`${ano}-${p2(mes)}-${p2(dia)}T${p2(hora)}:${p2(min)}:00${FUSO}`);
  let dt = m[3] ? montar(Number(m[3].length === 2 ? `20${m[3]}` : m[3])) : montar(anoAtual);
  if (!m[3] && dt.getTime() < Date.now() - 30 * 864e5) dt = montar(anoAtual + 1); // ex.: 05/01 pedido em dezembro
  // Data inexistente (ex.: 31/02) vira outro dia no JavaScript; recusa
  const confere = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(dt);
  if (isNaN(dt) || confere !== `${p2(dia)}/${p2(mes)}`) return null;
  return dt;
};

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

      // Botão "Antecipar dia e horário": pergunta quando publicar
      if (acao === 'h') {
        if (info.state !== 'open' && !info.merged) {
          await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Esta semana foi encerrada sem posts aprovados.' });
          continue;
        }
        await tg('answerCallbackQuery', { callback_query_id: q.id });
        const p = await tg('sendMessage', { chat_id: cfg.chat_id, reply_to_message_id: q.message.message_id,
          text: `Quando o post de ${ddmm(data)} deve sair? Responda a esta mensagem com dia e horário, por exemplo "${ddmm(data)} 09:30", ou escreva "agora".`,
          reply_markup: { force_reply: true } });
        st.horarios[p.result.message_id] = { pr, data, msg: q.message.message_id };
        log.push({ pr, data, acao });
        continue;
      }

      if (info.state !== 'open') {
        await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Esta semana já foi concluída.' });
        continue;
      }
      st.decisoes[pr] = st.decisoes[pr] || {};

      // Grava a decisão no post.json da branch: o workflow do Instagram publica
      // posts aprovados mesmo antes de a semana inteira ser respondida.
      const arq = await lerPost(data, info.head.ref);
      if (acao === 'r') { arq.post.status = 'reprovado'; delete arq.post.aprovado_em; delete arq.post.publicar_em; }
      else { arq.post.status = 'aprovado'; arq.post.aprovado_em = new Date().toISOString(); }
      await gravarPost(arq, info.head.ref, `${acao === 'r' ? 'Não aprovado' : 'Aprovado'} no Telegram: ${data}`);
      st.decisoes[pr][data] = acao;

      await tg('editMessageReplyMarkup', { chat_id: cfg.chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
      await tg('answerCallbackQuery', { callback_query_id: q.id, text: acao === 'a' ? 'Aprovado' : 'Não aprovado' });
      if (acao === 'a') {
        const quando = arq.post.publicar_em ? quandoTexto(new Date(arq.post.publicar_em)) : `${ddmm(data)} às 12:00`;
        await tg('sendMessage', { chat_id: cfg.chat_id, reply_to_message_id: q.message.message_id,
          text: `Aprovado. Sai em ${quando}. Para antecipar, toque no botão abaixo.`, reply_markup: botaoHorario(pr, data) });
      } else {
        const p = await tg('sendMessage', { chat_id: cfg.chat_id, reply_to_message_id: q.message.message_id,
          text: `Não aprovado: o post de ${ddmm(data)} não será publicado. O que ajustar? Responda a esta mensagem, ou escreva "pular".`,
          reply_markup: { force_reply: true } });
        st.motivos[p.result.message_id] = { pr, data };
      }
      await concluirSeTerminou(pr);
      log.push({ pr, data, acao });

    } else if (u.message && eu(u.message.chat.id) && u.message.reply_to_message && st.horarios[u.message.reply_to_message.message_id]) {
      // Resposta com o novo dia e horário
      const id = u.message.reply_to_message.message_id;
      const { pr, data, msg } = st.horarios[id];
      delete st.horarios[id];
      const texto = (u.message.text || '').trim();
      const quando = lerHorario(texto);
      if (!quando || quando.getTime() < Date.now() - 5 * 60e3) {
        const p = await tg('sendMessage', { chat_id: cfg.chat_id, reply_to_message_id: u.message.message_id,
          text: `Não entendi esse horário, ou ele já passou. Responda a esta mensagem com dia e horário, por exemplo "${ddmm(data)} 09:30", ou escreva "agora".`,
          reply_markup: { force_reply: true } });
        st.horarios[p.result.message_id] = { pr, data, msg };
        log.push({ pr, data, horario_invalido: texto });
        continue;
      }
      const info = await gh(`pulls/${pr}`);
      const branch = info.state === 'open' ? info.head.ref : (info.merged ? info.base.ref : null);
      if (!branch) {
        await tg('sendMessage', { chat_id: cfg.chat_id, text: 'Esta semana foi encerrada sem posts aprovados. Nada será publicado.' });
        continue;
      }
      // Novo horário também vale como aprovação
      const arq = await lerPost(data, branch);
      arq.post.status = 'aprovado';
      arq.post.aprovado_em = arq.post.aprovado_em || new Date().toISOString();
      arq.post.publicar_em = quando.toISOString();
      await gravarPost(arq, branch, `Novo horário pelo Telegram: ${data} sai em ${quandoTexto(quando)}`);
      try { await tg('editMessageReplyMarkup', { chat_id: cfg.chat_id, message_id: msg, reply_markup: { inline_keyboard: [] } }); } catch (e) { /* já sem botões */ }
      await tg('sendMessage', { chat_id: cfg.chat_id, reply_to_message_id: u.message.message_id,
        text: `Combinado. O post de ${ddmm(data)} sai em ${quandoTexto(quando)} (pode levar até 10 minutos).` });
      if (info.state === 'open') {
        st.decisoes[pr] = st.decisoes[pr] || {};
        st.decisoes[pr][data] = 'a';
        await concluirSeTerminou(pr);
      }
      log.push({ pr, data, publicar_em: arq.post.publicar_em });

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
