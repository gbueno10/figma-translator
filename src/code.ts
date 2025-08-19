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

interface ProgressMessage {
  type: 'progress';
  message: string;
  step?: number;
  totalSteps?: number;
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
    console.log(`🚀 [${new Date().toISOString()}] Starting translation process...`);
    
    try {
      // Step 1: Capture and Validate Selection
      console.log(`⏱️ [${Date.now() - startTime}ms] Step 1: Starting selection capture...`);
      const selectedNodes = figma.currentPage.selection;
      
      if (selectedNodes.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Please select at least one frame to translate.'
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
          message: 'Please select at least one frame, component or instance.'
        } as ErrorMessage);
        return;
      }

      console.log(`📊 ${selectedFrames.length} frame(s) selected for translation`);
      console.log(`✅ [${Date.now() - startTime}ms] Step 1 completed: Selection validated`);

      // Step 2: Define "Source Frame"
      console.log(`⏱️ [${Date.now() - startTime}ms] Step 2: Defining source frame...`);
      const sourceFrame = selectedFrames[0];
      console.log(`🎯 Source frame defined: "${sourceFrame.name}"`);
      console.log(`✅ [${Date.now() - startTime}ms] Step 2 completed: Source frame defined`);

      // Step 3: Extract ALL texts from ALL selected frames using IDs
      console.log(`⏱️ [${Date.now() - startTime}ms] Step 3: Starting text extraction...`);
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
          message: 'No text elements found in selected frames.'
        } as ErrorMessage);
        return;
      }

      console.log(`📝 ${Object.keys(textsForApi).length} unique text(s) found for translation`);
      console.log(`✅ [${Date.now() - startTime}ms] Step 3 completed: Texts extracted`);

      // Send progress to UI
      figma.ui.postMessage({
        type: 'progress',
        message: `Found ${Object.keys(textsForApi).length} texts in ${selectedFrames.length} frame(s). Loading fonts...`,
        step: 1,
        totalSteps: 4
      } as ProgressMessage);

      // Load all necessary fonts at once
      console.log(`⏱️ [${Date.now() - startTime}ms] Starting font loading...`);
      const fontsToLoad = new Set<FontName>();
      for (const nodeId in allTextNodesById) {
        const textNode = allTextNodesById[nodeId];
        const fontName = textNode.fontName as FontName;
        
        // Only add valid fonts to the set
        if (fontName && fontName.family && fontName.style) {
          fontsToLoad.add(fontName);
        } else {
          console.log(`⚠️ Skipping invalid font for node ${nodeId}: ${JSON.stringify(fontName)}`);
        }
      }
      console.log(`📝 ${fontsToLoad.size} unique font(s) to load`);
      
      try {
        await Promise.all(Array.from(fontsToLoad).map(font => figma.loadFontAsync(font)));
        console.log(`✅ [${Date.now() - startTime}ms] All necessary fonts loaded.`);
        
        // Progress: fonts loaded
        figma.ui.postMessage({
          type: 'progress',
          message: `Fonts loaded. Starting translation for ${msg.targetLanguages.length} language(s)...`,
          step: 2,
          totalSteps: 4
        } as ProgressMessage);
      } catch (fontError) {
        console.log(`⚠️ [${Date.now() - startTime}ms] Failed to load one or more fonts:`, fontError);
        figma.notify('Warning: Some fonts could not be loaded, a fallback will be used.');
      }

      // Step 4: Prepare and Translate for Each Language IN PARALLEL
      console.log(`⏱️ [${Date.now() - startTime}ms] Step 4: Starting PARALLEL translation for ${msg.targetLanguages.length} language(s)...`);
      console.log('🌍 Starting translation for multiple languages IN PARALLEL...');
      
      // Create all translation promises in parallel
      const translationPromises = msg.targetLanguages.map(async (language, index) => {
        const langStartTime = Date.now();
        console.log(`🔄 [${Date.now() - startTime}ms] Starting PARALLEL translation for language ${index + 1}/${msg.targetLanguages.length}: ${language}`);
        
        const translatedTextsById = await translateTextsJson(textsForApi, language, msg.apiKey);
        
        console.log(`✅ [${Date.now() - startTime}ms] PARALLEL translation for ${language} completed in ${Date.now() - langStartTime}ms`);
        return { language, translatedTextsById };
      });

      // Wait for all translations to complete
      console.log(`⏱️ [${Date.now() - startTime}ms] Waiting for ${msg.targetLanguages.length} parallel translations...`);
      const translationResults = await Promise.all(translationPromises);
      
      // Reorganize results in expected format
      const translationsByLanguage: { [language: string]: { [nodeId: string]: string } } = {};
      for (const result of translationResults) {
        translationsByLanguage[result.language] = result.translatedTextsById;
      }
      
      console.log(`✅ [${Date.now() - startTime}ms] Step 4 completed: All PARALLEL translations finished`);

      // Progress: translations completed
      figma.ui.postMessage({
        type: 'progress',
        message: `Translations completed. Duplicating and organizing ${selectedFrames.length} frame(s)...`,
        step: 3,
        totalSteps: 4
      } as ProgressMessage);

      // Step 5: Duplicate and Organize Frames in Vertical Layout (One row per language, below originals)
      console.log(`⏱️ [${Date.now() - startTime}ms] Step 5: Starting vertical layout duplication...`);
      const duplicatedFrames: SceneNode[] = [];
      const spacingY = 100; // Vertical spacing between language rows
      let failedFonts = new Set<string>(); // Register fonts that failed
      
      console.log(`🔄 Starting vertical duplication: ${selectedFrames.length} frame(s) x ${msg.targetLanguages.length} language(s)`);

      // Calculate base Y position (below the lowest frame)
      const maxBottomY = Math.max(...selectedFrames.map(frame => frame.y + frame.height));
      console.log(`📐 Base Y position calculated: ${maxBottomY} (below original frames)`);

      // For each language (one complete row below originals)
      for (let languageIndex = 0; languageIndex < msg.targetLanguages.length; languageIndex++) {
        const language = msg.targetLanguages[languageIndex];
        const translatedTexts = translationsByLanguage[language];
        console.log(`⏱️ [${Date.now() - startTime}ms] Duplicating row for language: ${language} (${languageIndex + 1}/${msg.targetLanguages.length})`);

        // Calculate Y for this language row
        const lineY = maxBottomY + spacingY + (languageIndex * (spacingY + Math.max(...selectedFrames.map(f => f.height))));
        console.log(`📍 Row ${languageIndex + 1} (${language}) positioned at Y: ${lineY}`);

        // For each original frame (maintain same X position)
        for (let frameIndex = 0; frameIndex < selectedFrames.length; frameIndex++) {
          const frameToDuplicate = selectedFrames[frameIndex];
          const frameStartTime = Date.now();
          console.log(`📋 [${Date.now() - startTime}ms] Duplicating frame: "${frameToDuplicate.name}" for language: ${language} (${frameIndex + 1}/${selectedFrames.length})`);

          // a. Find original text nodes BEFORE duplicating
          const originalTextNodes = frameToDuplicate.findAll(node => node.type === 'TEXT') as TextNode[];

          // b. Duplicate the frame
          const cloneStartTime = Date.now();
          const duplicatedFrame = frameToDuplicate.clone();
          console.log(`⚡ [${Date.now() - startTime}ms] Frame cloned in ${Date.now() - cloneStartTime}ms`);

          // c. Position duplicated frame: same X as original, calculated Y for language row
          duplicatedFrame.x = frameToDuplicate.x; // Maintain horizontal alignment
          duplicatedFrame.y = lineY; // Place in language row
          
          // Generate frame name based on creative nomenclature
          const newFrameName = generateFrameNameWithLanguage(frameToDuplicate.name, language);
          duplicatedFrame.name = newFrameName;
          console.log(`📝 Frame name: "${frameToDuplicate.name}" -> "${newFrameName}"`);

          console.log(`📍 Frame positioned at: X=${duplicatedFrame.x}, Y=${duplicatedFrame.y}`);

          // d. Add duplicated frame to same container as original
          if (frameToDuplicate.parent) {
            frameToDuplicate.parent.appendChild(duplicatedFrame);
          }
          duplicatedFrames.push(duplicatedFrame);

          // f. Find all text nodes within the new duplicated frame
          const textNodesInDuplicated = duplicatedFrame.findAll(node => node.type === 'TEXT') as TextNode[];
          console.log(`📝 ${textNodesInDuplicated.length} text node(s) found in duplicated frame`);

          // g. Map and apply translations based on node order
          if (originalTextNodes.length === textNodesInDuplicated.length) {
            for (let i = 0; i < originalTextNodes.length; i++) {
              const originalNode = originalTextNodes[i];
              const duplicatedNode = textNodesInDuplicated[i];
              const translatedContent = translatedTexts[originalNode.id];

              if (translatedContent) {
                console.log(`🔄 Applying ${language} translation for ID ${originalNode.id}: "${originalNode.characters}" -> "${translatedContent}"`);
                try {
                  // Check if font is properly defined
                  const currentFont = duplicatedNode.fontName as FontName;
                  if (!currentFont || !currentFont.family || !currentFont.style) {
                    throw new Error(`Invalid font: ${JSON.stringify(currentFont)}`);
                  }
                  
                  // Font already loaded
                  await figma.loadFontAsync(currentFont);
                  duplicatedNode.characters = translatedContent;
                } catch (fontError) {
                  const currentFont = duplicatedNode.fontName as FontName;
                  const fontDisplay = (currentFont && currentFont.family && currentFont.style) 
                    ? `${currentFont.family} ${currentFont.style}` 
                    : `undefined font (${JSON.stringify(currentFont)})`;
                  
                  failedFonts.add(fontDisplay);
                  console.log(`⚠️ Failed to load font for duplicated node: ${fontDisplay}. Using fallback.`);
                  try {
                    const fallbackFont: FontName = { family: "Inter", style: "Regular" };
                    await figma.loadFontAsync(fallbackFont);
                    duplicatedNode.fontName = fallbackFont;
                    duplicatedNode.characters = translatedContent;
                  } catch (fallbackError) {
                    console.log(`❌ Total failure applying translation for node ${originalNode.id}: ${fallbackError}`);
                  }
                }
              } else {
                console.log(`⚠️ No translation found for ID: ${originalNode.id} ("${originalNode.characters}") in language ${language}`);
              }
            }
          } else {
            console.log(`❌ Error: Text node count in original and duplicated frame doesn't match. Frame: "${frameToDuplicate.name}"`);
          }
          
          console.log(`✅ [${Date.now() - startTime}ms] Frame "${frameToDuplicate.name}" processed for ${language} in ${Date.now() - frameStartTime}ms`);
        }
        
        console.log(`✅ [${Date.now() - startTime}ms] Language ${language} row completed`);
      }
      console.log(`✅ [${Date.now() - startTime}ms] Step 5 completed: Vertical layout duplication finished`);

      // Progress: finalization
      figma.ui.postMessage({
        type: 'progress',
        message: `Finalizing process...`,
        step: 4,
        totalSteps: 4
      } as ProgressMessage);

      // Step 6: Finalize and Notify User
      console.log(`⏱️ [${Date.now() - startTime}ms] Step 6: Finalizing process...`);
      if (duplicatedFrames.length > 0) {
        // Update selection to show translated frames
        figma.currentPage.selection = duplicatedFrames;

        figma.ui.postMessage({
          type: 'translation-result',
          translatedText: JSON.stringify(translationsByLanguage, null, 2),
          originalText: JSON.stringify(textsForApi, null, 2)
        } as TranslationResponse);

        // Smart notification based on font failures
        if (failedFonts.size > 0) {
          const fontList = Array.from(failedFonts).join(', ');
          figma.notify(`✅ Translation completed! ${duplicatedFrames.length} frame(s) created, but some fonts failed: ${fontList}`, { error: false });
        } else {
          figma.notify(`✅ Translation completed! ${duplicatedFrames.length} frame(s) created for ${msg.targetLanguages.length} language(s).`);
        }
        
        console.log(`🎉 [${Date.now() - startTime}ms] Process completed successfully: ${duplicatedFrames.length} frame(s) translated in organized grid`);
        console.log(`⏱️ TOTAL TIME: ${Date.now() - startTime}ms`);
      } else {
        throw new Error('No frame was successfully duplicated');
      }
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Translation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      } as ErrorMessage);
    }
  }
};

