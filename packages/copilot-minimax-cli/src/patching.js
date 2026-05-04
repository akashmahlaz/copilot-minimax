import {
  ANTHROPIC_URL,
  MINIMAX_MODELS,
  MINIMAX_URL,
  OLD_GET_ALL_MODELS_PREFIX,
} from './constants.js';
import { newGetAllModelsFunction } from './modelCatalog.js';

export function patchContent(content) {
  const changes = [];
  let patched = content;

  if (patched.includes(ANTHROPIC_URL)) {
    patched = patched.replaceAll(ANTHROPIC_URL, MINIMAX_URL);
    changes.push(`Redirected ${ANTHROPIC_URL} -> ${MINIMAX_URL}`);
  }

  if (patched.includes('"api.anthropic.com"')) {
    patched = patched.replaceAll('"api.anthropic.com"', '"api.minimax.io/anthropic"');
    changes.push('Fixed bare hostname in telemetry attributes');
  }

  if (patched.includes(OLD_GET_ALL_MODELS_PREFIX)) {
    patched = patched.replace(OLD_GET_ALL_MODELS_PREFIX, newGetAllModelsFunction());
    changes.push(`Replaced model listing with hardcoded: ${Object.keys(MINIMAX_MODELS).join(', ')}`);
  }

  return { content: patched, changes };
}

export function isPatched(content) {
  return content.includes(MINIMAX_URL) && !content.includes(ANTHROPIC_URL);
}
