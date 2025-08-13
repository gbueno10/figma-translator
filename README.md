# 🌐 Figma Translator

Um plugin do Figma que usa ChatGPT para traduzir elementos de texto de forma rápida e precisa.

## ✨ Funcionalidades

- **Tradução Automática**: Traduz textos selecionados no Figma usando a API do OpenAI
- **Múltiplos Idiomas**: Suporte para 10 idiomas incluindo os principais (EN, DE, FR) e outros idiomas para anúncios (ES, PT, IT, NL, PL, RU, AR)
- **Texto Personalizado**: Permite traduzir texto customizado além dos elementos selecionados
- **Interface Intuitiva**: UI limpa e fácil de usar
- **Configurações Salvas**: Lembra suas preferências de idioma e chave API (armazenadas localmente)

## 🚀 Como Usar

1. **Instalar o Plugin**:
   - Abra o Figma
   - Vá em `Plugins` → `Development` → `Import plugin from manifest`
   - Selecione o arquivo `manifest.json` deste projeto

2. **Configurar a API**:
   - Obtenha uma chave API do OpenAI em [platform.openai.com](https://platform.openai.com)
   - Insira a chave no campo correspondente no plugin

3. **Traduzir Textos**:
   - Selecione um ou mais elementos de texto no Figma
   - Escolha o idioma de destino
   - Clique em "Traduzir Seleção"

## 🛠️ Desenvolvimento

### Pré-requisitos
- Node.js 16+
- npm ou yarn

### Instalação
```bash
npm install
```

### Scripts Disponíveis
```bash
# Compilar uma vez
npm run build

# Compilar em modo watch
npm run watch

# Limpar arquivos compilados
npm run clean

# Modo desenvolvimento (limpa + watch)
npm run dev
```

### Estrutura do Projeto
```
figma-translator/
├── src/
│   └── code.ts          # Código principal do plugin
├── ui.html              # Interface do usuário
├── manifest.json        # Configurações do plugin
├── tsconfig.json        # Configuração TypeScript
└── package.json         # Dependências e scripts
```

## 🔧 Configuração

### Manifest.json
O arquivo `manifest.json` define as configurações do plugin:
- Permissões de rede para a API OpenAI
- Tipos de nós suportados (TEXT)
- Informações básicas do plugin

### Segurança
- ✅ Chaves API são armazenadas apenas localmente
- ✅ Não há coleta de dados
- ✅ Comunicação direta com a API OpenAI

## 📝 Como Funciona

1. **Seleção**: O usuário seleciona elementos de texto no Figma
2. **Comunicação**: A UI envia uma mensagem para o código principal com o texto e idioma
3. **Tradução**: O código faz uma chamada para a API do ChatGPT
4. **Aplicação**: O texto traduzido é aplicado aos elementos selecionados
5. **Feedback**: O usuário recebe confirmação da tradução

## 🌍 Idiomas Suportados

- **English (EN)** - Inglês
- **German (DE)** - Alemão
- **French (FR)** - Francês
- **Spanish (ES)** - Espanhol
- **Portuguese (PT)** - Português
- **Brazilian Portuguese (PT-BR)** - Português Brasileiro
- **Italian (IT)** - Italiano
- **Dutch (NL)** - Holandês
- **Polish (PL)** - Polonês
- **Russian (RU)** - Russo
- **Arabic (AR)** - Árabe

## ⚠️ Requisitos

- Conta OpenAI com créditos disponíveis
- Conexão com internet
- Figma (versão desktop ou web)

## 🐛 Solução de Problemas

### "Erro na API do OpenAI"
- Verifique se sua chave API está correta
- Confirme se você tem créditos suficientes na conta OpenAI
- Teste a chave em outras ferramentas OpenAI

### "Selecione pelo menos um elemento de texto"
- Certifique-se de que elementos TEXT estão selecionados
- Apenas elementos de texto são suportados (não imagens ou shapes)

### Plugin não carrega
- Verifique se o arquivo `manifest.json` está na pasta raiz
- Confirme se o projeto foi compilado (`npm run build`)

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📞 Suporte

Se você encontrar problemas ou tiver sugestões, por favor:
- Abra uma issue no GitHub
- Descreva o problema em detalhes
- Inclua informações sobre sua versão do Figma e sistema operacional
