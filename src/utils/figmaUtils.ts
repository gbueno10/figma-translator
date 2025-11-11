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
    'ru': 'RU',

    // Hungarian
    'hungarian': 'HU',
    'hu': 'HU'
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
 * Applies translated text to a node and auto-fits it within the original bounds using binary search
 * while respecting the node's original auto-resize behavior.
 * @param textNode - Text node to update
 * @param translatedContent - New text content to apply
 */
export async function applyAutoFitText(textNode: TextNode, translatedContent: string): Promise<void> {
  if (!translatedContent) {
    return;
  }

  const originalWidth = textNode.width;
  const originalHeight = textNode.height;
  const originalTextAutoResize = textNode.textAutoResize;
  const baselineFontSize = getBaselineFontSize(textNode);
  const minFontSize = 8;
  let minSize = minFontSize;
  let maxSize = Math.max(Math.round(baselineFontSize * 2), 200);
  let bestFitSize = minFontSize;

  const fontsToLoad = collectFontsFromNode(textNode);
  await Promise.all(fontsToLoad.map(font => figma.loadFontAsync(font)));

  const probeNode = textNode.clone();
  probeNode.visible = false;
  probeNode.opacity = 0.01;
  probeNode.characters = translatedContent;

  try {
    configureProbeAutoResize(probeNode, originalTextAutoResize, originalWidth);

    while (minSize <= maxSize) {
      const midSize = Math.floor((minSize + maxSize) / 2);
      setUniformFontSize(probeNode, midSize);
      enforceProbeWidth(probeNode, originalTextAutoResize, originalWidth);

      if (fitsOriginalBounds(probeNode, originalWidth, originalHeight)) {
        bestFitSize = midSize;
        minSize = midSize + 1;
      } else {
        maxSize = midSize - 1;
      }
    }

    textNode.characters = translatedContent;
    setUniformFontSize(textNode, bestFitSize);
    restoreNodeSizing(textNode, originalTextAutoResize, originalWidth, originalHeight);
  } finally {
    probeNode.remove();
  }
}

/**
 * Applies translated text without resizing logic, only ensuring fonts are loaded.
 */
export async function applyTextWithoutAutoResize(textNode: TextNode, translatedContent: string): Promise<void> {
  if (!translatedContent) {
    return;
  }

  const fontsToLoad = collectFontsFromNode(textNode);
  await Promise.all(fontsToLoad.map(font => figma.loadFontAsync(font)));
  textNode.characters = translatedContent;
}

function collectFontsFromNode(textNode: TextNode): FontName[] {
  if (textNode.fontName !== figma.mixed) {
    return [textNode.fontName as FontName];
  }

  if (textNode.characters.length === 0) {
    return [];
  }

  const segments = textNode.getStyledTextSegments(['fontName']);
  const uniqueFonts = new Map<string, FontName>();

  for (const segment of segments) {
    const font = segment.fontName as FontName;
    const key = `${font.family}-${font.style}`;
    if (!uniqueFonts.has(key)) {
      uniqueFonts.set(key, font);
    }
  }

  return Array.from(uniqueFonts.values());
}

function getBaselineFontSize(textNode: TextNode): number {
  if (typeof textNode.fontSize === 'number') {
    return textNode.fontSize;
  }

  const segments = textNode.getStyledTextSegments(['fontSize']);
  for (const segment of segments) {
    if (typeof segment.fontSize === 'number') {
      return segment.fontSize;
    }
  }

  return 16;
}

function setUniformFontSize(node: TextNode, size: number): void {
  if (node.characters.length === 0) {
    return;
  }

  if (typeof node.fontSize === 'number') {
    node.fontSize = size;
  } else {
    node.setRangeFontSize(0, node.characters.length, size);
  }
}

function configureProbeAutoResize(
  probeNode: TextNode,
  originalAutoResize: TextAutoResize,
  originalWidth: number
): void {
  if (originalAutoResize === 'WIDTH_AND_HEIGHT') {
    probeNode.textAutoResize = 'WIDTH_AND_HEIGHT';
    return;
  }

  probeNode.textAutoResize = 'HEIGHT';
  enforceProbeWidth(probeNode, 'HEIGHT', originalWidth);
}

function enforceProbeWidth(
  probeNode: TextNode,
  originalAutoResize: TextAutoResize,
  originalWidth: number
): void {
  if (originalAutoResize === 'WIDTH_AND_HEIGHT') {
    return;
  }

  try {
    const height = probeNode.height || 1;
    probeNode.resize(originalWidth, height);
  } catch (error) {
    console.log(`⚠️ Unable to enforce width on probe node ${probeNode.id}:`, error);
  }
}

function fitsOriginalBounds(
  probeNode: TextNode,
  originalWidth: number,
  originalHeight: number
): boolean {
  const tolerance = 0.5;
  const widthFits = probeNode.width <= originalWidth + tolerance;
  const heightFits = probeNode.height <= originalHeight + tolerance;
  return widthFits && heightFits;
}

function restoreNodeSizing(
  textNode: TextNode,
  originalAutoResize: TextAutoResize,
  originalWidth: number,
  originalHeight: number
): void {
  if (originalAutoResize === 'WIDTH_AND_HEIGHT') {
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
    return;
  }

  if (originalAutoResize === 'HEIGHT') {
    textNode.textAutoResize = 'HEIGHT';
    try {
      textNode.resize(originalWidth, textNode.height);
    } catch (error) {
      console.log(`⚠️ Unable to restore width for node ${textNode.id}:`, error);
    }

    return;
  }

  textNode.textAutoResize = 'NONE';
  try {
    textNode.resize(originalWidth, originalHeight);
  } catch (error) {
    console.log(`⚠️ Unable to restore fixed size for node ${textNode.id}:`, error);
  }
}
