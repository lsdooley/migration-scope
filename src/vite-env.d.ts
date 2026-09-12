/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the optional narrative Lambda (backend/narrative-lambda). Unset = AI narrative falls back to templates. */
  readonly VITE_NARRATIVE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
