# Configuração de Desenvolvimento

## Como testar o plugin

1. **Compile o projeto**:
   ```bash
   npm run build
   ```

2. **No Figma**:
   - Vá em `Plugins` → `Development` → `Import plugin from manifest...`
   - Selecione o arquivo `manifest.json` nesta pasta
   - O plugin será carregado no Figma

3. **Para usar**:
   - Crie alguns elementos de texto no Figma
   - Selecione-os
   - Execute o plugin
   - Insira sua chave API do OpenAI
   - Escolha o idioma e clique em "Traduzir"

## Desenvolvimento Contínuo

Use `npm run watch` para recompilação automática durante o desenvolvimento. Você precisará recarregar o plugin no Figma a cada mudança.

## Debugging

- Use `console.log()` no código TypeScript - os logs aparecerão no console do Figma
- Use as ferramentas de desenvolvedor do navegador para debugar a UI
- Erros da API aparecerão na interface do plugin
