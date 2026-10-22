# Fila de conteúdo · Arão Baltazar

Uma publicação por dia no Instagram, às 12h, ou no dia e horário que você escolher no Telegram. Os posts são produzidos por um agente, aprovados por você no Telegram e publicados pelo n8n.

## Como funciona

```
Domingo, 17h48        Domingo, 18h30          Você                      Todo dia, 12h (ou no horário escolhido)
Agente gera os 7 →    n8n manda os posts  →   toca em Aprovar, Não   →  n8n publica no
posts da semana       no Telegram (@araoconteudo_bot)  aprovar ou Antecipar    Instagram o que foi aprovado
```

1. **Domingo, 17h48:** uma tarefa agendada no Claude escolhe as próximas pautas em `pautas.md` (cada dia da semana tem um pilar e um formato), escreve o texto no tom da marca (`marca.md`), gera as artes e abre um *pull request* com os 7 posts de segunda a domingo.
2. **Domingo, 18h30:** o n8n manda cada post para o seu Telegram: as lâminas em álbum, a legenda e os botões **Aprovar**, **Não aprovar** e **Antecipar dia e horário**.
3. **Você decide post a post:**
   - **Aprovar:** o post entra na fila e já pode sair no dia dele, mesmo que você ainda não tenha respondido os outros.
   - **Antecipar dia e horário:** o bot pergunta quando publicar. Responda com dia e horário (por exemplo `22/10 09:30` ou `22/10 9h`) ou escreva `agora`. O post fica aprovado com o novo horário. O botão também aparece depois de **Aprovar**, e continua funcionando depois que a semana é concluída.
   - **Não aprovar:** o post é marcado como `reprovado` e não sai. O bot pergunta o que ajustar; a sua resposta fica registrada no pull request.
   - Quando todos os posts da semana têm resposta, o n8n conclui sozinho: faz o merge se houver pelo menos um aprovado, ou fecha o pull request se nenhum foi aprovado.
4. **A cada 10 minutos:** o n8n procura posts na branch `main` e no *pull request* aberto da semana e publica os que chegaram na hora: às 12h do dia da pasta ou no horário escolhido em **Antecipar dia e horário**. Na branch da semana, só publica o que você aprovou no Telegram. Cada post sai uma vez só.

Responda até as 11h do dia de cada post: o que não estiver aprovado às 12h não é publicado. Um post antecipado sai em até 10 minutos depois do horário escolhido. O ideal é responder os 7 no domingo à noite, para o post de segunda não ficar para trás. Também dá para aprovar pelo GitHub (merge do pull request), se preferir.

## Estrutura

| Pasta ou arquivo | O que é |
| --- | --- |
| `marca.md` | Regras de tom, números liberados e visual |
| `pautas.md` | Calendário semanal (pilar e formato de cada dia) e banco de pautas; o agente marca as usadas |
| `fila/AAAA-MM-DD/` | Um post por data: `slide-XX.jpg`, `post.json`, `spec.json`, `previa.png` |
| `ferramentas/render_artes.py` | Gerador das artes (`python3 ferramentas/render_artes.py spec.json pasta`) |
| `n8n/telegram-enviar-aprovacao.json` | Workflow: envia os posts da semana para o Telegram |
| `n8n/telegram-receber-aprovacoes.json` | Workflow: recebe os cliques e conclui a semana |
| `n8n/instagram-publicar-posts.json` | Workflow: a cada 10 minutos, publica no Instagram os posts aprovados que chegaram na hora |
| `n8n/codigo/` | O código de cada workflow em texto puro, para colar no n8n ao atualizar |

## Configurar (uma vez)

### Credenciais

| Credencial | Onde pegar | Usada em |
| --- | --- | --- |
| Token do bot do Telegram | @BotFather, ao criar o bot | Os dois workflows do Telegram |
| Seu ID do Telegram | @userinfobot | Os dois workflows do Telegram |
| Token do GitHub | GitHub → Settings → Developer settings → Fine-grained tokens. Só o repositório `arao-conteudo`, leitura e escrita em *Contents* e *Pull requests* | Os três workflows |
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

### Atualizar para uma publicação por dia e o botão Antecipar

Se você já tinha importado os workflows antes, atualize os três sem reimportar. Assim você não perde os tokens nem o histórico de aprovações.

1. **Instagram · publicar posts aprovados:**
   - Abra o gatilho "Terça e sexta, 12h". Troque a regra para **Minutes**, intervalo **10**, e renomeie para "A cada 10 minutos".
   - No nó **Configuração**, adicione um campo de texto `github_token` com o mesmo token do GitHub dos workflows do Telegram.
   - No nó **Publicar post do dia**, apague o código e cole o de `n8n/codigo/instagram-publicar-post-do-dia.js`.
   - A primeira execução depois disso só registra os posts cujo horário já passou, para não publicá-los de novo.
2. **Enviar posts:** no nó **Enviar posts da semana**, cole o código de `n8n/codigo/telegram-enviar-posts.js`. Ele adiciona o botão **Antecipar dia e horário** e aceita posts de uma lâmina só (o Telegram não manda álbum com uma foto).
3. **Receber aprovações:** no nó **Processar respostas**, cole o código de `n8n/codigo/telegram-processar-respostas.js`. Ele grava cada aprovação e cada horário escolhido no post.
4. Salve os três. Os workflows continuam ativos.
5. Para receber os botões novos nos posts que já estavam no Telegram, preencha `reenviar` com `sim` no workflow de envio, rode **Testar agora** e apague o campo depois.

Se preferir reimportar os arquivos, cole de novo os tokens no nó **Configuração** de cada um.

### Sem token do Instagram: modo lembrete

Se o campo `access_token` do workflow do Instagram ficar vazio (ou com `COLE_AQUI...`), nada é publicado automaticamente. Na hora de cada post aprovado, o workflow manda no Telegram as lâminas e a legenda prontas, e você publica pelo app do Instagram em poucos toques. Para isso, o nó **Configuração** do workflow do Instagram precisa dos campos `telegram_token` e `chat_id`, com os mesmos valores dos workflows do Telegram.

Quando quiser publicação automática, basta colar o token do Instagram em `access_token` (passos abaixo).

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
  "legenda": "Texto da legenda",
  "aprovado_em": "2026-10-21T22:10:00.000Z",
  "publicar_em": "2026-10-22T12:30:00.000Z"
}
```

`aprovado_em` e `publicar_em` são gravados pelo n8n quando você responde no Telegram; o agente nunca os preenche. Sem `publicar_em`, o post sai às 12h do dia da pasta.

Status possíveis: `aprovado` (publica), `reprovado` ou `pausado` (não publica). O Instagram aceita até 10 imagens por carrossel, só em JPEG.
