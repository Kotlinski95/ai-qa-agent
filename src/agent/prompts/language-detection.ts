/**
 * Language detection prompt templates
 */

/**
 * Generate language detection prompt with question text
 * @param questionText - The user's question to analyze
 * @returns Formatted language detection prompt
 */
export function createLanguageDetectionPrompt(questionText: string): string {
  return `You are a language detection expert. Analyze ONLY the text itself, ignoring any context about companies or names.

CRITICAL: Focus on grammar, vocabulary, and sentence structure - NOT on names or company references.

Examples:
- "what is the weather?" = English (English grammar: "what is")
- "what is the best fruit?" = English (English grammar and vocabulary)
- "tell me a joke" = English (English imperative structure)
- "jaka jest pogoda?" = Polish (Polish grammar: "jaka jest")
- "wie ist das wetter?" = German (German structure: "wie ist das")

Text to analyze: "${questionText}"

IMPORTANT: Respond with ONLY ONE WORD - the language name. Do not explain, just state the language.

Language:`;
}
