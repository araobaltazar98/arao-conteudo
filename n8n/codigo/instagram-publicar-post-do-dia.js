// Código do nó "Publicar posts na hora" do workflow n8n/instagram-publicar-posts.json (para colar no n8n).
// Roda a cada 10 minutos. Cada post sai no horário de "publicar_em" (definido pelo botão
// "Antecipar dia e horário" no Telegram) ou, se não houver, às 12h do dia da pasta.
const cfg = $input.first().json;
const st = $getWorkflowStaticData('global');
const tz = 'America/Sao_Paulo';
const agora = Date.now();
const diaSP = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const teste = cfg.data_teste && String(cfg.data_teste).trim();
const primeiraVez = !st.publicados;
st.publicados = st.publicados || {};
st.tentativas = st.tentativas || {};

const ghHeaders = { 'User-Agent': 'n8n-arao-conteudo', Accept: 'application/vnd.github+json' };
const ghToken = String(cfg.github_token || '').trim();
if (ghToken && !ghToken.startsWith('COLE_AQUI')) ghHeaders.Authorization = `Bearer ${ghToken}`;
const gh = (caminho, qs = {}) => this.helpers.httpRequest({ url: `https://api.github.com/repos/${cfg.repo}/${caminho}`, qs, headers: ghHeaders, json: true });
const lerPost = async (branch, data) => {
  const base = `https://raw.githubusercontent.com/${cfg.repo}/${branch}/fila/${data}`;
  try {
    let post = await this.helpers.httpRequest({ url: `${base}/post.json`, qs: { t: agora }, json: true });
    if (typeof post === 'string') post = JSON.parse(post);
    return { base, post };
  } catch (e) { return null; }
};

// Onde procurar: a main e as branches das semanas com pull request aberto
const branches = [cfg.branch];
try {
  for (const pr of await gh('pulls', { state: 'open', per_page: 20 })) if (pr.head.ref.startsWith('semana-')) branches.push(pr.head.ref);
} catch (e) { /* sem acesso à lista de PRs; segue só com a main */ }

// Posts de 7 dias atrás a 14 dias à frente (um post pode ter sido antecipado ou adiado)
const minData = diaSP(agora - 7 * 864e5), maxData = diaSP(agora + 14 * 864e5);
const vistos = new Set();
const candidatos = [];
for (const br of branches) {
  let pastas = [];
  try {
    pastas = (await gh('contents/fila', { ref: br })).filter(f => f.type === 'dir' && /^\d{4}-\d{2}-\d{2}$/.test(f.name)).map(f => f.name);
  } catch (e) { continue; }
  for (const d of pastas) {
    if (vistos.has(d)) continue; // a main tem prioridade
    if (teste ? d !== teste : (d < minData || d > maxData)) continue;
    const r = await lerPost(br, d);
    if (!r) continue;
    // Na branch da semana, só vale o que já foi aprovado no Telegram
    if (br !== cfg.branch && !r.post.aprovado_em) continue;
    vistos.add(d);
    candidatos.push({ data: d, ...r });
  }
}

const horario = (c) => c.post.publicar_em ? Date.parse(c.post.publicar_em) : Date.parse(`${c.data}T12:00:00-03:00`);
// Primeira execução depois da atualização: só registra o que já passou, para não republicar
if (primeiraVez && !teste) {
  for (const c of candidatos) if (horario(c) <= agora) st.publicados[c.data] = 'antes da atualização';
  return [{ json: { resultado: 'primeira execução: posts com horário já passado foram registrados e não serão publicados' } }];
}
const prontos = candidatos.filter(c => {
  if (c.post.status !== 'aprovado') return false;
  if (teste) return true;
  if (st.publicados[c.data] || (st.tentativas[c.data] || 0) >= 3) return false;
  const h = horario(c);
  return h <= agora && agora - h < 6 * 36e5; // até 6h de atraso (n8n fora do ar, por exemplo)
});
if (!prontos.length) return [{ json: { resultado: 'nada para publicar agora' } }];

// API do Instagram com login do Instagram (sem Página do Facebook)
const G = `https://graph.instagram.com/${cfg.graph_version}`;
const tokenConfig = String(cfg.access_token).trim();
let tok = (st.token && st.tokenBase === tokenConfig) ? st.token : tokenConfig;

// Renova o token (validade de 60 dias) no máximo uma vez por semana
if (st.tokenBase !== tokenConfig || !st.renovadoEm || Date.now() - st.renovadoEm > 7 * 864e5) {
  try {
    const r = await this.helpers.httpRequest({ url: 'https://graph.instagram.com/refresh_access_token',
      qs: { grant_type: 'ig_refresh_token', access_token: tok }, json: true });
    if (r.access_token) { st.token = r.access_token; st.tokenBase = tokenConfig; st.renovadoEm = Date.now(); tok = r.access_token; }
  } catch (e) { /* token com menos de 24h ainda não pode ser renovado; segue com o atual */ }
}

// Descobre o ID da conta sozinho, se não estiver preenchido
let igId = String(cfg.ig_user_id || '').trim();
if (!igId || igId.startsWith('COLE_AQUI') || igId === 'automatico') {
  const me = await this.helpers.httpRequest({ url: `${G}/me`, qs: { fields: 'user_id,username', access_token: tok }, json: true });
  igId = String(me.user_id || me.id);
}

const enviar = (caminho, corpo) => this.helpers.httpRequest({
  method: 'POST', url: `${G}/${caminho}`, body: { ...corpo, access_token: tok }, json: true,
});

const resultados = [];
for (const { data, base, post } of prontos) {
  try {
    const urls = post.imagens.map(f => `${base}/${f}`);
    let criacao;
    if (urls.length === 1) {
      criacao = (await enviar(`${igId}/media`, { image_url: urls[0], caption: post.legenda })).id;
    } else {
      const filhos = [];
      for (const u of urls) filhos.push((await enviar(`${igId}/media`, { image_url: u, is_carousel_item: true })).id);
      criacao = (await enviar(`${igId}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: post.legenda })).id;
    }
    for (let i = 0; i < 12; i++) {
      const s = await this.helpers.httpRequest({ url: `${G}/${criacao}`, qs: { fields: 'status_code', access_token: tok }, json: true });
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR') throw new Error('O Instagram recusou a mídia deste post.');
      await new Promise(r => setTimeout(r, 5000));
    }
    const pub = await enviar(`${igId}/media_publish`, { creation_id: criacao });
    st.publicados[data] = new Date().toISOString();
    resultados.push({ json: { resultado: 'publicado', data, tema: post.tema, media_id: pub.id } });
  } catch (e) {
    st.tentativas[data] = (st.tentativas[data] || 0) + 1; // desiste depois de 3 tentativas
    resultados.push({ json: { resultado: 'erro', data, tema: post.tema, erro: e.message, tentativa: st.tentativas[data] } });
  }
}

// Limpa registros com mais de 30 dias
const limite = diaSP(agora - 30 * 864e5);
for (const k of Object.keys(st.publicados)) if (k < limite) delete st.publicados[k];
for (const k of Object.keys(st.tentativas)) if (k < limite) delete st.tentativas[k];
return resultados;
