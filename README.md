# Fila de conteúdo · Arão Baltazar

Carrosséis e posts estáticos do Instagram, produzidos por um agente, aprovados por você no Telegram e publicados pelo n8n.

## Como funciona

```
Domingo, 17h48        Domingo, 18h30          Você                      Terça e sexta, 12h
Agente gera os   →    n8n manda os posts  →   toca em Aprovar ou   →    n8n publica no
posts da semana       no Telegram (@araoconteudo_bot)  Não aprovar               Instagram o que foi aprovado
```

1. **Domingo, 17h48:** uma tarefa agendada no Claude escolhe as próximas pautas em `pautas.md`, escreve o texto no tom da marca (`marca.md`), gera as artes e abre um *pull request* com os posts de terça e sexta.
2. **Domingo, 18h30:** o n8n manda cada post para o seu Telegram: as lâminas em álbum, a legenda e os botões **Aprovar** e **Não aprovar**.
3. **Você decide post a post:**
   - **Aprovar:** o post entra na fila.
   - **Não aprovar:** o post é marcado como `reprovado` e não sai. O bot pergunta o que ajustar; a sua resposta fica registrada no pull request.
   - Quando todos os posts da semana têm resposta, o n8n conclui sozinho: faz o merge se houver pelo menos um aprovado, ou fecha o pull request se nenhum foi aprovado.
4. **Terça e sexta, às 12h:** o n8n lê `fila/AAAA-MM-DD/post.json` na branch `main` e publica no Instagram só se o status for `aprovado`.

Responda até a véspera de cada post: o que não estiver aprovado na `main` às 12h do dia não é publicado. Também dá para aprovar pelo GitHub (merge do pull request), se preferir.

## Estrutura

| Pasta ou arquivo | O que é |
| --- | --- |
| `marca.md` | Regras de tom, números liberados e visual |
| `pautas.md` | Banco de pautas por dia; o agente marca as usadas |
| `fila/AAAA-MM-DD/` | Um post por data: `slide-XX.jpg`, `post.json`, `spec.json`, `previa.png` |
| `ferramentas/render_artes.py` | Gerador das artes (`python3 ferramentas/render_artes.py spec.json pasta`) |
| `n8n/telegram-enviar-aprovacao.json` | Workflow: envia os posts da semana para o Telegram |
| `n8n/telegram-receber-aprovacoes.json` | Workflow: recebe os cliques e conclui a semana |
| `n8n/instagram-publicar-posts.json` | Workflow: publica no Instagram às terças e sextas |

## Configurar (uma vez)

### Credenciais

| Credencial | Onde pegar | Usada em |
| --- | --- | --- |
| Token do bot do Telegram | @BotFather, ao criar o bot | Os dois workflows do Telegram |
| Seu ID do Telegram | @userinfobot | Os dois workflows do Telegram |
| Token do GitHub | GitHub → Settings → Developer settings → Fine-grained tokens. Só o repositório `arao-conteudo`, leitura e escrita em *Contents* e *Pull requests* | Os dois workflows do Telegram |
| Token do Instagram | Ver "Instagram" abaixo | Workflow do Instagram |

Os tokens ficam só no seu n8n. Nunca coloque um token neste repositório, que é público.

### Telegram

1. Abra o seu bot no Telegram e toque em **Iniciar**. Sem isso, ele não consegue te mandar mensagens.
2. No n8n, importe `n8n/telegram-enviar-aprovacao.json` e `n8n/telegram-receber-aprovacoes.json` (*Workflows → Import from File*).
3. Em cada um, abra o nó **Configuração** e cole `telegram_token`, `chat_id` e `github_token`.
4. **Ative primeiro** o workflow "receber aprovações". Ele consulta o Telegram a cada minuto, então não precisa de HTTPS nem de webhook.
5. No workflow "enviar posts", clique em **Testar agora**: os posts do pull request aberto chegam no seu Telegram. Depois, **ative-o** também.

Cuidados:
- Não rode "Testar agora" no workflow de respostas enquanto ele estiver ativo: os dois disputariam as mesmas mensagens.
- Para reenviar uma semana já enviada, preencha `reenviar` com `sim`, rode "Testar agora" e apague o campo depois.

### Instagram (sem Página do Facebook)

O workflow usa a API do Instagram com login do Instagram: publica direto na conta profissional, sem Página do Facebook nem Gerenciador de Negócios.

1. **Conta:** o Instagram precisa ser profissional (Criador ou Empresa).
2. **App:** em developers.facebook.com/apps, crie um app com o caso de uso **"Gerenciar mensagens e conteúdo no Instagram"**.
3. **Token:** no app, abra **Configuração da API com login do Instagram** → **Gerar tokens de acesso** → **Adicionar conta**, entre com o seu Instagram e autorize. Clique em **Gerar token** e copie.
4. **n8n:** no workflow "Instagram · publicar posts aprovados", nó **Configuração**, cole o token em `access_token` e salve. Deixe `ig_user_id` como `automatico`: o workflow descobre o ID sozinho.
5. **Renovação:** o token vale 60 dias, mas o workflow o renova sozinho a cada semana. Se o workflow ficar parado por mais de 60 dias, gere um token novo.
6. **Testar:** preencha `data_teste` com uma data que tenha post aprovado na `main` e clique em "Testar agora". Atenção: o teste **publica de verdade**. Depois **apague** `data_teste`.
7. **Publicar** o workflow. O fuso America/Sao_Paulo já vem configurado.

## Formato do post.json

```json
{
  "tema": "Lead não é paciente",
  "status": "aprovado",
  "imagens": ["slide-01.jpg", "slide-02.jpg"],
  "legenda": "Texto da legenda"
}
```

Status possíveis: `aprovado` (publica), `reprovado` ou `pausado` (não publica). O Instagram aceita até 10 imagens por carrossel, só em JPEG.
