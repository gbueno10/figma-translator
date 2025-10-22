// Figma Utility Functions
// Helper functions for working with Figma nodes, fonts, and text

/**
 * Loads all unique fonts from a collection of text nodes
 * @param textNodes - Array of text nodes to extract fonts from
 * @returns Promise that resolves when all fonts are loaded
 */
export async function loadFontsFromNodes(textNodes: { [key: string]: TextNode }): Promise<Set<FontName>> {
  const startTime = Date.now();
  const fontsToLoad = new Set<FontName>();

  console.log(`⏱️ [${Date.now() - startTime}ms] Starting font loading...`);

  for (const nodeId in textNodes) {
    const textNode = textNodes[nodeId];
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
    return fontsToLoad;
  } catch (fontError) {
    console.log(`⚠️ [${Date.now() - startTime}ms] Failed to load one or more fonts:`, fontError);
    throw new Error('Warning: Some fonts could not be loaded, a fallback will be used.');
  }
}

/**
 * Extracts all text nodes from selected frames
 * @param frames - Array of frame nodes to extract text from
 * @returns Object with text IDs mapped to their content and nodes
 */
export function extractTextsFromFrames(frames: readonly (FrameNode | ComponentNode | InstanceNode)[]): {
  textsForApi: { [key: string]: string };
  allTextNodesById: { [key: string]: TextNode };
} {
  const textsForApi: { [key: string]: string } = {};
  const allTextNodesById: { [key: string]: TextNode } = {};

  for (const frame of frames) {
    const textNodes = frame.findAll((node: SceneNode) => node.type === 'TEXT') as TextNode[];
    
    for (const node of textNodes) {
      if (node.characters.trim().length > 0) {
        textsForApi[node.id] = node.characters;
        allTextNodesById[node.id] = node;
      }
    }
  }

  console.log(`📝 ${Object.keys(textsForApi).length} unique text(s) found for translation`);
  
  return { textsForApi, allTextNodesById };
}

/**
 * Converts language names to standard abbreviation codes
 * @param language - Language name or code
 * @returns Language abbreviation code (e.g., 'FR', 'DE', 'PT')
 */
export function getLanguageCode(language: string): string {
  const languageMap: { [key: string]: string } = {
    // French
    'french': 'FR',
    'fr': 'FR',
    
    // German  
    'german': 'DE',
    'de': 'DE',
    
    // Portuguese (Brazil)
    'portuguese (br)': 'PT',
    'brazilian portuguese': 'PT',
    'pt-br': 'PT',
    'pt': 'PT',
    
    // Portuguese (Portugal)
    'portuguese (pt)': 'PT-PT',
    'portuguese': 'PT-PT',
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

/**
 * Generates a frame name with language code based on creative nomenclature
 * @param originalName - Original frame name
 * @param targetLanguage - Target language for the frame
 * @returns New frame name with language code
 */
export function generateFrameNameWithLanguage(originalName: string, targetLanguage: string): string {
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

/**
 * Applies intelligent auto-fit logic to a text node to ensure text fits within original bounds
 * Uses adaptive binary search strategy for efficient and accurate text resizing
 * @param textNode - The text node to apply auto-fit to
 * @param translatedContent - The translated text content
 * @param minFontSize - Minimum font size threshold (default: 8)
 */
export async function applyAutoFitText(
  textNode: TextNode,
  translatedContent: string,
  minFontSize: number = 8
): Promise<void> {
  // 1. Check if font size is a number (not "mixed")
  if (typeof textNode.fontSize !== 'number') {
    console.log(`⚠️ Font size is mixed for node "${textNode.name}", skipping auto-fit.`);
    textNode.characters = translatedContent;
    return;
  }

  // 2. Store original text box properties
  const originalWidth = textNode.width;
  const originalHeight = textNode.height;
  const originalTextAutoResize = textNode.textAutoResize;
  const originalFontSize = textNode.fontSize;

  // 3. Apply the translated text
  textNode.characters = translatedContent;

  // 4. Temporarily change resize mode to measure overflow
  textNode.textAutoResize = 'WIDTH_AND_HEIGHT';

  // 5. Check if text fits at original size
  const initialWidth = textNode.width;
  const initialHeight = textNode.height;
  
  // Add a small tolerance (2px) to avoid unnecessary resizing for minor differences
  const widthTolerance = 2;
  const heightTolerance = 2;
  
  if (initialWidth <= originalWidth + widthTolerance && initialHeight <= originalHeight + heightTolerance) {
    console.log(`✅ Text "${textNode.name}" fits at original size (${originalFontSize}px)`);
    textNode.textAutoResize = originalTextAutoResize;
    textNode.resize(originalWidth, originalHeight);
    return;
  }

  console.log(`📏 Text "${textNode.name}" overflows: ${initialWidth.toFixed(1)}x${initialHeight.toFixed(1)} vs ${originalWidth}x${originalHeight}`);

  // 6. Use binary search for efficient font size finding
  let minSize = minFontSize;
  let maxSize = originalFontSize;
  let bestFitSize = minFontSize;
  let iterations = 0;
  const maxIterations = 20; // Safety limit

  while (minSize <= maxSize && iterations < maxIterations) {
    iterations++;
    const midSize = Math.floor((minSize + maxSize) / 2);
    textNode.fontSize = midSize;

    const currentWidth = textNode.width;
    const currentHeight = textNode.height;

    // Check if text fits with current size
    if (currentWidth <= originalWidth + widthTolerance && currentHeight <= originalHeight + heightTolerance) {
      // Text fits! Try a larger size
      bestFitSize = midSize;
      minSize = midSize + 1;
      console.log(`✓ Size ${midSize}px fits (${currentWidth.toFixed(1)}x${currentHeight.toFixed(1)})`);
    } else {
      // Text doesn't fit, try smaller
      maxSize = midSize - 1;
      console.log(`✗ Size ${midSize}px too large (${currentWidth.toFixed(1)}x${currentHeight.toFixed(1)})`);
    }
  }

  // 7. Apply the best fit size found
  textNode.fontSize = bestFitSize;
  
  const finalReduction = originalFontSize - bestFitSize;
  const reductionPercentage = ((finalReduction / originalFontSize) * 100).toFixed(1);
  
  console.log(`🎯 [RESIZE] "${textNode.name}": ${originalFontSize}px → ${bestFitSize}px (-${finalReduction}px, -${reductionPercentage}%) in ${iterations} iterations`);

  // 8. Restore original properties
  textNode.textAutoResize = originalTextAutoResize;
  textNode.resize(originalWidth, originalHeight);
}
