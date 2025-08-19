// This is the main plugin code that runs in the Figma environment
// It communicates with the UI through messages

// Translation prompts - moved here for Figma compatibility
class DefaultTranslationPrompt {
  getTranslationMessage(texts: { [nodeId: string]: string }, targetLanguage: string): string {
    return `You are a professional marketing translator.
Translate the following validated advertising creatives for a dog training app into ${targetLanguage}, ensuring that the translation preserves the original impact and commercial effectiveness.

Guidelines:

Preserve the original meaning, persuasive tone, and intent.

Keep the structure and approximate length (character/line count) where possible.

Adapt idioms and cultural references so they sound natural in the target language, preferring words and phrases a native speaker would actually use.

Do not add new concepts, benefits, or calls to action not present in the source.

Use simple, clear vocabulary suitable for the target audience and advertising context.

Always choose terms that maximize engagement and emotional resonance in the target language.

Retain all original formatting (line breaks, bold, lists, etc.).

Language-specific Do's & Don'ts:

FR, ES, PT, IT, SE → Avoid mentioning "cage training", as it is not culturally accepted to keep dogs in cages.

FR → Do not use "dressage" (commonly associated with circus); use "éducation" instead when referring to training.

DE → Avoid using "Sie" (formal); always use "Du" (friendly/informal).

Output requirements:

Provide only the translated text, mirroring the input formatting exactly.

Do not include explanations, notes, or additional context.

Return the translated JSON with the same keys:\n${JSON.stringify(texts, null, 2)}`;
  }
}

const translationPrompt = new DefaultTranslationPrompt();

interface TranslationRequest {
  type: 'translate';
  text: string;
  targetLanguages: string[];
  apiKey: string;
}

interface LoadSettingsRequest {
  type: 'load-settings';
}

interface SaveSettingsRequest {
  type: 'save-settings';
  apiKey: string;
  targetLanguages: string[];
}

interface SettingsResponse {
  type: 'settings-loaded';
  apiKey: string;
  targetLanguages: string[];
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
      const targetLanguagesString = await figma.clientStorage.getAsync('figma-translator-languages') || '';
      const targetLanguages = targetLanguagesString ? JSON.parse(targetLanguagesString) : ['pt-BR'];
      
      figma.ui.postMessage({
        type: 'settings-loaded',
        apiKey,
        targetLanguages
      } as SettingsResponse);
      
