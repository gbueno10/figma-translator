// Este é o código principal do plugin que roda no ambiente Figma
// Ele se comunica com a UI através de mensagens

interface TranslationRequest {
  type: 'translate';
  text: string;
  targetLanguage: string;
  apiKey: string;
}

interface LoadSettingsRequest {
  type: 'load-settings';
}

interface SaveSettingsRequest {
  type: 'save-settings';
  apiKey: string;
  targetLanguage: string;
}

interface SettingsResponse {
  type: 'settings-loaded';
  apiKey: string;
  targetLanguage: string;
}

interface TranslationResponse {
  type: 'translation-result';
  translatedText: string;
  originalText: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

// Quando o plugin é executado
figma.showUI(__html__, { width: 400, height: 500 });

// Escuta mensagens da UI
figma.ui.onmessage = async (msg: TranslationRequest | LoadSettingsRequest | SaveSettingsRequest) => {
  if (msg.type === 'load-settings') {
    try {
      const apiKey = await figma.clientStorage.getAsync('figma-translator-api-key') || '';
      const targetLanguage = await figma.clientStorage.getAsync('figma-translator-language') || '';
      
      figma.ui.postMessage({
        type: 'settings-loaded',
        apiKey,
        targetLanguage
      } as SettingsResponse);
      
      console.log('✅ Configurações CARREGADAS do Figma storage');
    } catch (error) {
      console.log('❌ ERRO ao carregar configurações:', error);
    }
  }
  
  else if (msg.type === 'save-settings') {
    try {
      await figma.clientStorage.setAsync('figma-translator-api-key', msg.apiKey);
      await figma.clientStorage.setAsync('figma-translator-language', msg.targetLanguage);
      console.log('✅ Configurações SALVAS no Figma storage');
    } catch (error) {
      console.log('❌ ERRO ao salvar configurações:', error);
    }
  }
  
  else if (msg.type === 'translate') {
    try {
      // Busca todos os nós de texto selecionados
      const selectedNodes = figma.currentPage.selection;
      const textNodes = selectedNodes.filter(node => node.type === 'TEXT') as TextNode[];
      
      if (textNodes.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Selecione pelo menos um elemento de texto para traduzir.'
        } as ErrorMessage);
        return;
      }

      // Carrega fontes e coleta textos
      const allTexts: string[] = [];
      const originalTextNodes: TextNode[] = [];
      
      for (const textNode of textNodes) {
        await figma.loadFontAsync(textNode.fontName as FontName);
        
        const originalText = msg.text || textNode.characters;
        allTexts.push(originalText);
        originalTextNodes.push(textNode);
      }
      
      // Se há texto customizado, usa apenas ele; senão, junta todos os textos
      const textToTranslate = msg.text || allTexts.join('\n---\n');
      
      const translatedText = await translateText(textToTranslate, msg.targetLanguage, msg.apiKey);
      
      if (msg.text) {
        // Se foi texto customizado, aplica a todos os nós selecionados
        for (const textNode of originalTextNodes) {
          textNode.characters = translatedText;
        }
      } else {
        // Se foram múltiplos textos, divide a resposta
        const translatedParts = translatedText.split('\n---\n');
        
        for (let i = 0; i < originalTextNodes.length && i < translatedParts.length; i++) {
          originalTextNodes[i].characters = translatedParts[i].trim();
        }
      }
      
      figma.ui.postMessage({
        type: 'translation-result',
        translatedText: translatedText,
        originalText: textToTranslate
      } as TranslationResponse);
      
      figma.notify('Tradução concluída!');
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Erro ao traduzir: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      } as ErrorMessage);
    }
  }
};

// Função para traduzir texto usando OpenAI API
async function translateText(text: string, targetLanguage: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Translate validated advertising creatives for a dog training app into ${targetLanguage}, preserving original impact and commercial effectiveness.

- Maintain the original text's meaning, persuasive tone, and intent.
- Keep the structure and approximately the same length (character or line count) where possible.
- Adapt idioms and cultural references to sound natural in the target language, preferring words and phrases that native speakers would use—even if this differs from a literal translation.
- Do not add new concepts, benefits, or calls to action not present in the original.
- Use simple, clear vocabulary suitable for the target audience and advertising context.
- Always choose terms that maximize engagement and emotional resonance in the target language.
- Retain all original formatting (line breaks, bold, lists, etc.).
- Deliver only the translated text, without additional comments or context.

**Output Format**  
Provide only the translated text, mirroring the input formatting exactly. No extra explanations or notes should be included.

Your task is to translate validated ad creative into ${targetLanguage}, preserving original meaning, tone, structure, and commercial impact, while using natural, emotionally engaging language. Always keep the original formatting, and output only the translated text.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`Erro na API do OpenAI: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content.trim();
}
