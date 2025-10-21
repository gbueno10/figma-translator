// OpenAI API Service
// Handles all interactions with the OpenAI API for translations

/**
 * Translation prompt class that generates messages for the OpenAI API
 */
class DefaultTranslationPrompt {
  getTranslationMessage(texts: { [key: string]: string }, targetLanguage: string): string {
    return `Translate the provided JSON object of UI/marketing copy into ${targetLanguage}. Your output must be the translated JSON object ONLY, with absolutely no extra text, explanations, comments, or markdown formatting.

Adhere strictly to all of the following guidelines:

- **Preserve Intent, Tone, and Brand Voice:**
  - Maintain the original meaning, persuasive tone, and marketing intent as in the source.
  - Use the brand voice: friendly, supportive, modern, and engaging.
  - Do not add, omit, or invent new concepts, benefits, or calls to action.

- **Maintain Formatting & Structure:**
  - Keep the approximate length and ALL original formatting (e.g., line breaks: \\n, lists, bold markers, etc.) exactly as in the source JSON.
  - Preserve JSON keys unchanged.

- **Natural & Idiomatic Language:**
  - Adapt idioms and cultural references to sound natural, idiomatic, and native for the target language. Avoid literal or awkward translations.

- **Consistency:**
  - Use only approved or supplied terminology. Do not introduce synonyms or alternate forms unless specified.

- **Brand Guidelines & Forbidden Terminology:**
  - For **German (DE):** Only use informal "Du" (never "Sie").
  - For **French (FR):**
    - Use only informal "ton" (never "votre"), and always use gender-neutral language.
    - Forbidden terms: never use "dressage" (use "éducation" instead), never use "maîtres" or "dresseurs" (pick modern, neutral terms).
    - Always use accentuated uppercase letters (e.g., "É").
    - Avoid literal/awkward translations (e.g., do NOT use "marche[s]" for "walk[s]").
  - For **French, Spanish, Portuguese, Italian, Swedish (FR, ES, PT, IT, SE):**
    - If the source refers to "cage training," do NOT translate directly. Rephrase to an acceptable alternative such as "creating a safe space" or "den."

- **Output Requirements:**
  - Output ONLY the translated JSON object.
  - No explanations, extra comments, or introductory/concluding text.
  - Do not use markdown formatting or code blocks in any form.

# Steps

1. Review the input JSON object and analyze each string to fully understand meaning, intent, formatting, and tone.

2. Internally (before output), step-by-step:
   - Identify and check for any concepts, words, or phrases requiring brand/forbidden terminology adjustments or cultural adaptation.
   - Ensure maintenance of all formatting, length, and structure matched to the original.
   - Confirm that tone, style, and wording follow the provided brand guidelines and informal/neutral rules for the specific language.
   - For each language-specific guideline (see above), verify that none of the forbidden terms or phrasing are present.

3. If issues are detected in your translation, iteratively refine and check until all requirements are 100% satisfied and output is polished.

4. Produce the translated JSON object as your sole response (do not include any meta-comments, explanations, or markdown).

# Output Format

Your response must be the translated JSON object only. Do not output any markdown formatting, code blocks, explanations, comments, or text before or after the JSON object. Respect all formatting, keys, and line breaks of the source. Only the valid JSON object is allowed as output.

**REMINDER:**
- Rigorously follow Brand Voice and ALL Forbidden Terminology & Language-Specific Rules.
- Your sole output must be the translated JSON object, preserving all formatting and structure, with no markdown, code blocks, explanations, or extra text.

Input JSON to translate:
${JSON.stringify(texts, null, 2)}`;
  }
}

const translationPrompt = new DefaultTranslationPrompt();

/**
 * Translates a collection of texts to a target language using OpenAI API
 * @param texts - Object mapping text IDs to their content
 * @param targetLanguage - Target language for translation
 * @param apiKey - OpenAI API key
 * @returns Promise with translated texts mapped by their original IDs
 */
export async function translateTextsJson(
  texts: { [key: string]: string },
  targetLanguage: string,
  apiKey: string
): Promise<{ [key: string]: string }> {
  const apiStartTime = Date.now();
  console.log(`🚀 [API-${apiStartTime}] Starting JSON translation with GPT-5-mini for ${targetLanguage}...`);
  console.log(`📝 [API-${Date.now() - apiStartTime}ms] Text objects count:`, Object.keys(texts).length);
  console.log(`🌍 [API-${Date.now() - apiStartTime}ms] Target language:`, targetLanguage);

  const inputMessage = translationPrompt.getTranslationMessage(texts, targetLanguage);

  // Log text that will be sent to API
  console.log(`📝 [API-${Date.now() - apiStartTime}ms] Text recognized for translation:`, JSON.stringify(texts, null, 2));

  const requestBody = {
    model: 'gpt-5-mini', // Using the latest GPT-5-mini model
    messages: [
      {
        role: 'user',
        content: inputMessage,
      },
    ],
    response_format: { type: 'json_object' }, // Standard way to force JSON output
  };

  console.log(`📤 [API-${Date.now() - apiStartTime}ms] Preparing request for OpenAI (Chat Completions API)...`);
  console.log(`📤 [API-${Date.now() - apiStartTime}ms] Request body size:`, JSON.stringify(requestBody).length, 'chars');

  try {
    console.log(`🌐 [API-${Date.now() - apiStartTime}ms] Sending request to OpenAI Chat Completions API...`);
    
    // Ensure API key is clean and valid
    const cleanApiKey = apiKey.trim().replace(/[^\x00-\x7F]/g, "");
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanApiKey}`
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

    console.log(`📊 [API-${Date.now() - apiStartTime}ms] Parsing response JSON from Chat Completions API...`);
    const data = await response.json();
    console.log(`✅ [API-${Date.now() - apiStartTime}ms] GPT-5-mini (Chat Completions) returned data.`);

    // Extract translated content from Chat Completions API
    // The content is directly in data.choices[0].message.content
    const translatedContentRaw = data.choices?.[0]?.message?.content;

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
