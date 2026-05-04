export const ANTHROPIC_URL = 'https://api.anthropic.com';
export const MINIMAX_URL = 'https://api.minimax.io/anthropic';
export const BACKUP_SUFFIX = '.copilot-minimax.bak';

export const MINIMAX_MODELS = {
  'MiniMax-M2.7': {
    maxInputTokens: 204800,
    maxOutputTokens: 16384,
    name: 'MiniMax-M2.7',
    toolCalling: true,
    vision: true,
    thinking: true,
  },
  'MiniMax-M2.7-highspeed': {
    maxInputTokens: 204800,
    maxOutputTokens: 16384,
    name: 'MiniMax-M2.7-highspeed',
    toolCalling: true,
    vision: true,
    thinking: true,
  },
  'MiniMax-M2.5': {
    maxInputTokens: 204800,
    maxOutputTokens: 16384,
    name: 'MiniMax-M2.5',
    toolCalling: true,
    vision: true,
    thinking: true,
  },
  'MiniMax-M2.5-highspeed': {
    maxInputTokens: 204800,
    maxOutputTokens: 16384,
    name: 'MiniMax-M2.5-highspeed',
    toolCalling: true,
    vision: true,
    thinking: true,
  },
};

export const OLD_GET_ALL_MODELS_PREFIX =
  'async getAllModels(n,r){if(!r&&n)return[];try{' +
  'let o=await new NS({apiKey:r}).models.list(),a={};' +
  'for(let s of o.data)this._knownModels&&this._knownModels[s.id]?' +
  'a[s.id]=this._knownModels[s.id]:' +
  'a[s.id]={maxInputTokens:1e5,maxOutputTokens:16e3,' +
  'name:s.display_name,toolCalling:!0,vision:!1,thinking:!1};' +
  'return m9(this._name,a)}';
