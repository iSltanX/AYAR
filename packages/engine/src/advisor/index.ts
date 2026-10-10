// C-20 the advisor: a self-contained module (docs/waves/README.md 6), pure, Node-free.
export { suggest, parseAdvisorContext, AdvisorInputError, type AdvisorFacts } from './advisor.ts';
export { normalize, APPLIES_EXPECTED, type Effective } from './context.ts';
export { assessRisk, decideDepth } from './risk.ts';
export { RULES, ADVISOR_RULES_VERSION } from './rules.ts';
export { OMIT_RULES } from './omit.ts';
export { explanationText, adviceMarkdown, literal } from './render.ts';
export { advisorFactsFromSnapshot, cardContextFromSnapshot } from './facts.ts';
