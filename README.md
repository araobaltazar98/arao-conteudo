# Fila de conteúdo · Arão Baltazar

Carrosséis e posts estáticos do Instagram, produzidos por um agente e publicados pelo n8n depois da sua aprovação.

## Como funciona

```
Domingo, 17h48          Você                       Terça e sexta, 12h
Agente gera os posts →  revisa o pull request  →   n8n publica o post
da semana e abre um     e clica em "Merge"         aprovado do dia
pull request            (= aprovação)
```

1. **Todo domingo**, uma tarefa agendada no Claude escolhe as próximas pautas em `pautas.md`, escreve o texto no tom da marca (`marca.md`), gera as artes e abre um *pull request* com os posts de terça e sexta.
2. **Você revisa** no GitHub (no celular, inclusive): a prévia de cada post e a legenda aparecem na descrição do pull request.
   - Para aprovar: **Merge pull request**.
   - Para pedir ajuste: comente no pull request ou peça ao Claude em uma conversa.
   - Para cancelar um post: feche o pull request, ou troque `"status": "aprovado"` por `"status": "pausado"` no `post.json` daquele dia.
3. **Terça e sexta, às 12h**, o n8n lê `fila/AAAA-MM-DD/post.json` na branch `main`. Se o status for `aprovado`, ele publica no Instagram.

Só o que está na `main` vai ao ar. Nada é publicado sem o seu merge.

## Estrutura

| Pasta ou arquivo | O que é |
| --- | --- |
| `marca.md` | Regras de tom, números liberados e visual |
| `pautas.md` | Banco de pautas por dia; o agente marca as usadas |
| `fila/AAAA-MM-DD/` | Um post por data: `slide-XX.jpg`, `post.json`, `spec.json`, `previa.png` |
| `ferramentas/render_artes.py` | Gerador das artes (`python3 ferramentas/render_artes.py spec.json pasta`) |
| `n8n/instagram-publicar-posts.json` | Workflow para importar no n8n |

## Configurar o n8n (uma vez)

1. **Pré-requisitos:** conta do Instagram profissional (empresa ou criador) ligada a uma Página do Facebook, e um app no Meta for Developers com as permissões `instagram_basic`, `instagram_content_publish` e `pages_read_engagement`.
2. **Token:** gere um token de acesso de longa duração (60 dias) da Página e pegue o **ID da conta do Instagram** (`GET /me/accounts`, depois `GET /{page-id}?fields=instagram_business_account`). Para não renovar a cada 60 dias, use um token de usuário do sistema no Business Manager.
3. **Importar:** no n8n, *Workflows → Import from File* → `n8n/instagram-publicar-posts.json`.
4. **Configuração:** abra o nó "Configuração" e cole `ig_user_id` e `access_token`.
5. **Testar:** preencha `data_teste` com uma data que tenha post aprovado na `main`, clique em "Testar agora" e confira o resultado. Depois **apague** `data_teste`, senão o mesmo post é republicado.
6. **Ativar** o workflow. Fuso: America/Sao_Paulo (já configurado).

O token fica só no seu n8n. Nunca coloque o token neste repositório, que é público.

## Formato do post.json

```json
{
  "tema": "Lead não é paciente",
  "status": "aprovado",
  "imagens": ["slide-01.jpg", "slide-02.jpg"],
  "legenda": "Texto da legenda"
}
```

O Instagram aceita até 10 imagens por carrossel, só em JPEG.
