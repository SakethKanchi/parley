import { FakeSummarizer } from './fake.js';
import { GeminiSummarizer } from './gemini.js';
import { OllamaSummarizer } from './ollama.js';
import { OpenAISummarizer } from './openai.js';
import { OpenCodeSummarizer } from './opencode.js';
import { config as envConfig } from '../../config/env.js';

export function getSummarizer(cfg, env = envConfig) {
  switch (cfg.summarizerProvider) {
    case 'fake': return new FakeSummarizer();
    case 'gemini': return new GeminiSummarizer(cfg.summarizerModel, env.gemini.apiKey);
    case 'ollama': return new OllamaSummarizer(cfg.summarizerModel, env.ollama.url);
    case 'openai': return new OpenAISummarizer(cfg.summarizerModel, env.openai.baseUrl, env.openai.apiKey);
    case 'opencode': return new OpenCodeSummarizer(cfg.summarizerModel || 'deepseek-v4-flash', env.opencode.baseUrl, env.opencode.apiKey);
    default: throw new Error(`Unknown summarizer provider: ${cfg.summarizerProvider}`);
  }
}

export const SUPPORTED_PROVIDERS = ['gemini', 'ollama', 'openai', 'opencode'];
