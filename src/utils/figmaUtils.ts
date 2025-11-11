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
