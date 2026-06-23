# POC - Outlook/IMAP + Gemini

Esta POC monitora uma caixa de entrada via IMAP, lê e-mails novos, classifica com Gemini e move para uma pasta conforme a prioridade.

Categorias:

- `1 - Muito importante`
- `2 - Importante`
- `3 - Pouco importante`
- `9 - Revisar erro`

## Como rodar

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar `.env`

Copie `.env.example` e renomeie para `.env`.

Preencha:

```env
GEMINI_API_KEY=sua_chave_gemini
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=seu_email@dominio.com
IMAP_PASS=sua_senha_ou_senha_de_app
MOVE_EMAILS=true
ONLY_UNSEEN=true
```

### 3. Testar Gemini primeiro

```bash
npm run test:gemini
```

### 4. Rodar monitor

```bash
npm start
```

Agora envie um e-mail para a caixa configurada. O terminal deve mostrar a classificação e mover o e-mail para a pasta sugerida.

## Importante sobre Outlook/Microsoft 365

Se for uma conta Microsoft 365 corporativa, login por usuário e senha no IMAP pode não funcionar porque a Microsoft removeu autenticação básica para Exchange Online. Nesse caso, o caminho correto é usar Microsoft Graph/OAuth.

Para uma POC rápida, funciona melhor com:
- conta de teste com IMAP liberado;
- conta de e-mail em cPanel/servidor próprio;
- conta Outlook.com com IMAP habilitado e autenticação compatível.

## Segurança

Não use uma caixa real de executivo no primeiro teste.

Use uma caixa de teste, por exemplo:

```text
teste-ia@seudominio.com
```

Depois envie alguns e-mails fictícios e valide se as classificações fazem sentido.
