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
      // Find all selected nodes
      const selectedNodes = figma.currentPage.selection;
      
      if (selectedNodes.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Select at least one element (frame, group, or text) to translate.'
        } as ErrorMessage);
        return;
      }

      // Find all text nodes within the selection (recursively)
      const allTextNodes: TextNode[] = [];
      
      for (const node of selectedNodes) {
        if (node.type === 'TEXT') {
          // If it's directly a text node
          allTextNodes.push(node as TextNode);
        } else {
          // If it's a container (frame, group, etc.), find all text nodes inside
          if ('findAll' in node) {
            const textNodesInside = node.findAll((child: SceneNode) => child.type === 'TEXT') as TextNode[];
            allTextNodes.push(...textNodesInside);
          }
        }
      }

      if (allTextNodes.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'No text elements found in the selection.'
        } as ErrorMessage);
        return;
      }

      // Collect all frames/containers that contain the found texts or are the selection itself
      const framesToDuplicate = new Set<FrameNode>();
      
      for (const selectedNode of selectedNodes) {
        if (selectedNode.type === 'FRAME' || selectedNode.type === 'COMPONENT' || selectedNode.type === 'INSTANCE') {
          // If the selection itself is a frame/component, duplicate it
          framesToDuplicate.add(selectedNode as FrameNode);
        } else {
          // Otherwise, find the parent frame of the selected element
          let parent = selectedNode.parent;
          while (parent && parent.type !== 'FRAME' && parent.type !== 'COMPONENT' && parent.type !== 'INSTANCE') {
            parent = parent.parent;
          }
          
          if (parent && (parent.type === 'FRAME' || parent.type === 'COMPONENT' || parent.type === 'INSTANCE')) {
            framesToDuplicate.add(parent as FrameNode);
          }
        }
      }

      if (framesToDuplicate.size === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Selected elements must be inside frames to be duplicated.'
        } as ErrorMessage);
        return;
      }

      // Load fonts and collect texts with metadata
      const allTexts: string[] = [];
      const originalTextNodes: TextNode[] = [];
      
      for (const textNode of allTextNodes) {
        try {
          // Always try to load the font for each text node
          await figma.loadFontAsync(textNode.fontName as FontName);
          console.log('✅ Font loaded successfully:', textNode.fontName);
        } catch (fontError) {
          console.log('⚠️ Could not load font for text node:', textNode.fontName, fontError);
          console.log('📝 Text content:', textNode.characters);
          // Font loading failed, but we'll continue and handle it later when applying translations
        }
        
        const originalText = msg.text || textNode.characters;
        allTexts.push(originalText);
        originalTextNodes.push(textNode);
      }
      
      // Create context-aware prompt for translation
      let textToTranslate: string;
      let isContextualTranslation = false;
      
      if (msg.text) {
        // If custom text is provided, use it as-is
        textToTranslate = msg.text;
      } else if (allTexts.length > 1) {
        // Multiple texts: create a context-aware format
        isContextualTranslation = true;
        const textMap = allTexts.map((text, index) => `[TEXT_${index}]: ${text}`).join('\n');
        textToTranslate = `Please translate the following texts as a cohesive unit, understanding the context and relationship between them. Maintain the same structure and return each translation with its corresponding [TEXT_X] identifier:

${textMap}`;
      } else {
        // Single text
        textToTranslate = allTexts[0];
      }
      
      console.log('🌍 Translation mode:', isContextualTranslation ? 'Contextual (multiple texts)' : 'Single text');
      console.log('📝 Text to translate:', textToTranslate);
      
      const translatedText = await translateText(textToTranslate, msg.targetLanguage, msg.apiKey, isContextualTranslation);
      
      // Duplicate frames that contain the texts
      const duplicatedFrames: FrameNode[] = [];
      const offsetX = 50; // Horizontal offset for duplicated frames
      
      for (const frame of framesToDuplicate) {
        const duplicatedFrame = frame.clone();
        duplicatedFrame.x = frame.x + frame.width + offsetX;
        duplicatedFrame.name = frame.name + ' (Translated)';
        
        // Add the duplicated frame to the same container as the original
        if (frame.parent) {
          frame.parent.appendChild(duplicatedFrame);
        }
        
        duplicatedFrames.push(duplicatedFrame);
      }

            // Apply translations to texts in duplicated frames
      if (msg.text) {
        // If it was custom text, apply to all text nodes in duplicated frames
        console.log('🔄 Applying custom text to all text nodes in duplicated frames');
        for (const duplicatedFrame of duplicatedFrames) {
          const textNodesInFrame = duplicatedFrame.findAll(node => node.type === 'TEXT') as TextNode[];
          console.log(`📊 Found ${textNodesInFrame.length} text nodes in duplicated frame`);
          
          for (const textNode of textNodesInFrame) {
            // Check if this text was in the original selection
            const originalTextInSelection = originalTextNodes.find(original => 
              original.characters === textNode.characters && 
              JSON.stringify(original.fontName) === JSON.stringify(textNode.fontName)
            );
            
            if (originalTextInSelection) {
              console.log(`📝 Updating text: "${textNode.characters}" -> "${translatedText}"`);
              try {
                await figma.loadFontAsync(textNode.fontName as FontName);
                textNode.characters = translatedText;
                console.log('✅ Text updated successfully with original font');
              } catch (fontError) {
                console.log('⚠️ Font loading failed for:', textNode.fontName, fontError);
                try {
                  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
                  textNode.fontName = { family: "Inter", style: "Regular" };
                  textNode.characters = translatedText;
                  console.log('✅ Text updated successfully with fallback font');
                } catch (fallbackError) {
                  console.log('❌ Could not apply translation to text node due to font issues');
                  try {
                    textNode.characters = translatedText;
                    console.log('⚠️ Text updated without font change');
                  } catch (finalError) {
                    console.log('❌ Complete failure to update text:', finalError);
                  }
                }
              }
            }
          }
        }
      } else if (isContextualTranslation) {
        // Parse contextual translation response
        console.log('🔄 Applying contextual translations...');
        console.log('📥 Full translation response:', translatedText);
        
        const translationMap = new Map<number, string>();
        
        // Split by [TEXT_X]: pattern and process each section
        const textPattern = /\[TEXT_(\d+)\]:\s*([\s\S]*?)(?=\[TEXT_\d+\]:|$)/g;
        let match;
        
        while ((match = textPattern.exec(translatedText)) !== null) {
          const index = parseInt(match[1]);
          let translation = match[2].trim();
          
          if (translation) {
            translationMap.set(index, translation);
            console.log(`📝 Parsed translation ${index}: "${translation}"`);
          }
        }
        
        // If no matches found with the pattern above, try alternative parsing
        if (translationMap.size === 0) {
          console.log('⚠️ Primary parsing failed, trying alternative method...');
          const lines = translatedText.split('\n');
          let currentIndex = -1;
          let currentTranslation = '';
          
          for (const line of lines) {
            const textMatch = line.match(/\[TEXT_(\d+)\]:\s*(.*)/);
            if (textMatch) {
              // Save previous translation if exists
              if (currentIndex >= 0 && currentTranslation.trim()) {
                translationMap.set(currentIndex, currentTranslation.trim());
                console.log(`📝 Alt-parsed translation ${currentIndex}: "${currentTranslation.trim()}"`);
              }
              // Start new translation
              currentIndex = parseInt(textMatch[1]);
              currentTranslation = textMatch[2] || '';
            } else if (currentIndex >= 0) {
              // Continue previous translation
              currentTranslation += (currentTranslation ? '\n' : '') + line;
            }
          }
          
          // Save the last translation
          if (currentIndex >= 0 && currentTranslation.trim()) {
            translationMap.set(currentIndex, currentTranslation.trim());
            console.log(`📝 Alt-parsed translation ${currentIndex}: "${currentTranslation.trim()}"`);
          }
        }
        
        console.log(`📊 Successfully parsed ${translationMap.size} translations out of ${originalTextNodes.length} expected`);
        
        // Apply translations to corresponding text nodes
        for (let i = 0; i < originalTextNodes.length; i++) {
          const originalTextNode = originalTextNodes[i];
          const translation = translationMap.get(i);
          
          if (!translation) {
            console.log(`❌ No translation found for text ${i}: "${originalTextNode.characters}"`);
            continue;
          }
          
          console.log(`� Processing text ${i + 1}: "${originalTextNode.characters}" -> "${translation}"`);
          
          // Find corresponding text in duplicated frames
          let textUpdated = false;
          for (const duplicatedFrame of duplicatedFrames) {
            const textNodesInFrame = duplicatedFrame.findAll(node => node.type === 'TEXT') as TextNode[];
            for (const textNode of textNodesInFrame) {
              if (textNode.characters === originalTextNode.characters && 
                  JSON.stringify(textNode.fontName) === JSON.stringify(originalTextNode.fontName)) {
                try {
                  await figma.loadFontAsync(textNode.fontName as FontName);
                  textNode.characters = translation;
                  console.log(`✅ Text updated successfully: "${translation}"`);
                  textUpdated = true;
                } catch (fontError) {
                  console.log('⚠️ Font loading failed for:', textNode.fontName, fontError);
                  try {
                    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
                    textNode.fontName = { family: "Inter", style: "Regular" };
                    textNode.characters = translation;
                    console.log(`✅ Text updated with fallback font: "${translation}"`);
                    textUpdated = true;
                  } catch (fallbackError) {
                    console.log('❌ Could not apply translation to text node due to font issues');
                    try {
                      textNode.characters = translation;
                      console.log(`⚠️ Text updated without font change: "${translation}"`);
                      textUpdated = true;
                    } catch (finalError) {
                      console.log('❌ Complete failure to update text:', finalError);
                    }
                  }
                }
                break;
              }
            }
          }
          
          if (!textUpdated) {
            console.log(`❌ Failed to update text: "${originalTextNode.characters}"`);
          }
        }
      } else {
        // Single text - apply directly
        console.log('🔄 Applying single text translation...');
        const originalTextNode = originalTextNodes[0];
        
        for (const duplicatedFrame of duplicatedFrames) {
          const textNodesInFrame = duplicatedFrame.findAll(node => node.type === 'TEXT') as TextNode[];
          for (const textNode of textNodesInFrame) {
            if (textNode.characters === originalTextNode.characters && 
                JSON.stringify(textNode.fontName) === JSON.stringify(originalTextNode.fontName)) {
              try {
                await figma.loadFontAsync(textNode.fontName as FontName);
                textNode.characters = translatedText;
                console.log(`✅ Single text updated successfully: "${translatedText}"`);
              } catch (fontError) {
                console.log('⚠️ Font loading failed for:', textNode.fontName, fontError);
                try {
                  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
                  textNode.fontName = { family: "Inter", style: "Regular" };
                  textNode.characters = translatedText;
                  console.log('✅ Single text updated with fallback font');
                } catch (fallbackError) {
                  console.log('❌ Could not apply translation to text node due to font issues');
                  try {
                    textNode.characters = translatedText;
                    console.log('⚠️ Single text updated without font change');
                  } catch (finalError) {
                    console.log('❌ Complete failure to update text:', finalError);
                  }
                }
              }
              break;
            }
          }
        }
      }
      
      // Select duplicated frames to show to user
      figma.currentPage.selection = duplicatedFrames;
      
      figma.ui.postMessage({
        type: 'translation-result',
        translatedText: translatedText,
        originalText: textToTranslate
      } as TranslationResponse);
      
      figma.notify(`Translation completed! ${duplicatedFrames.length} frame(s) duplicated and translated.`);
      
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
    ? `You are a professional advertising translator specializing in dog training app marketing materials. You will receive multiple related text elements that work together as a cohesive advertising campaign.

CONTEXT AWARENESS: These texts are part of the same marketing campaign and should be translated with awareness of their relationship to each other. Consider the flow, tone consistency, and how they work together to tell a story or convey a message.

TRANSLATION GUIDELINES for ${targetLanguage}:
- Maintain the original text's meaning, persuasive tone, and intent across all elements
- Keep the structure and approximately the same length for each element
- Adapt idioms and cultural references to sound natural in the target language
- Use simple, clear vocabulary suitable for the target audience and advertising context
- Choose terms that maximize engagement and emotional resonance in the target language
- Retain all original formatting (line breaks, bold, lists, etc.)
- Ensure consistency in terminology and tone across all text elements

OUTPUT FORMAT: 
Return each translation with its corresponding [TEXT_X] identifier, exactly as provided in the input. Do not add explanations or notes.

Example:
[TEXT_0]: [translated text]
[TEXT_1]: [translated text]`
    : `Translate validated advertising creatives for a dog training app into ${targetLanguage}, preserving original impact and commercial effectiveness.

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

Your task is to translate validated ad creative into ${targetLanguage}, preserving original meaning, tone, structure, and commercial impact, while using natural, emotionally engaging language. Always keep the original formatting, and output only the translated text.`;

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
