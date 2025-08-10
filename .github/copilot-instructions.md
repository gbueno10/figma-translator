<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Figma Translator Plugin Instructions

Este é um plugin do Figma que usa ChatGPT para traduzir elementos de texto.

## Arquitetura do Projeto

- **src/code.ts**: Código principal que roda no ambiente Figma
- **ui.html**: Interface do usuário do plugin
- **manifest.json**: Configurações do plugin Figma

## Diretrizes de Desenvolvimento

1. **Tipos TypeScript**: Use tipagem forte, especialmente para:
   - Mensagens entre UI e código principal
   - Respostas da API OpenAI
   - Nós do Figma

2. **Comunicação UI ↔ Code**: 
   - Use `figma.ui.postMessage()` para enviar do code para UI
   - Use `parent.postMessage()` para enviar da UI para code
   - Sempre defina interfaces para as mensagens

3. **API OpenAI**:
   - Use o modelo gpt-3.5-turbo para traduções
   - Implemente tratamento de erro robusto
   - Considere rate limiting

4. **Figma API**:
   - Sempre carregue fontes com `figma.loadFontAsync()` antes de modificar texto
   - Filtre seleções para apenas nós TEXT
   - Use `figma.notify()` para feedback ao usuário

5. **Segurança**:
   - Chaves API devem ser inseridas pelo usuário
   - Armazene configurações no localStorage
   - Nunca hardcode credenciais

6. **UX**:
   - Forneça feedback visual durante operações assíncronas
   - Mostre mensagens de erro claras
   - Permita tradução de texto customizado ou selecionado
