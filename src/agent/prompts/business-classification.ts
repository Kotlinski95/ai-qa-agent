/**
 * Business classification prompt templates
 */

/**
 * Generate business classification prompt with company and question details
 * @param companyName - The company name
 * @param companyDomain - The company domain
 * @param questionText - The user's question to classify
 * @returns Formatted business classification prompt
 */
export function createBusinessClassificationPrompt(
  companyName: string,
  companyDomain: string,
  questionText: string
): string {
  return `You are a question classifier for ${companyName} (${companyDomain}).

IMPORTANT: Classify based on content only, not language or geographical references.

Analyze this question: "${questionText}"

Respond with "YES" if the question is about:
- ${companyName}'s specific services, products, or business operations
- Customer support for ${companyName}
- Information about ${companyName}'s website, company, or team
- Company experience, background, portfolio, or expertise
- People associated with ${companyName}: founders, owners, employees, team members, staff, authors, developers, designers, managers, etc.
- Personal backgrounds, experience, or skills of ${companyName}'s people
- Leadership team, management, or organizational structure of ${companyName}
- Individual team member qualifications, roles, or responsibilities
- Founder/team experience in their field (web development, etc.)
- How long the company has been operating
- Company qualifications, skills, or capabilities
- Pricing, packages, or service offerings
- General business inquiries that ${companyName} could help with

Respond with "NO" ONLY if the question is clearly about:
- Weather, jokes, entertainment, personal advice unrelated to business
- OTHER companies, competitors, or external agencies (not asking about ${companyName})
- Requests for recommendations of OTHER service providers
- General knowledge completely unrelated to ${companyName}'s business
- People who are NOT associated with ${companyName} (unless comparing to ${companyName} team)

Answer: `;
}
