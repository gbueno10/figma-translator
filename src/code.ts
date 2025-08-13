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
          message: 'Por favor, selecione pelo menos um elemento para traduzir.'
        } as ErrorMessage);
        return;
      }

      // Lógica inteligente para identificar frames a serem duplicados
      const framesToProcess = new Set<FrameNode>();
      
      for (const selectedNode of selectedNodes) {
        if (selectedNode.type === 'FRAME' || selectedNode.type === 'COMPONENT' || selectedNode.type === 'INSTANCE') {
          // Se é diretamente um frame/component/instance, adicionar
          framesToProcess.add(selectedNode as FrameNode);
        } else {
          // Para outros tipos (elipse, grupo, texto, etc.), encontrar o frame pai
          let parent = selectedNode.parent;
          while (parent && parent.type !== 'FRAME' && parent.type !== 'COMPONENT' && parent.type !== 'INSTANCE') {
            parent = parent.parent;
          }
          
          if (parent && (parent.type === 'FRAME' || parent.type === 'COMPONENT' || parent.type === 'INSTANCE')) {
            framesToProcess.add(parent as FrameNode);
          }
        }
      }

      const selectedFrames = Array.from(framesToProcess);

      if (selectedFrames.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Os elementos selecionados devem estar dentro de frames para serem traduzidos.'
        } as ErrorMessage);
        return;
      }

      console.log(`📊 ${selectedFrames.length} frame(s) selecionado(s) para tradução`);

      // Passo 2: Definir o "Frame Fonte"
      const sourceFrame = selectedFrames[0];
      console.log(`🎯 Frame fonte definido: "${sourceFrame.name}"`);

      // Passo 3: Extrair Textos Apenas do Frame Fonte
      const textNodesInSource = sourceFrame.findAll(node => node.type === 'TEXT') as TextNode[];
      
      if (textNodesInSource.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Nenhum elemento de texto encontrado no frame fonte.'
        } as ErrorMessage);
        return;
      }

      console.log(`📝 ${textNodesInSource.length} texto(s) encontrado(s) no frame fonte`);

      // Carregar fontes e coletar textos originais
      const originalTexts: string[] = [];
      
      for (const textNode of textNodesInSource) {
        try {
          await figma.loadFontAsync(textNode.fontName as FontName);
          console.log('✅ Fonte carregada:', textNode.fontName);
        } catch (fontError) {
          console.log('⚠️ Falha ao carregar fonte:', textNode.fontName, fontError);
        }
        
        const originalText = msg.text || textNode.characters;
        originalTexts.push(originalText);
      }

      // Passo 4: Preparar e Enviar para a API
      let textToTranslate: string;
      let isContextualTranslation = false;
      
      if (msg.text) {
        // Se texto customizado foi fornecido, usar como está
        textToTranslate = msg.text;
        console.log('📝 Usando texto customizado fornecido');
      } else if (originalTexts.length > 1) {
        // Múltiplos textos: criar formato contextual
        isContextualTranslation = true;
        const textMap = originalTexts.map((text, index) => `[TEXT_${index}]: ${text}`).join('\n');
        textToTranslate = `Please translate the following texts as a cohesive unit, understanding the context and relationship between them. Maintain the same structure and return each translation with its corresponding [TEXT_X] identifier:

${textMap}`;
        console.log('📝 Modo contextual com múltiplos textos');
      } else {
        // Texto único
        textToTranslate = originalTexts[0];
        console.log('📝 Modo texto único');
      }
      
      console.log('🌍 Iniciando tradução...');
      console.log('📝 Texto para traduzir:', textToTranslate);
      
      const translatedText = await translateText(textToTranslate, msg.targetLanguage, msg.apiKey, isContextualTranslation);

      // Passo 5: Construir o "Mapa de Tradução"
      const translationMap = new Map<string, string>();
      
      if (msg.text) {
        // Se foi fornecido texto customizado, mapear para todos os textos originais
        for (const originalText of originalTexts) {
          translationMap.set(originalText, translatedText);
        }
        console.log('�️ Mapa de tradução criado para texto customizado');
      } else if (isContextualTranslation) {
        // Modo contextual: parsear a resposta para extrair traduções individuais
        console.log('🔍 Parseando resposta contextual...');
        console.log('📥 Resposta completa:', translatedText);
        
        // Padrão para extrair [TEXT_X]: tradução
        const textPattern = /\[TEXT_(\d+)\]:\s*([\s\S]*?)(?=\[TEXT_\d+\]:|$)/g;
        let match;
        
        while ((match = textPattern.exec(translatedText)) !== null) {
          const index = parseInt(match[1]);
          let translation = match[2].trim();
          
          if (translation && index < originalTexts.length) {
            translationMap.set(originalTexts[index], translation);
            console.log(`📝 Mapeamento ${index}: "${originalTexts[index]}" -> "${translation}"`);
          }
        }
        
        // Método alternativo se o padrão principal falhar
        if (translationMap.size === 0) {
          console.log('⚠️ Parseamento principal falhou, tentando método alternativo...');
          const lines = translatedText.split('\n');
          let currentIndex = -1;
          let currentTranslation = '';
          
          for (const line of lines) {
            const textMatch = line.match(/\[TEXT_(\d+)\]:\s*(.*)/);
            if (textMatch) {
              // Salvar tradução anterior se existir
              if (currentIndex >= 0 && currentTranslation.trim() && currentIndex < originalTexts.length) {
                translationMap.set(originalTexts[currentIndex], currentTranslation.trim());
                console.log(`📝 Alt-mapeamento ${currentIndex}: "${originalTexts[currentIndex]}" -> "${currentTranslation.trim()}"`);
              }
              // Iniciar nova tradução
              currentIndex = parseInt(textMatch[1]);
              currentTranslation = textMatch[2] || '';
            } else if (currentIndex >= 0) {
              // Continuar tradução anterior
              currentTranslation += (currentTranslation ? '\n' : '') + line;
            }
          }
          
          // Salvar a última tradução
          if (currentIndex >= 0 && currentTranslation.trim() && currentIndex < originalTexts.length) {
            translationMap.set(originalTexts[currentIndex], currentTranslation.trim());
            console.log(`📝 Alt-mapeamento ${currentIndex}: "${originalTexts[currentIndex]}" -> "${currentTranslation.trim()}"`);
          }
        }
        
        console.log(`📊 ${translationMap.size} traduções mapeadas de ${originalTexts.length} textos originais`);
      } else {
        // Texto único: mapear diretamente
        if (originalTexts.length > 0) {
          translationMap.set(originalTexts[0], translatedText);
          console.log('🗺️ Mapa de tradução criado para texto único');
        }
      }

      // Passo 6: Duplicar Todos os Frames e Aplicar as Traduções
      const duplicatedFrames: FrameNode[] = [];
      const offsetX = 50; // Deslocamento horizontal para frames duplicados
      
      console.log(`🔄 Iniciando duplicação e tradução de ${selectedFrames.length} frame(s)...`);
      
      for (const frameToDuplicate of selectedFrames) {
        console.log(`📋 Duplicando frame: "${frameToDuplicate.name}"`);
        
        // a. Duplicar o frame
        const duplicatedFrame = frameToDuplicate.clone();
        
        // b. Posicionar e renomear o frame duplicado
        duplicatedFrame.x = frameToDuplicate.x + frameToDuplicate.width + offsetX;
        duplicatedFrame.name = frameToDuplicate.name + ' (Translated)';
        
        // Adicionar o frame duplicado ao mesmo container do original
        if (frameToDuplicate.parent) {
          frameToDuplicate.parent.appendChild(duplicatedFrame);
        }
        
        duplicatedFrames.push(duplicatedFrame);
        
        // c. Encontrar todos os nós de texto dentro deste novo frame duplicado
        const textNodesInDuplicated = duplicatedFrame.findAll(node => node.type === 'TEXT') as TextNode[];
        console.log(`📝 ${textNodesInDuplicated.length} nó(s) de texto encontrado(s) no frame duplicado`);
        
        // d. Loop pelos nós de texto para aplicar traduções
        for (const textNode of textNodesInDuplicated) {
          // e. Fazer o "Match": usar o conteúdo como chave para buscar a tradução
          const originalContent = textNode.characters;
          const translatedContent = translationMap.get(originalContent);
          
          if (translatedContent) {
            console.log(`🔄 Aplicando tradução: "${originalContent}" -> "${translatedContent}"`);
            
            // f. Aplicar a Tradução com fallback de fonte
            try {
              await figma.loadFontAsync(textNode.fontName as FontName);
              textNode.characters = translatedContent;
              console.log('✅ Tradução aplicada com fonte original');
            } catch (fontError) {
              console.log('⚠️ Falha ao carregar fonte original:', textNode.fontName, fontError);
              try {
                await figma.loadFontAsync({ family: "Inter", style: "Regular" });
                textNode.fontName = { family: "Inter", style: "Regular" };
                textNode.characters = translatedContent;
                console.log('✅ Tradução aplicada com fonte fallback (Inter)');
              } catch (fallbackError) {
                console.log('❌ Falha ao aplicar fonte fallback, tentando sem mudança de fonte');
                try {
                  textNode.characters = translatedContent;
                  console.log('⚠️ Tradução aplicada sem mudança de fonte');
                } catch (finalError) {
                  console.log('❌ Falha completa ao aplicar tradução:', finalError);
                }
              }
            }
          } else {
            console.log(`⚠️ Nenhuma tradução encontrada para: "${originalContent}"`);
          }
        }
      }
      
      // Passo 7: Finalizar e Notificar o Usuário
      if (duplicatedFrames.length > 0) {
        // Atualizar seleção para mostrar os frames traduzidos
        figma.currentPage.selection = duplicatedFrames;
        
        figma.ui.postMessage({
          type: 'translation-result',
          translatedText: translatedText,
          originalText: textToTranslate
        } as TranslationResponse);
        
        figma.notify(`✅ Tradução concluída! ${duplicatedFrames.length} frame(s) duplicado(s) e traduzido(s) com uma única chamada da API.`);
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
async function translateText(text: string, targetLanguage: string, apiKey: string, isContextual: boolean = false): Promise<string> {
  console.log('🚀 Starting translation with GPT-5...');
  console.log('📝 Text length:', text.length);
  console.log('🌍 Target language:', targetLanguage);
  console.log('🔗 Contextual mode:', isContextual);
  
  const systemPrompt = isContextual 
    ? `You are a **transcreation and marketing copywriting expert**, specializing in adapting successful campaigns for the **${targetLanguage}** market. Your niche is dog training applications.

Your mission is to adapt a set of related marketing texts so they sound as if they were originally crafted by a native speaker in ${targetLanguage}, for local dog owners.

**KEY PRINCIPLE: NATURAL FEEL OVER LITERAL TRANSLATION**
Always prioritize the phrase a native speaker would naturally use, even if it deviates from the literal translation. The goal is to capture the **intent** and **emotional impact**, not just the words.

**PRACTICAL EXAMPLE (EN to Spanish):**
- **Original (EN):** "Level up your dog's obedience."
- **Literal/Poor (ES):** "Sube de nivel la obediencia de tu perro." (Sounds robotic and unnatural)
- **Ideal Transcreation (ES):** "Mejora la obediencia de tu perro." or "Lleva el adiestramiento de tu perro al siguiente nivel." (Natural and effective)

**EXECUTION GUIDELINES:**
1.  **Campaign Cohesion:** Analyze all texts ([TEXT_0], [TEXT_1], etc.) as a single unit. Maintain a consistent tone and terminology across them.
2.  **Commercial Impact:** Preserve the original's persuasive effectiveness. The translation must drive clicks, engagement, and conversions.
3.  **Brand Voice:** The tone is friendly, encouraging, and expert. Use language that builds an emotional connection with dog owners.
4.  **Structure & Length:** Maintain the approximate structure and length of each [TEXT_X] to fit the original UI design.
5.  **No Invention:** Do not add new information, benefits, or CTAs not present in the original.

**MANDATORY OUTPUT FORMAT:**
Return EACH translation with its corresponding [TEXT_X] identifier. Include absolutely no explanations, notes, or additional text. Only the formatted result.

Example Output:
[TEXT_0]: [Translated text 0]
[TEXT_1]: [Translated text 1]`
    : `You are a **transcreation and marketing copywriting expert**, adapting a successful text from a dog training app into **${targetLanguage}**.

Your mission is to make this text sound as if it were crafted by a native copywriter in ${targetLanguage}, aiming to maximize engagement and persuasion.

**KEY PRINCIPLE: NATURAL FEEL OVER LITERAL TRANSLATION**
Always prioritize the phrase a native speaker would naturally use, even if it deviates from the literal translation. The goal is to capture the **intent** and **emotional impact**, not just the words. 

**MANDATORY OUTPUT FORMAT:**
Deliver **only the translated text**. Do not add "Translation:", quotes, notes, or any other explanations.`;

  const requestBody = {
    model: 'gpt-5',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: text
      }
    ],
    verbosity: 'medium',
    reasoning_effort: 'minimal',
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
    console.log('📥 Response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error response body:', errorText);
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    console.log('✅ GPT-5 successful');
    console.log('📊 Usage:', data.usage);
    
    const translatedContent = data.choices[0].message.content;
    console.log('📝 Raw translation response:', translatedContent);
    
    if (!translatedContent || translatedContent.trim() === '') {
      throw new Error('Empty response from OpenAI API');
    }
    
    return translatedContent.trim();
    
  } catch (error) {
    console.log('❌ Network or parsing error:', error);
    throw error;
  }
}
