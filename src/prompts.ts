// Translation prompts for the Figma Translator Plugin
// This file contains all prompts used for OpenAI API calls

export interface TranslationPrompt {
  getTranslationMessage(texts: { [nodeId: string]: string }, targetLanguage: string): string;
}

export class DefaultTranslationPrompt implements TranslationPrompt {
  getTranslationMessage(texts: { [nodeId: string]: string }, targetLanguage: string): string {
    return `Translate the following JSON object to ${targetLanguage}. Return the translated JSON with the same keys:\n${JSON.stringify(texts, null, 2)}`;
  }
}

// Instância padrão que será usada pelo plugin
export const translationPrompt = new DefaultTranslationPrompt();
