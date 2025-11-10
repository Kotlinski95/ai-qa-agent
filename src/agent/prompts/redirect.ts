/**
 * Redirect prompt templates for non-business questions
 */

/**
 * Generate redirect prompt based on detected language
 * @param detectedLanguage - The detected language (english, polish, etc.)
 * @param questionText - The user's question
 * @param companyName - The company name
 * @returns Formatted redirect prompt
 */
export function createRedirectPrompt(
  detectedLanguage: string,
  questionText: string,
  companyName: string
): string {
  if (detectedLanguage.includes('english') || detectedLanguage.includes('eng')) {
    return `You are a professional assistant. The user asked in ENGLISH: "${questionText}"

Respond in ENGLISH ONLY. Write a brief, polite redirect explaining that you help with ${companyName}'s services and website. Offer to help with services, support, or site navigation. Invite them to ask business-related questions.

Use English language only - do not use Polish, German, or any other language.`;
  } else if (detectedLanguage.includes('polish') || detectedLanguage.includes('pol')) {
    return `Użytkownik zadał pytanie po POLSKU: "${questionText}"

Odpowiedz po POLSKU. Napisz krótką, grzeczną odpowiedź tłumaczącą, że pomagasz w sprawach związanych z usługami i stroną ${companyName}. Zaproponuj pomoc w sprawach usług, wsparcia czy nawigacji. Zaproś do zadania pytania związanego z biznesem.`;
  } else {
    return `You are a professional assistant. The user asked: "${questionText}"

Respond in the same language as the question. Write a brief, polite redirect explaining that you help with ${companyName}'s services and website.`;
  }
}
