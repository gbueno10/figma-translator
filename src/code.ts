// This is the main plugin code that runs in the Figma environment
// It communicates with the UI through messages

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

// When the plugin is executed
figma.showUI(__html__, { width: 400, height: 500 });

// Listen to messages from the UI
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
      
      console.log('✅ Settings LOADED from Figma storage');
    } catch (error) {
      console.log('❌ ERROR loading settings:', error);
    }
  }
  
  else if (msg.type === 'save-settings') {
    try {
      await figma.clientStorage.setAsync('figma-translator-api-key', msg.apiKey);
      await figma.clientStorage.setAsync('figma-translator-language', msg.targetLanguage);
      console.log('✅ Settings SAVED to Figma storage');
    } catch (error) {
      console.log('❌ ERROR saving settings:', error);
    }
  }
  
  else if (msg.type === 'translate') {
    try {
      // Passo 1: Capturar e Validar a Seleção
      const selectedNodes = figma.currentPage.selection;
      
      if (selectedNodes.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Por favor, selecione pelo menos um frame para traduzir.'
        } as ErrorMessage);
        return;
      }

      // Filtrar apenas nós do tipo FRAME, COMPONENT ou INSTANCE
      const selectedFrames = selectedNodes.filter(node => 
        node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE'
      ) as FrameNode[];

      if (selectedFrames.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Por favor, selecione pelo menos um frame, componente ou instância.'
        } as ErrorMessage);
        return;
      }

      console.log(`📊 ${selectedFrames.length} frame(s) selecionado(s) para tradução`);

      // Passo 2: Definir o "Frame Fonte"
      const sourceFrame = selectedFrames[0];
      console.log(`🎯 Frame fonte definido: "${sourceFrame.name}"`);

      // Passo 3: Extrair TODOS os textos de TODOS os frames selecionados usando IDs
      const textsForApi: { [nodeId: string]: string } = {};
      const allTextNodesById: { [nodeId: string]: TextNode } = {};

      for (const frame of selectedFrames) {
        const textNodes = frame.findAll(node => node.type === 'TEXT') as TextNode[];
        for (const node of textNodes) {
          if (node.characters.trim().length > 0) {
            textsForApi[node.id] = node.characters;
            allTextNodesById[node.id] = node;
          }
        }
      }

      if (Object.keys(textsForApi).length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Nenhum elemento de texto encontrado nos frames selecionados.'
        } as ErrorMessage);
        return;
      }

      console.log(`📝 ${Object.keys(textsForApi).length} texto(s) únicos encontrados para tradução`);

      // Carregar todas as fontes necessárias de uma vez
      const fontsToLoad = new Set<FontName>();
      for (const nodeId in allTextNodesById) {
        fontsToLoad.add(allTextNodesById[nodeId].fontName as FontName);
      }
      try {
        await Promise.all(Array.from(fontsToLoad).map(font => figma.loadFontAsync(font)));
        console.log('✅ Todas as fontes necessárias foram carregadas.');
      } catch (fontError) {
        console.log('⚠️ Falha ao carregar uma ou mais fontes:', fontError);
        figma.notify('Aviso: Algumas fontes não puderam ser carregadas, um fallback será usado.');
      }

      // Passo 4: Preparar e Enviar para a API em formato JSON
      console.log('🌍 Iniciando tradução...');
      const translatedTextsById = await translateTextsJson(textsForApi, msg.targetLanguage, msg.apiKey);

      // Passo 5: Duplicar Todos os Frames e Aplicar as Traduções
      const duplicatedFrames: SceneNode[] = [];
      const offsetX = 50; // Deslocamento horizontal para frames duplicados

      console.log(`🔄 Iniciando duplicação e tradução de ${selectedFrames.length} frame(s)...`);

      for (const frameToDuplicate of selectedFrames) {
        console.log(`📋 Duplicando frame: "${frameToDuplicate.name}"`);

        // a. Encontrar nós de texto originais ANTES de duplicar para manter a referência de ordem
        const originalTextNodes = frameToDuplicate.findAll(node => node.type === 'TEXT') as TextNode[];

        // b. Duplicar o frame
        const duplicatedFrame = frameToDuplicate.clone();

        // c. Posicionar e renomear o frame duplicado
        duplicatedFrame.x = frameToDuplicate.x + frameToDuplicate.width + offsetX;
        duplicatedFrame.name = `${frameToDuplicate.name} (${msg.targetLanguage})`;

        // d. Adicionar o frame duplicado ao mesmo container do original
        if (frameToDuplicate.parent) {
          frameToDuplicate.parent.appendChild(duplicatedFrame);
        }
        duplicatedFrames.push(duplicatedFrame);

        // e. Encontrar todos os nós de texto dentro do novo frame duplicado
        const textNodesInDuplicated = duplicatedFrame.findAll(node => node.type === 'TEXT') as TextNode[];
        console.log(`📝 ${textNodesInDuplicated.length} nó(s) de texto encontrado(s) no frame duplicado`);

        // f. Mapear e aplicar traduções com base na ordem dos nós
        if (originalTextNodes.length === textNodesInDuplicated.length) {
          for (let i = 0; i < originalTextNodes.length; i++) {
            const originalNode = originalTextNodes[i];
            const duplicatedNode = textNodesInDuplicated[i];
            const translatedContent = translatedTextsById[originalNode.id];

            if (translatedContent) {
              console.log(`🔄 Aplicando tradução para ID ${originalNode.id}: "${originalNode.characters}" -> "${translatedContent}"`);
              try {
                // A fonte já foi carregada, então isso deve ser rápido
                await figma.loadFontAsync(duplicatedNode.fontName as FontName);
                duplicatedNode.characters = translatedContent;
              } catch (fontError) {
                console.log(`⚠️ Falha ao carregar fonte para o nó duplicado: ${fontError}. Usando fallback.`);
                try {
                  const fallbackFont: FontName = { family: "Inter", style: "Regular" };
                  await figma.loadFontAsync(fallbackFont);
                  duplicatedNode.fontName = fallbackFont;
                  duplicatedNode.characters = translatedContent;
                } catch (fallbackError) {
                  console.log(`❌ Falha total ao aplicar tradução para o nó ${originalNode.id}: ${fallbackError}`);
                }
              }
            } else {
              console.log(`⚠️ Nenhuma tradução encontrada para o ID: ${originalNode.id} ("${originalNode.characters}")`);
            }
          }
        } else {
          console.log(`❌ Erro: A contagem de nós de texto no frame original e duplicado não corresponde. Frame: "${frameToDuplicate.name}"`);
        }
      }

      // Passo 6: Finalizar e Notificar o Usuário
      if (duplicatedFrames.length > 0) {
        // Atualizar seleção para mostrar os frames traduzidos
        figma.currentPage.selection = duplicatedFrames;

        figma.ui.postMessage({
          type: 'translation-result',
          translatedText: JSON.stringify(translatedTextsById, null, 2),
          originalText: JSON.stringify(textsForApi, null, 2)
        } as TranslationResponse);

        figma.notify(`✅ Tradução concluída! ${duplicatedFrames.length} frame(s) duplicado(s) e traduzido(s).`);
        console.log(`🎉 Processo finalizado com sucesso: ${duplicatedFrames.length} frame(s) traduzido(s)`);
      } else {
        throw new Error('Nenhum frame foi duplicado com sucesso');
      }
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Translation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      } as ErrorMessage);
    }
  }
};

