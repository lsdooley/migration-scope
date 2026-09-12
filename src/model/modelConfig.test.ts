import { describe, expect, it } from 'vitest';
import { defaultModelConfig, validateModelConfig } from './modelConfig';

describe('Model configuration validation', () => {
  it('accepts the shipped POC defaults', () => {
    expect(validateModelConfig(defaultModelConfig)).toEqual([]);
  });

  it('19. rejects weights that do not sum to 1.0', () => {
    const broken = structuredClone(defaultModelConfig);
    broken.businessImpact.weights.criticality = 0.9;
    const errors = validateModelConfig(broken);
    expect(errors.some((e) => e.includes('businessImpact.weights'))).toBe(true);
  });

  it('19. rejects invalid threshold ordering in risk bands', () => {
    const broken = structuredClone(defaultModelConfig);
    broken.risk.bands = [
      { max: 50, band: 'Low' },
      { max: 30, band: 'Moderate' },
      { max: 100, band: 'Critical' },
    ];
    const errors = validateModelConfig(broken);
    expect(errors.some((e) => e.includes('risk.bands'))).toBe(true);
  });

  it('19. rejects a maxQuestionsWithConditional above 15', () => {
    const broken = structuredClone(defaultModelConfig);
    broken.poc.maxQuestionsWithConditional = 16;
    const errors = validateModelConfig(broken);
    expect(errors.some((e) => e.includes('15'))).toBe(true);
  });
});
