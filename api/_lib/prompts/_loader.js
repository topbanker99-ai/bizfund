import fs from 'node:fs';
import { ACTIVE_PROMPTS } from './_manifest.js';

const promptCache = new Map();

export function readPrompt(key) {
  const fileUrl = ACTIVE_PROMPTS[key];
  if (!fileUrl) {
    throw new Error(`Prompt not found: ${key}`);
  }

  const cacheKey = String(fileUrl);
  if (!promptCache.has(cacheKey)) {
    promptCache.set(cacheKey, stripPromptMeta(fs.readFileSync(fileUrl, 'utf8')).trim());
  }
  return promptCache.get(cacheKey);
}

export function fillTemplate(template, values = {}) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return '';
    return String(values[key] ?? '');
  });
}

function stripPromptMeta(text) {
  return String(text || '').replace(/^\s*<!--[\s\S]*?-->\s*/, '');
}
