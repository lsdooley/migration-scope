import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ApplicationRecord, AWSPath, EstimateResult, PlanningAnswers, ProvenanceInfo } from '../model/types';
import { defaultModelConfig, type ModelConfig } from '../model/modelConfig';
import type { ImportResult } from '../parsers/csvParser';

// All state lives in memory for this POC — no localStorage/sessionStorage,
// no backend. Refreshing the page starts over by design.

export type ViewName =
  | 'applications'
  | 'import'
  | 'profile'
  | 'estimate'
  | 'compare'
  | 'model-config'
  | 'about';

export interface Correction {
  field: string;
  value: unknown;
  reason: string;
  correctedAt: string;
}

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning';
}

export function defaultPlanningAnswers(): PlanningAnswers {
  return {
    path: 'Replatform',
    changeSurface: 'Runtime/platform',
    targetCompletionWeeks: null,
    scopeExclusions: [],
    businessSmeCoverage: 'primary-plus-backup',
    applicationSmeCoverage: 'primary-plus-backup',
    dataOpsSmeCoverage: 'primary-plus-backup',
    deliveryTeamCount: 4,
    deliveryTeamAllocationPct: 75,
    awsFluency: 'assisted',
    testEvidence: 'partial',
    documentationConfidence: 'medium',
    constraints: [],
    externalWaitWeeks: 0,
    smeDetail: [],
  };
}

interface AppState {
  applications: ApplicationRecord[];
  selectedApplicationId: string | null;
  modelConfig: ModelConfig;
  modelConfigDirty: boolean;
  draftAnswersByAppId: Record<string, PlanningAnswers>;
  estimatesByAppId: Record<string, Partial<Record<AWSPath, EstimateResult>>>;
  profileConfirmedByAppId: Record<string, boolean>;
  correctionsByAppId: Record<string, Record<string, Correction>>;
  importLog: ImportResult[];
  syntheticDataLoaded: boolean;
  theme: 'system' | 'light' | 'dark';
  toasts: Toast[];
}

interface AppStateApi extends AppState {
  loadApplications: (apps: ApplicationRecord[], opts?: { synthetic?: boolean }) => void;
  selectApplication: (id: string | null) => void;
  updateDraftAnswers: (appId: string, answers: PlanningAnswers) => void;
  commitEstimate: (appId: string, estimate: EstimateResult) => void;
  confirmProfile: (appId: string) => void;
  addCorrection: (appId: string, field: string, value: unknown, reason: string) => void;
  recordImport: (result: ImportResult) => void;
  setModelConfig: (config: ModelConfig) => void;
  resetModelConfig: () => void;
  setTheme: (theme: AppState['theme']) => void;
  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  selectedApplication: ApplicationRecord | null;
}

const AppStateContext = createContext<AppStateApi | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [modelConfig, setModelConfigState] = useState<ModelConfig>(defaultModelConfig);
  const [modelConfigDirty, setModelConfigDirty] = useState(false);
  const [draftAnswersByAppId, setDraftAnswersByAppId] = useState<Record<string, PlanningAnswers>>({});
  const [estimatesByAppId, setEstimatesByAppId] = useState<Record<string, Partial<Record<AWSPath, EstimateResult>>>>({});
  const [profileConfirmedByAppId, setProfileConfirmedByAppId] = useState<Record<string, boolean>>({});
  const [correctionsByAppId, setCorrectionsByAppId] = useState<Record<string, Record<string, Correction>>>({});
  const [importLog, setImportLog] = useState<ImportResult[]>([]);
  const [syntheticDataLoaded, setSyntheticDataLoaded] = useState(false);
  const [theme, setThemeState] = useState<AppState['theme']>('system');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const loadApplications = useCallback((apps: ApplicationRecord[], opts?: { synthetic?: boolean }) => {
    setApplications((prev) => {
      const byId = new Map(prev.map((a) => [a.applicationId, a]));
      for (const a of apps) byId.set(a.applicationId, a);
      return [...byId.values()];
    });
    if (opts?.synthetic) setSyntheticDataLoaded(true);
  }, []);

  const selectApplication = useCallback((id: string | null) => setSelectedApplicationId(id), []);

  const updateDraftAnswers = useCallback((appId: string, answers: PlanningAnswers) => {
    setDraftAnswersByAppId((prev) => ({ ...prev, [appId]: answers }));
  }, []);

  const commitEstimate = useCallback((appId: string, estimate: EstimateResult) => {
    setEstimatesByAppId((prev) => ({
      ...prev,
      [appId]: { ...prev[appId], [estimate.path]: estimate },
    }));
  }, []);

  const confirmProfile = useCallback((appId: string) => {
    setProfileConfirmedByAppId((prev) => ({ ...prev, [appId]: true }));
  }, []);

  const addCorrection = useCallback((appId: string, field: string, value: unknown, reason: string) => {
    const correctedAt = new Date().toISOString();
    setCorrectionsByAppId((prev) => ({
      ...prev,
      [appId]: { ...prev[appId], [field]: { field, value, reason, correctedAt } },
    }));
    setApplications((prev) =>
      prev.map((a) => {
        if (a.applicationId !== appId) return a;
        const provenance: Record<string, ProvenanceInfo> = {
          ...a.provenance,
          [field]: { source: 'User corrected', timestamp: correctedAt, correction: { reason, correctedAt, previousValue: (a as unknown as Record<string, unknown>)[field] } },
        };
        return { ...a, provenance };
      }),
    );
  }, []);

  const recordImport = useCallback((result: ImportResult) => {
    setImportLog((prev) => [result, ...prev]);
    if (result.accepted.length > 0) loadApplications(result.accepted);
  }, [loadApplications]);

  const setModelConfig = useCallback((config: ModelConfig) => {
    setModelConfigState(config);
    setModelConfigDirty(true);
  }, []);

  const resetModelConfig = useCallback(() => {
    setModelConfigState(defaultModelConfig);
    setModelConfigDirty(false);
  }, []);

  const setTheme = useCallback((t: AppState['theme']) => setThemeState(t), []);

  const pushToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const selectedApplication = useMemo(
    () => applications.find((a) => a.applicationId === selectedApplicationId) ?? null,
    [applications, selectedApplicationId],
  );

  const value: AppStateApi = {
    applications,
    selectedApplicationId,
    modelConfig,
    modelConfigDirty,
    draftAnswersByAppId,
    estimatesByAppId,
    profileConfirmedByAppId,
    correctionsByAppId,
    importLog,
    syntheticDataLoaded,
    theme,
    toasts,
    loadApplications,
    selectApplication,
    updateDraftAnswers,
    commitEstimate,
    confirmProfile,
    addCorrection,
    recordImport,
    setModelConfig,
    resetModelConfig,
    setTheme,
    pushToast,
    dismissToast,
    selectedApplication,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateApi {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
