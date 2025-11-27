// This is the main plugin code that runs in the Figma environment
// It communicates with the UI through messages

// Import modular services
import { handleTranslation } from './handlers/translationHandler';

interface TranslationRequest {
  type: 'translate';
  text: string;
  targetLanguages: string[];
  apiKey: string;
  autoTextResize?: boolean;
  dualAutoTextResize?: boolean;
}

interface LoadSettingsRequest {
  type: 'load-settings';
}

interface SaveSettingsRequest {
  type: 'save-settings';
  apiKey: string;
  targetLanguages: string[];
  autoTextResize?: boolean;
  dualAutoTextResize?: boolean;
}

interface SettingsResponse {
  type: 'settings-loaded';
  apiKey: string;
  targetLanguages: string[];
  autoTextResize: boolean;
  dualAutoTextResize: boolean;
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
      const storedAutoResize = await figma.clientStorage.getAsync('figma-translator-auto-text-resize');
      const storedDualAutoResize = await figma.clientStorage.getAsync('figma-translator-dual-auto-text-resize');
      const autoTextResize = typeof storedAutoResize === 'boolean' ? storedAutoResize : true;
      const dualAutoTextResize = storedDualAutoResize === true;
      
      figma.ui.postMessage({
        type: 'settings-loaded',
        apiKey,
        targetLanguages,
        autoTextResize,
        dualAutoTextResize
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
      if (typeof msg.autoTextResize === 'boolean') {
        await figma.clientStorage.setAsync('figma-translator-auto-text-resize', msg.autoTextResize);
      }
      if (typeof msg.dualAutoTextResize === 'boolean') {
        await figma.clientStorage.setAsync('figma-translator-dual-auto-text-resize', msg.dualAutoTextResize);
      }
      console.log('✅ Settings SAVED to Figma storage');
    } catch (error) {
      console.log('❌ ERROR saving settings:', error);
    }
  }
  
  else if (msg.type === 'translate') {
    const startTime = Date.now();
    console.log(`🚀 [${new Date().toISOString()}] Starting translation process...`);
    
    try {
      // Use the modularized translation handler
      await handleTranslation(
        figma.currentPage.selection,
        msg.targetLanguages,
        msg.apiKey,
        startTime,
        {
          autoTextResize: msg.autoTextResize !== false,
          dualAutoTextResize: msg.dualAutoTextResize === true
        }
      );
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Translation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      } as ErrorMessage);
    }
  }
};

// All utility functions and services have been moved to separate modules:
// - services/openaiService.ts - OpenAI API translation logic
// - handlers/translationHandler.ts - Main translation orchestration
// - utils/figmaUtils.ts - Figma-specific utility functions
