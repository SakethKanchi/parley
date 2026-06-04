import { FakeSummarizer } from './fake.js';
import { GeminiSummarizer } from './gemini.js';

export function getSummarizer(cfg) {
  switch (cfg.summarizerProvider) {
    case 'fake': return new FakeSummarizer();
    case 'gemini': return new GeminiSummarizer(cfg.summarizerModel);
    default: throw new Error(`Unknown summarizer provider: ${cfg.summarizerProvider}`);
  }
}
