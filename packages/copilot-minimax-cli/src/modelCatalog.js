import { MINIMAX_MODELS } from './constants.js';

export function modelsJs() {
  const entries = Object.entries(MINIMAX_MODELS).map(([modelId, metadata]) => {
    const fields = Object.entries(metadata)
      .filter(([fieldName]) => fieldName !== 'name')
      .map(([fieldName, value]) => {
        if (typeof value === 'boolean') {
          return `${fieldName}:${value ? '!0' : '!1'}`;
        }
        return `${fieldName}:${value}`;
      })
      .join(',');
    return `"${modelId}":{name:"${metadata.name}",${fields}}`;
  });

  return `{${entries.join(',')}}`;
}

export function newGetAllModelsFunction() {
  return (
    'async getAllModels(n,r){if(!r&&n)return[];try{' +
    `let a=Object.assign(${modelsJs()},this._knownModels||{});` +
    'return m9(this._name,a)}'
  );
}