// Function to translate text using OpenAI API
async function translateTextsJson(texts: { [nodeId: string]: string }, targetLanguage: string, apiKey: string): Promise<{ [nodeId: string]: string }> {
  console.log('🚀 Starting JSON translation with GPT-5...');
  console.log('📝 Text objects count:', Object.keys(texts).length);
  console.log('🌍 Target language:', targetLanguage);

  const systemPrompt = `You are an expert marketing copywriter specializing in adapting UI/UX content for the ${targetLanguage} market.
Your task is to translate a JSON object of texts from a user interface. The keys are unique identifiers, and the values are the strings to be translated.

CRITICAL INSTRUCTIONS:

Maintain JSON Structure: The input is a JSON object. Your output MUST be a valid JSON object with the EXACT SAME KEYS.

Contextual Translation: Analyze all the text values together to understand the domain (e.g., dog training app, e-commerce checkout, onboarding). Adapt translations so they fit naturally into the context.

Consistency & Normalization: Ensure recurring terms (commands, buttons, features) are translated consistently across all values. Normalize terminology to match what a native speaker would expect in this specific domain.

Natural & Persuasive Language: Do not translate literally. Write in a tone that feels natural, fluid, and engaging for a native ${targetLanguage} speaker.

UI Constraints: Keep the translated text length similar to the original to avoid breaking the UI layout. Shorten or adapt if necessary while preserving clarity.

Output ONLY JSON: Do not include explanations, notes, or markdown formatting like \`\`\`json. Your entire response must be the raw JSON object.

Example Input:
{
"ID_123:45": "Sign up for free",
"ID_123:46": "Get started",
"ID_123:47": "Already have an account? Log in."
}

Example Output (for "pt-BR"):
{
"ID_123:45": "Cadastre-se gratuitamente",
"ID_123:46": "Começar agora",
"ID_123:47": "Já tem uma conta? Entrar."
}`;

  const requestBody = {
    model: 'gpt-5', // Using a model that is good with JSON
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: JSON.stringify(texts, null, 2)
      }
    ],
    response_format: { type: "json_object" }, // Enable JSON mode
  };

  console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📥 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error response body:', errorText);
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    console.log('✅ GPT-5 successful');
    console.log('📊 Usage:', data.usage);

    const translatedContentRaw = data.choices[0].message.content;
    console.log('📝 Raw translation response:', translatedContentRaw);

    if (!translatedContentRaw || translatedContentRaw.trim() === '') {
      throw new Error('Empty response from OpenAI API');
    }

    // Parse the JSON string response
    const translatedJson = JSON.parse(translatedContentRaw);

    // Validate if the response is an object
    if (typeof translatedJson !== 'object' || translatedJson === null) {
      throw new Error('API response is not a valid JSON object.');
    }

    return translatedJson;

  } catch (error) {
    console.log('❌ Network or parsing error:', error);
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse the translation response from the API. It wasn't valid JSON.");
    }
    throw error;
  }
}