      console.log('✅ Settings LOADED from Figma storage');
    } catch (error) {
      console.log('❌ ERROR loading settings:', error);
    }
  }
  
  else if (msg.type === 'save-settings') {
    try {
      await figma.clientStorage.setAsync('figma-translator-api-key', msg.apiKey);
      await figma.clientStorage.setAsync('figma-translator-languages', JSON.stringify(msg.targetLanguages));
      console.log('✅ Settings SAVED to Figma storage');
    } catch (error) {
      console.log('❌ ERROR saving settings:', error);
    }
  }
  
  else if (msg.type === 'translate') {
    const startTime = Date.now();
    console.log(`🚀 [${new Date().toISOString()}] Iniciando processo de tradução...`);
    
    try {
      // Passo 1: Capturar e Validar a Seleção
      console.log(`⏱️ [${Date.now() - startTime}ms] Passo 1: Iniciando captura da seleção...`);
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
      console.log(`✅ [${Date.now() - startTime}ms] Passo 1 concluído: Seleção validada`);

      // Passo 2: Definir o "Frame Fonte"
      console.log(`⏱️ [${Date.now() - startTime}ms] Passo 2: Definindo frame fonte...`);
      const sourceFrame = selectedFrames[0];
      console.log(`🎯 Frame fonte definido: "${sourceFrame.name}"`);
      console.log(`✅ [${Date.now() - startTime}ms] Passo 2 concluído: Frame fonte definido`);

      // Passo 3: Extrair TODOS os textos de TODOS os frames selecionados usando IDs
      console.log(`⏱️ [${Date.now() - startTime}ms] Passo 3: Iniciando extração de textos...`);
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
      console.log(`✅ [${Date.now() - startTime}ms] Passo 3 concluído: Textos extraídos`);

      // Carregar todas as fontes necessárias de uma vez
      console.log(`⏱️ [${Date.now() - startTime}ms] Iniciando carregamento de fontes...`);
      const fontsToLoad = new Set<FontName>();
      for (const nodeId in allTextNodesById) {
        fontsToLoad.add(allTextNodesById[nodeId].fontName as FontName);
      }
      console.log(`📝 ${fontsToLoad.size} fonte(s) únicas para carregar`);
      
      try {
        await Promise.all(Array.from(fontsToLoad).map(font => figma.loadFontAsync(font)));
        console.log(`✅ [${Date.now() - startTime}ms] Todas as fontes necessárias foram carregadas.`);
      } catch (fontError) {
        console.log(`⚠️ [${Date.now() - startTime}ms] Falha ao carregar uma ou mais fontes:`, fontError);
        figma.notify('Aviso: Algumas fontes não puderam ser carregadas, um fallback será usado.');
      }

      // Passo 4: Preparar e Traduzir para Cada Idioma EM PARALELO
      console.log(`⏱️ [${Date.now() - startTime}ms] Passo 4: Iniciando tradução PARALELA para ${msg.targetLanguages.length} idioma(s)...`);
      console.log('🌍 Iniciando tradução para múltiplos idiomas EM PARALELO...');
      
      // Criar todas as promessas de tradução em paralelo
      const translationPromises = msg.targetLanguages.map(async (language, index) => {
        const langStartTime = Date.now();
        console.log(`🔄 [${Date.now() - startTime}ms] Iniciando tradução PARALELA para idioma ${index + 1}/${msg.targetLanguages.length}: ${language}`);
        
        const translatedTextsById = await translateTextsJson(textsForApi, language, msg.apiKey);
        
        console.log(`✅ [${Date.now() - startTime}ms] Tradução PARALELA para ${language} concluída em ${Date.now() - langStartTime}ms`);
        return { language, translatedTextsById };
      });

      // Aguardar todas as traduções completarem
      console.log(`⏱️ [${Date.now() - startTime}ms] Aguardando ${msg.targetLanguages.length} traduções paralelas...`);
      const translationResults = await Promise.all(translationPromises);
      
      // Reorganizar resultados no formato esperado
      const translationsByLanguage: { [language: string]: { [nodeId: string]: string } } = {};
      for (const result of translationResults) {
        translationsByLanguage[result.language] = result.translatedTextsById;
      }
      
      console.log(`✅ [${Date.now() - startTime}ms] Passo 4 concluído: Todas as traduções PARALELAS finalizadas`);

      // Passo 5: Duplicar e Organizar Frames em Layout Vertical (Uma linha por idioma, abaixo dos originais)
      console.log(`⏱️ [${Date.now() - startTime}ms] Passo 5: Iniciando duplicação em layout vertical...`);
      const duplicatedFrames: SceneNode[] = [];
      const spacingY = 100; // Espaçamento vertical entre linhas de idiomas
      
      console.log(`🔄 Iniciando duplicação vertical: ${selectedFrames.length} frame(s) x ${msg.targetLanguages.length} idioma(s)`);

      // Calcular a posição Y base (abaixo do frame mais baixo)
      const maxBottomY = Math.max(...selectedFrames.map(frame => frame.y + frame.height));
      console.log(`📐 Posição Y base calculada: ${maxBottomY} (abaixo dos frames originais)`);

      // Para cada idioma (uma linha completa abaixo dos originais)
      for (let languageIndex = 0; languageIndex < msg.targetLanguages.length; languageIndex++) {
        const language = msg.targetLanguages[languageIndex];
        const translatedTexts = translationsByLanguage[language];
        console.log(`⏱️ [${Date.now() - startTime}ms] Duplicando linha para idioma: ${language} (${languageIndex + 1}/${msg.targetLanguages.length})`);

        // Calcular Y para esta linha de idioma
        const lineY = maxBottomY + spacingY + (languageIndex * (spacingY + Math.max(...selectedFrames.map(f => f.height))));
        console.log(`📍 Linha ${languageIndex + 1} (${language}) posicionada em Y: ${lineY}`);

        // Para cada frame original (manter a mesma posição X)
        for (let frameIndex = 0; frameIndex < selectedFrames.length; frameIndex++) {
          const frameToDuplicate = selectedFrames[frameIndex];
          const frameStartTime = Date.now();
          console.log(`📋 [${Date.now() - startTime}ms] Duplicando frame: "${frameToDuplicate.name}" para idioma: ${language} (${frameIndex + 1}/${selectedFrames.length})`);

          // a. Encontrar nós de texto originais ANTES de duplicar
          const originalTextNodes = frameToDuplicate.findAll(node => node.type === 'TEXT') as TextNode[];

          // b. Duplicar o frame
          const cloneStartTime = Date.now();
          const duplicatedFrame = frameToDuplicate.clone();
          console.log(`⚡ [${Date.now() - startTime}ms] Frame clonado em ${Date.now() - cloneStartTime}ms`);

          // c. Posicionar frame duplicado: mesma X do original, Y calculado para a linha do idioma
          duplicatedFrame.x = frameToDuplicate.x; // Manter alinhamento horizontal
          duplicatedFrame.y = lineY; // Colocar na linha do idioma
          
          // Gerar nome do frame com base na nomenclatura de criativos
          const newFrameName = generateFrameNameWithLanguage(frameToDuplicate.name, language);
          duplicatedFrame.name = newFrameName;
          console.log(`📝 Nome do frame: "${frameToDuplicate.name}" -> "${newFrameName}"`);

          console.log(`📍 Frame posicionado em: X=${duplicatedFrame.x}, Y=${duplicatedFrame.y}`);

          // d. Adicionar o frame duplicado ao mesmo container do original
          if (frameToDuplicate.parent) {
            frameToDuplicate.parent.appendChild(duplicatedFrame);
          }
          duplicatedFrames.push(duplicatedFrame);

          // f. Encontrar todos os nós de texto dentro do novo frame duplicado
          const textNodesInDuplicated = duplicatedFrame.findAll(node => node.type === 'TEXT') as TextNode[];
          console.log(`📝 ${textNodesInDuplicated.length} nó(s) de texto encontrado(s) no frame duplicado`);

          // g. Mapear e aplicar traduções com base na ordem dos nós
          if (originalTextNodes.length === textNodesInDuplicated.length) {
            for (let i = 0; i < originalTextNodes.length; i++) {
              const originalNode = originalTextNodes[i];
              const duplicatedNode = textNodesInDuplicated[i];
              const translatedContent = translatedTexts[originalNode.id];

              if (translatedContent) {
                console.log(`🔄 Aplicando tradução ${language} para ID ${originalNode.id}: "${originalNode.characters}" -> "${translatedContent}"`);
                try {
                  // A fonte já foi carregada
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
                console.log(`⚠️ Nenhuma tradução encontrada para o ID: ${originalNode.id} ("${originalNode.characters}") no idioma ${language}`);
              }
            }
          } else {
            console.log(`❌ Erro: A contagem de nós de texto no frame original e duplicado não corresponde. Frame: "${frameToDuplicate.name}"`);
          }
          
          console.log(`✅ [${Date.now() - startTime}ms] Frame "${frameToDuplicate.name}" processado para ${language} em ${Date.now() - frameStartTime}ms`);
        }
        
        console.log(`✅ [${Date.now() - startTime}ms] Linha do idioma ${language} concluída`);
      }
      console.log(`✅ [${Date.now() - startTime}ms] Passo 5 concluído: Duplicação em layout vertical finalizada`);

      // Passo 6: Finalizar e Notificar o Usuário
      console.log(`⏱️ [${Date.now() - startTime}ms] Passo 6: Finalizando processo...`);
      if (duplicatedFrames.length > 0) {
        // Atualizar seleção para mostrar os frames traduzidos
        figma.currentPage.selection = duplicatedFrames;

        figma.ui.postMessage({
          type: 'translation-result',
          translatedText: JSON.stringify(translationsByLanguage, null, 2),
          originalText: JSON.stringify(textsForApi, null, 2)
        } as TranslationResponse);

        figma.notify(`✅ Tradução concluída! ${duplicatedFrames.length} frame(s) criado(s) para ${msg.targetLanguages.length} idioma(s).`);
        console.log(`🎉 [${Date.now() - startTime}ms] Processo finalizado com sucesso: ${duplicatedFrames.length} frame(s) traduzido(s) em grid organizado`);
        console.log(`⏱️ TEMPO TOTAL: ${Date.now() - startTime}ms`);
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

// Função para converter códigos de idioma para siglas em inglês
function getLanguageCode(language: string): string {
  const languageMap: { [key: string]: string } = {
    // French
    'french': 'FR',
    'fr': 'FR',
    
    // German  
    'german': 'DE',
    'de': 'DE',
    
    // Portuguese (Brazil)
    'portuguese (br)': 'PT',
    'portuguese': 'PT',
    'pt-br': 'PT',
    'pt': 'PT',
    
    // Portuguese (Portugal)
    'portuguese (pt)': 'PT-PT',
    'pt-pt': 'PT-PT',
    
    // Spanish
    'spanish': 'ES',
    'es': 'ES',
    
    // Italian
    'italian': 'IT',
    'it': 'IT',
    
    // Dutch
    'dutch': 'NL',
    'nl': 'NL',
    
    // Polish
    'polish': 'PL',
    'pl': 'PL',
    
    // Arabic
    'arabic': 'AR',
    'ar': 'AR',
    
    // Russian
    'russian': 'RU',
    'ru': 'RU'
  };
  
  // Tentar encontrar correspondência direta ou por substring
  const lowerLanguage = language.toLowerCase();
  return languageMap[lowerLanguage] || languageMap[language] || language.toUpperCase().substring(0, 2);
}

// Função para gerar nome do frame com base na nomenclatura de criativos
function generateFrameNameWithLanguage(originalName: string, targetLanguage: string): string {
  console.log(`🔍 Analisando nome original: "${originalName}"`);
  
  // Regex para encontrar padrões de língua no nome (2-3 letras maiúsculas isoladas)
  const languagePattern = /(_[A-Z]{2,3}_)|(_[A-Z]{2,3}$)/g;
  const matches = originalName.match(languagePattern);
  
  if (matches && matches.length > 0) {
    // Pegar o último match (mais provável de ser a linguagem)
    const lastMatch = matches[matches.length - 1];
    const targetCode = getLanguageCode(targetLanguage);
    
    console.log(`🔄 Substituindo "${lastMatch}" por "_${targetCode}_" ou "_${targetCode}"`);
    
    // Se termina com underscore, manter o padrão
    if (lastMatch.endsWith('_')) {
      return originalName.replace(lastMatch, `_${targetCode}_`);
    } else {
      return originalName.replace(lastMatch, `_${targetCode}`);
    }
  } else {
    // Se não encontrou padrão de linguagem, adicionar no final
    const targetCode = getLanguageCode(targetLanguage);
    console.log(`➕ Adicionando "_${targetCode}" ao final do nome`);
    return `${originalName}_${targetCode}`;
  }
}

// Function to translate text using OpenAI API
async function translateTextsJson(texts: { [nodeId: string]: string }, targetLanguage: string, apiKey: string): Promise<{ [nodeId: string]: string }> {
  const apiStartTime = Date.now();
  console.log(`🚀 [API-${apiStartTime}] Starting JSON translation with GPT-5-MINI for ${targetLanguage}...`);
  console.log(`📝 [API-${Date.now() - apiStartTime}ms] Text objects count:`, Object.keys(texts).length);
  console.log(`🌍 [API-${Date.now() - apiStartTime}ms] Target language:`, targetLanguage);

  const inputMessage = translationPrompt.getTranslationMessage(texts, targetLanguage);

  // Log do texto que será enviado para a API
  console.log(`📝 [API-${Date.now() - apiStartTime}ms] Texto reconhecido para tradução:`, JSON.stringify(texts, null, 2));
  console.log(`📨 [API-${Date.now() - apiStartTime}ms] Mensagem completa para OpenAI:`, inputMessage);

  const requestBody = {
    model: 'gpt-5-mini', // Modelo mais econômico para traduções
    reasoning: { effort: 'low' }, // Pedido do usuário: usar reasoning com effort low
    input: inputMessage, // String simples com "JSON" mencionado
    // Responses API format correto
    text: {
      format: { type: "json_object" } // Correto: json_object (não json)
    }
  };

  console.log(`📤 [API-${Date.now() - apiStartTime}ms] Preparando requisição para OpenAI (Responses API) com reasoning.low...`);
  console.log(`📤 [API-${Date.now() - apiStartTime}ms] Request body size:`, JSON.stringify(requestBody).length, 'chars');

  try {
    console.log(`🌐 [API-${Date.now() - apiStartTime}ms] Enviando requisição para OpenAI Responses API...`);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📥 [API-${Date.now() - apiStartTime}ms] Response status:`, response.status);
    console.log(`📥 [API-${Date.now() - apiStartTime}ms] Response ok:`, response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ [API-${Date.now() - apiStartTime}ms] Error response body:`, errorText);
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    console.log(`📊 [API-${Date.now() - apiStartTime}ms] Parsing response JSON from Responses API...`);
    const data = await response.json() as any;
    console.log(`✅ [API-${Date.now() - apiStartTime}ms] GPT-5-MINI (Responses API) returned data keys:`, Object.keys(data));

    // Extrair o conteúdo traduzido da Responses API
    let translatedContentRaw: string | undefined = undefined;

    // Responses API formato: data.output[1].content[0].text (segunda entrada é a message)
    if (data.output && Array.isArray(data.output) && data.output.length > 1) {
      const messageOutput = data.output[1]; // Segunda entrada é geralmente a message
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content) && messageOutput.content.length > 0) {
        const contentItem = messageOutput.content[0];
        if (contentItem && contentItem.text) {
          translatedContentRaw = contentItem.text;
        }
      }
    }

    // Fallback: tentar primeira entrada se segunda não funcionar
    if (!translatedContentRaw && data.output && Array.isArray(data.output) && data.output.length > 0) {
      const firstOutput = data.output[0];
      if (firstOutput && firstOutput.content && Array.isArray(firstOutput.content) && firstOutput.content.length > 0) {
        const contentItem = firstOutput.content[0];
        if (contentItem && contentItem.text) {
          translatedContentRaw = contentItem.text;
        }
      }
    }

    console.log(`📝 [API-${Date.now() - apiStartTime}ms] Raw translation response length:`, translatedContentRaw?.length || 0, 'chars');

    if (!translatedContentRaw || translatedContentRaw.trim() === '') {
      throw new Error('Empty response from OpenAI API');
    }

    console.log(`🔍 [API-${Date.now() - apiStartTime}ms] Parsing translation JSON...`);
    // Parse the JSON string response
    const translatedJson = JSON.parse(translatedContentRaw);

    // Validate if the response is an object
    if (typeof translatedJson !== 'object' || translatedJson === null) {
      throw new Error('API response is not a valid JSON object.');
    }

    console.log(`✅ [API-${Date.now() - apiStartTime}ms] Translation completed for ${targetLanguage}. Total API time: ${Date.now() - apiStartTime}ms`);
    return translatedJson;

  } catch (error) {
    console.log(`❌ [API-${Date.now() - apiStartTime}ms] Network or parsing error:`, error);
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse the translation response from the API. It wasn't valid JSON.");
    }
    throw error;
  }
}
