import type { ApplicationRecord, EstimateResult } from '../model/types';

// Deterministic template narratives behind a swappable provider interface.
// AI is optional and subordinate: this provider receives only normalized
// facts and calculated outputs, and returns text — it can never change a
// score, formula, or rule. Every narrative is labeled as AI-assisted.

export const NARRATIVE_LABEL = 'AI-assisted explanation — calculations unchanged';

export interface NarrativeProvider {
  executiveExplanation(result: EstimateResult): string;
  technicalTopDriverExplanation(result: EstimateResult): string;
  evidenceImprovementSuggestions(result: EstimateResult): string;
  pathComparisonNarrative(results: EstimateResult[]): string;
  dataQualityAnomalyExplanation(app: ApplicationRecord, result: EstimateResult): string;
}

export class TemplateNarrativeProvider implements NarrativeProvider {
  executiveExplanation(result: EstimateResult): string {
    return (
      `${result.path} is estimated at ${result.expectedEffortWeeks.toFixed(1)} person-weeks ` +
      `(range ${result.optimisticEffortWeeks.toFixed(1)}–${result.conservativeEffortWeeks.toFixed(1)}), ` +
      `with ${result.riskBand.toLowerCase()} delivery exposure and ${result.confidenceBand.toLowerCase()} confidence. ` +
      `This application is currently assessed as ${result.waveSuitability.toLowerCase()} for migration. ` +
      `These are POC planning numbers, not a funding or delivery commitment.`
    );
  }

  technicalTopDriverExplanation(result: EstimateResult): string {
    if (result.topDrivers.length === 0) return 'No single work package dominates this estimate — effort is spread evenly across the core engineering formula.';
    return `The largest contributors to this estimate are: ${result.topDrivers.join('; ')}.`;
  }

  evidenceImprovementSuggestions(result: EstimateResult): string {
    if (result.evidenceImprovementActions.length === 0) return 'No evidence gaps were flagged for this estimate.';
    return `To raise confidence: ${result.evidenceImprovementActions.join(' ')}`;
  }

  pathComparisonNarrative(results: EstimateResult[]): string {
    if (results.length < 2) return 'Select at least two paths to generate a comparison narrative.';
    const cheapest = [...results].sort((a, b) => a.expectedEffortWeeks - b.expectedEffortWeeks)[0];
    const lowestRisk = [...results].sort((a, b) => a.riskExposure - b.riskExposure)[0];
    return (
      `Across ${results.map((r) => r.path).join(', ')}, ${cheapest.path} carries the lowest estimated effort ` +
      `(${cheapest.expectedEffortWeeks.toFixed(1)} pw) and ${lowestRisk.path} carries the lowest risk exposure ` +
      `(${lowestRisk.riskExposure.toFixed(0)}/100). Lower effort does not automatically mean lower risk — review both before choosing a wave.`
    );
  }

  dataQualityAnomalyExplanation(app: ApplicationRecord, result: EstimateResult): string {
    const notes: string[] = [];
    if (app.unknownDependencyIndicator) notes.push('dependency inventory is unknown');
    if (app.conflicts && app.conflicts.length > 0) notes.push(`${app.conflicts.length} unresolved data conflict(s)`);
    if (result.evidenceQuality.freshness < 50) notes.push('CMDB record has not been verified recently');
    if (notes.length === 0) return 'No data-quality anomalies were detected for this application.';
    return `Anomalies flagged for ${app.applicationName}: ${notes.join('; ')}.`;
  }
}

export const narrativeProvider: NarrativeProvider = new TemplateNarrativeProvider();