// Function to convert language codes to English abbreviations
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
  
  // Try to find direct match or by substring
  const lowerLanguage = language.toLowerCase();
  return languageMap[lowerLanguage] || languageMap[language] || language.toUpperCase().substring(0, 2);
}

// Function to generate frame name based on creative nomenclature
function generateFrameNameWithLanguage(originalName: string, targetLanguage: string): string {
  console.log(`🔍 Analyzing original name: "${originalName}"`);
  
  // Regex to find language patterns in name (2-3 isolated uppercase letters)
  const languagePattern = /(_[A-Z]{2,3}_)|(_[A-Z]{2,3}$)/g;
  const matches = originalName.match(languagePattern);
  
  if (matches && matches.length > 0) {
    // Take the last match (most likely to be the language)
    const lastMatch = matches[matches.length - 1];
    const targetCode = getLanguageCode(targetLanguage);
    
    console.log(`🔄 Replacing "${lastMatch}" with "_${targetCode}_" or "_${targetCode}"`);
    
    // If ends with underscore, maintain the pattern
    if (lastMatch.endsWith('_')) {
      return originalName.replace(lastMatch, `_${targetCode}_`);
    } else {
      return originalName.replace(lastMatch, `_${targetCode}`);
    }
  } else {
    // If no language pattern found, add at the end
    const targetCode = getLanguageCode(targetLanguage);
    console.log(`➕ Adding "_${targetCode}" to end of name`);
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

  // Log text that will be sent to API
  console.log(`📝 [API-${Date.now() - apiStartTime}ms] Text recognized for translation:`, JSON.stringify(texts, null, 2));
  console.log(`📨 [API-${Date.now() - apiStartTime}ms] Complete message for OpenAI:`, inputMessage);

  const requestBody = {
    model: 'gpt-5-mini', // More economical model for translations
    reasoning: { effort: 'low' }, // User request: use reasoning with low effort
    input: inputMessage, // Simple string with "JSON" mentioned
    // Correct Responses API format
    text: {
      format: { type: "json_object" } // Correct: json_object (not json)
    }
  };

  console.log(`📤 [API-${Date.now() - apiStartTime}ms] Preparing request for OpenAI (Responses API) with reasoning.low...`);
  console.log(`📤 [API-${Date.now() - apiStartTime}ms] Request body size:`, JSON.stringify(requestBody).length, 'chars');

  try {
    console.log(`🌐 [API-${Date.now() - apiStartTime}ms] Sending request to OpenAI Responses API...`);
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
      
      // More specific error messages
      let userFriendlyError = `OpenAI API error (${response.status})`;
      if (response.status === 401) {
        userFriendlyError = 'Invalid API key. Please check your credentials.';
      } else if (response.status === 429) {
        userFriendlyError = 'Rate limit exceeded. Please try again in a few minutes.';
      } else if (response.status >= 500) {
        userFriendlyError = 'OpenAI server error. Please try again later.';
      } else if (response.status === 400) {
        userFriendlyError = 'Invalid request. Please check the data sent.';
      }
      
      throw new Error(`${userFriendlyError}: ${errorText}`);
    }

    console.log(`📊 [API-${Date.now() - apiStartTime}ms] Parsing response JSON from Responses API...`);
    const data = await response.json() as any;
    console.log(`✅ [API-${Date.now() - apiStartTime}ms] GPT-5-MINI (Responses API) returned data keys:`, Object.keys(data));

    // Extract translated content from Responses API
    let translatedContentRaw: string | undefined = undefined;

    // Responses API format: data.output[1].content[0].text (second entry is usually the message)
    if (data.output && Array.isArray(data.output) && data.output.length > 1) {
      const messageOutput = data.output[1]; // Second entry is usually the message
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content) && messageOutput.content.length > 0) {
        const contentItem = messageOutput.content[0];
        if (contentItem && contentItem.text) {
          translatedContentRaw = contentItem.text;
        }
      }
    }

    // Fallback: try first entry if second doesn't work
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
