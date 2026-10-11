// C-20 task cards: the generator (tasks.generate), the result-based sources (DEV-9), the kept cards and their verification.
export { generateCard, cardFromAdvisorItem, cardFromCheck, renderCard, CardSourceError, type CardProjectContext } from './cards.ts';
export { cardFromTestGap, cardFromMutant, cardFromUiState, cardFromMaintenance, cardFromFix, cardFromClaim } from './sources.ts';
export { verifyCard, targetWords, changedTestFiles, killingTestFiles } from './verify.ts';
export { TasksService } from './service.ts';
