// Translation Handler
// Handles the main logic for translation: finding nodes, duplicating frames, mapping IDs, and applying translations

import { translateTextsJson } from '../services/openaiService';
import { loadFontsFromNodes, extractTextsFromFrames, generateFrameNameWithLanguage, applyAutoFitText } from '../utils/figmaUtils';

interface ProgressMessage {
  type: 'progress';
  message: string;
  step: number;
  totalSteps: number;
}

/**
 * Main translation handler that orchestrates the entire translation process
 * @param selectedNodes - Nodes selected by the user
 * @param targetLanguages - Array of target languages
 * @param apiKey - OpenAI API key
 * @param startTime - Process start time for logging
 */
export async function handleTranslation(
  selectedNodes: readonly SceneNode[],
  targetLanguages: string[],
  apiKey: string,
  startTime: number
): Promise<void> {
  // Step 1: Validate Selection
  console.log(`⏱️ [${Date.now() - startTime}ms] Step 1: Starting selection capture...`);
  
  if (selectedNodes.length === 0) {
    throw new Error('Please select at least one frame to translate.');
  }

  // Filter only FRAME, COMPONENT or INSTANCE nodes
  const selectedFrames = selectedNodes.filter(
    node => node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE'
  ) as (FrameNode | ComponentNode | InstanceNode)[];

  if (selectedFrames.length === 0) {
    throw new Error('Please select at least one frame, component or instance.');
  }

  console.log(`📊 ${selectedFrames.length} frame(s) selected for translation`);
  console.log(`✅ [${Date.now() - startTime}ms] Step 1 completed: Selection validated`);

  // Step 2: Define Source Frame
  console.log(`⏱️ [${Date.now() - startTime}ms] Step 2: Defining source frame...`);
  const sourceFrame = selectedFrames[0];
  console.log(`🎯 Source frame defined: "${sourceFrame.name}"`);
  console.log(`✅ [${Date.now() - startTime}ms] Step 2 completed: Source frame defined`);

  // Step 3: Extract Texts
  console.log(`⏱️ [${Date.now() - startTime}ms] Step 3: Starting text extraction...`);
  const { textsForApi, allTextNodesById } = extractTextsFromFrames(selectedFrames);

  if (Object.keys(textsForApi).length === 0) {
    throw new Error('No text elements found in selected frames.');
  }

  console.log(`✅ [${Date.now() - startTime}ms] Step 3 completed: Texts extracted`);

  // Send progress to UI
  figma.ui.postMessage({
    type: 'progress',
    message: `Found ${Object.keys(textsForApi).length} texts in ${selectedFrames.length} frame(s). Loading fonts...`,
    step: 1,
    totalSteps: 4
  } as ProgressMessage);

  // Load fonts
  try {
    await loadFontsFromNodes(allTextNodesById);
    
    figma.ui.postMessage({
      type: 'progress',
      message: `Fonts loaded. Starting translation for ${targetLanguages.length} language(s)...`,
      step: 2,
      totalSteps: 4
    } as ProgressMessage);
  } catch (fontError) {
    figma.notify('Warning: Some fonts could not be loaded, a fallback will be used.');
  }

  // Step 4: Translate in Parallel
  console.log(`⏱️ [${Date.now() - startTime}ms] Step 4: Starting PARALLEL translation for ${targetLanguages.length} language(s)...`);
  
  const translationPromises = targetLanguages.map(async (language, index) => {
    const langStartTime = Date.now();
    console.log(`🔄 [${Date.now() - startTime}ms] Starting PARALLEL translation for language ${index + 1}/${targetLanguages.length}: ${language}`);
    
    const translatedTextsById = await translateTextsJson(textsForApi, language, apiKey);
    
    console.log(`✅ [${Date.now() - startTime}ms] PARALLEL translation for ${language} completed in ${Date.now() - langStartTime}ms`);
    
    return { language, translatedTextsById };
  });

  const translationResults = await Promise.all(translationPromises);

  // Reorganize results
  const translationsByLanguage: { [language: string]: { [id: string]: string } } = {};
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

  // Step 5: Duplicate and Apply Translations
  await duplicateAndApplyTranslations(
    selectedFrames,
    targetLanguages,
    translationsByLanguage,
    startTime
  );
}

/**
 * Duplicates frames and applies translations using ID mapping
 * @param selectedFrames - Frames to duplicate
 * @param targetLanguages - Target languages
 * @param translationsByLanguage - Translations mapped by language and ID
 * @param startTime - Process start time
 */
