/**
 * Centralized prompt exports for the agent
 */

export { createLanguageDetectionPrompt } from './language-detection';
export { createBusinessClassificationPrompt } from './business-classification';
export { createRedirectPrompt } from './redirect';
export {
  createBusinessAnswerWithWebsitePrompt,
  createBusinessAnswerWithoutWebsitePrompt,
} from './business-answers';
export {
  createStreamingBusinessWithWebsitePrompt,
  createStreamingBusinessWithoutWebsitePrompt,
} from './streaming';
