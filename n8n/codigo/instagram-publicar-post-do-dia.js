// Código do nó "Publicar post do dia" do workflow n8n/instagram-publicar-posts.json (gerado a partir do JSON; para colar no n8n).
const cfg = $input.first().json;
const st = $getWorkflowStaticData('global');
const tz = 'America/Sao_Paulo';
const hoje = cfg.data_teste && String(cfg.data_teste).trim()
  ? String(cfg.data_teste).trim()
  : new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const lerPost = async (branch) => {
  const b = `https://raw.githubusercontent.com/${cfg.repo}/${branch}/fila/${hoje}`;
  try {
    let p = await this.helpers.httpRequest({ url: `${b}/post.json`, qs: { t: Date.now() }, json: true });
    if (typeof p === 'string') p = JSON.parse(p);
    return { base: b, post: p };
  } catch (e) { return null; }
};

// 1) Post já na main (semana inteira respondida no Telegram)
let achado = await lerPost(cfg.branch);
// 2) Senão, post aprovado no Telegram que ainda está no pull request aberto da semana
if (!achado) {
  let prs = [];
  try {
    prs = await this.helpers.httpRequest({ url: `https://api.github.com/repos/${cfg.repo}/pulls`,
      qs: { state: 'open', per_page: 20 }, headers: { 'User-Agent': 'n8n-arao-conteudo', Accept: 'application/vnd.github+json' }, json: true });
  } catch (e) { /* sem acesso à lista de PRs; segue só com a main */ }
  for (const pr of prs) {
    if (!pr.head.ref.startsWith('semana-')) continue;
    const r = await lerPost(pr.head.ref);
    if (r && r.post.aprovado_em) { achado = r; break; }
  }
}
if (!achado) return [{ json: { resultado: 'sem post aprovado para hoje', data: hoje } }];
const { base, post } = achado;
if (post.status !== 'aprovado') {
  return [{ json: { resultado: `não publicado (status: ${post.status})`, data: hoje } }];
}

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
return [{ json: { resultado: 'publicado', data: hoje, tema: post.tema, media_id: pub.id } }];