async function duplicateAndApplyTranslations(
  selectedFrames: (FrameNode | ComponentNode | InstanceNode)[],
  targetLanguages: string[],
  translationsByLanguage: { [language: string]: { [id: string]: string } },
  startTime: number
): Promise<void> {
  console.log(`⏱️ [${Date.now() - startTime}ms] Step 5: Starting vertical layout duplication...`);
  
  const duplicatedFrames: SceneNode[] = [];
  const spacingY = 100;
  const failedFonts = new Set<string>();

  // Calculate base Y position
  const maxBottomY = Math.max(...selectedFrames.map(frame => frame.y + frame.height));
  console.log(`📐 Base Y position calculated: ${maxBottomY}`);

  // For each language
  for (let languageIndex = 0; languageIndex < targetLanguages.length; languageIndex++) {
    const language = targetLanguages[languageIndex];
    const translatedTexts = translationsByLanguage[language];
    
    const lineY = maxBottomY + spacingY + (languageIndex * (spacingY + Math.max(...selectedFrames.map(f => f.height))));

    // For each frame
    for (const frameToDuplicate of selectedFrames) {
      const frameStartTime = Date.now();
      
      // Find original text nodes BEFORE duplicating
      const originalTextNodes = frameToDuplicate.findAll((node: SceneNode) => node.type === 'TEXT') as TextNode[];
      console.log(`📝 Found ${originalTextNodes.length} text node(s) in original frame "${frameToDuplicate.name}"`);

      // Duplicate the frame
      const duplicatedFrame = frameToDuplicate.clone();

      // Position duplicated frame
      duplicatedFrame.x = frameToDuplicate.x;
      duplicatedFrame.y = lineY;

      // Generate frame name
      const newFrameName = generateFrameNameWithLanguage(frameToDuplicate.name, language);
      duplicatedFrame.name = newFrameName;
      console.log(`📝 Frame name: "${frameToDuplicate.name}" -> "${newFrameName}"`);

      // Add to parent
      if (frameToDuplicate.parent) {
        frameToDuplicate.parent.appendChild(duplicatedFrame);
      }
      duplicatedFrames.push(duplicatedFrame);

      // Find cloned text nodes
      const clonedTextNodes = duplicatedFrame.findAll((node: SceneNode) => node.type === 'TEXT') as TextNode[];

      // Create ID mapping: Original Node ID -> Cloned Node Object
      const idToClonedNodeMap = new Map<string, TextNode>();
      
      if (originalTextNodes.length === clonedTextNodes.length) {
        for (let i = 0; i < originalTextNodes.length; i++) {
          const originalId = originalTextNodes[i].id;
          const clonedNode = clonedTextNodes[i];
          idToClonedNodeMap.set(originalId, clonedNode);
          console.log(`🔗 Mapped original ID ${originalId} to cloned node`);
        }
        console.log(`✅ Created ID mapping for ${idToClonedNodeMap.size} text nodes`);
      } else {
        console.log(`⚠️ Warning: Node count mismatch! Original: ${originalTextNodes.length}, Cloned: ${clonedTextNodes.length}`);
      }

      // Apply translations using ID mapping
      for (const originalId in translatedTexts) {
        const translatedContent = translatedTexts[originalId];
        const duplicatedNode = idToClonedNodeMap.get(originalId);

        if (!duplicatedNode) {
          console.log(`⚠️ Warning: No cloned node found for original ID ${originalId}`);
          continue;
        }

        console.log(`🔄 Applying ${language} translation for ID ${originalId}: "${translatedContent}"`);

        if (translatedContent) {
          try {
            // Load font
            const currentFont = duplicatedNode.fontName as FontName;
            if (!currentFont || !currentFont.family || !currentFont.style) {
              throw new Error(`Invalid font: ${JSON.stringify(currentFont)}`);
            }

            await figma.loadFontAsync(currentFont);

            // Apply auto-fit text
            await applyAutoFitText(duplicatedNode, translatedContent);

          } catch (fontError) {
            // Fallback to Inter
            const currentFont = duplicatedNode.fontName as FontName;
            const fontDisplay = (currentFont && currentFont.family && currentFont.style)
              ? `${currentFont.family} ${currentFont.style}`
              : `undefined font`;

            failedFonts.add(fontDisplay);
            console.log(`⚠️ Failed to load font: ${fontDisplay}. Using fallback.`);

            try {
              const fallbackFont: FontName = { family: "Inter", style: "Regular" };
              await figma.loadFontAsync(fallbackFont);
              duplicatedNode.fontName = fallbackFont;

              // Apply auto-fit with fallback font
              await applyAutoFitText(duplicatedNode, translatedContent);

            } catch (fallbackError) {
              console.log(`❌ Total failure applying translation for node ID ${originalId}: ${fallbackError}`);
            }
          }
        }
      }

      console.log(`✅ [${Date.now() - startTime}ms] Frame "${frameToDuplicate.name}" processed for ${language} in ${Date.now() - frameStartTime}ms`);
    }
  }

  console.log(`✅ [${Date.now() - startTime}ms] Step 5 completed: Vertical layout duplication finished`);

  // Finalize
  finalizeTranslation(duplicatedFrames, failedFonts, targetLanguages, startTime);
}

/**
 * Finalizes the translation process with user feedback
 * @param duplicatedFrames - All duplicated frames
 * @param failedFonts - Set of fonts that failed to load
 * @param targetLanguages - Target languages
 * @param startTime - Process start time
 */
function finalizeTranslation(
  duplicatedFrames: SceneNode[],
  failedFonts: Set<string>,
  targetLanguages: string[],
  startTime: number
): void {
  figma.ui.postMessage({
    type: 'progress',
    message: `Finalizing process...`,
    step: 4,
    totalSteps: 4
  } as ProgressMessage);

  if (duplicatedFrames.length > 0) {
    // Update selection
    figma.currentPage.selection = duplicatedFrames;

    figma.ui.postMessage({
      type: 'translation-result'
    });

    // Notification
    if (failedFonts.size > 0) {
      const fontList = Array.from(failedFonts).join(', ');
      figma.notify(
        `✅ Translation completed! ${duplicatedFrames.length} frame(s) created, but some fonts failed: ${fontList}`,
        { error: false }
      );
    } else {
      figma.notify(
        `✅ Translation completed! ${duplicatedFrames.length} frame(s) created for ${targetLanguages.length} language(s).`
      );
    }

    console.log(`🎉 [${Date.now() - startTime}ms] Process completed successfully`);
    console.log(`⏱️ TOTAL TIME: ${Date.now() - startTime}ms`);
  } else {
    throw new Error('No frame was successfully duplicated');
  }
}
