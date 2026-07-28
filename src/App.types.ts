import type { TraceLogStats } from "./TraceLogModule";

export type Profile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: "responses" | "chatCompletions";
  ccSwitchProviderId?: string;
  ccSwitchReadOnly: boolean;
};

export type ExperimentalFeaturesConfig = {
  unifiedExec: boolean;
  shellSnapshot: boolean;
  responsesWebsocketsV2: boolean;
  toolSearchAlwaysDeferMcpTools: boolean;
  standaloneWebSearch: boolean;
  enableRequestCompression: boolean;
  remoteCompactionV2: boolean;
  applyPatchStreamingEvents: boolean;
  concurrentReasoningSummaries: boolean;
};

export type Config = {
  activeProfileId: string;
  profiles: Profile[];
  webhook: { enabled: boolean; url: string };
  codexAppPath: string;
  userScripts: string[];
  selectedModelsByProvider: Record<string, string[]>;
  upstreamModelsByProvider: Record<string, string[]>;
  defaultModelByProvider: Record<string, string>;
  disableTraceLogWrites: boolean;
  slimCodexPet: boolean;
  slimCodexVoice: boolean;
  gpuLaunchMode: "off" | "disableGpu" | "disableGpuRasterization";
  fastContextTools: boolean;
  fastCodexStartup: boolean;
  subagentOptimization: boolean;
  hideFullAccessWarning: boolean;
  experimentalFeatures: ExperimentalFeaturesConfig;
};

export type OfficialModelState = {
  slug: string;
  displayName: string;
  supported: boolean;
};

export type ModelState = {
  officialModels: OfficialModelState[];
  officialModelIds: string[];
  thirdPartyModels: string[];
  upstreamModels: string[];
  defaultModel: string;
};

export type Maintenance = {
  sessionStatus?: string;
  sessionDetail?: string;
  sessionThreads?: number;
  pluginStatus?: string;
  pluginDetail?: string;
  performanceStatus?: string;
  performanceDetail?: string;
};

export type InjectionScriptStatus = {
  id: string;
  name: string;
  source: "builtin" | "user";
  status: "effective" | "executed" | "failed" | "unknown";
  detail?: string;
  error?: string;
};

export type ExperimentalFeatureRuntimeStatus = {
  status: "effective" | "mismatch" | "unknown" | "error";
  detail?: string;
  updatedAt?: number;
  effectiveFeatures?: ExperimentalFeaturesConfig;
  configuredFeatures?: ExperimentalFeaturesConfig;
  mismatchedFeatures?: string[];
};

export type RuntimeStatus = {
  running: boolean;
  appVersion?: string;
  clientPlatform?: string;
  restartRequired?: boolean;
  restartInProgress?: boolean;
  activeProfileId?: string;
  activeProfileName?: string;
  startupError?: string;
  codexAppPath?: string;
  maintenance?: Maintenance;
  injectionScripts?: InjectionScriptStatus[];
  experimentalFeatureRuntime?: ExperimentalFeatureRuntimeStatus;
  traceLogStats?: TraceLogStats;
  startupProgress?: StartupProgress;
};

export type StartupProgressStatus = "idle" | "running" | "success" | "error";

export type StartupStepStatus = "running" | "success" | "warning" | "error";

export type StartupProgressStep = {
  id: string;
  label: string;
  status: StartupStepStatus;
  detail?: string;
  startedAtMs: number;
  finishedAtMs?: number;
  durationMs?: number;
};

export type StartupProgress = {
  status: StartupProgressStatus;
  startedAtMs: number;
  finishedAtMs?: number;
  capturedAtMs: number;
  elapsedMs: number;
  steps: StartupProgressStep[];
  error?: string;
};

export type StartupLoadingStep = {
  id: string;
  label: string;
  status: "pending" | StartupStepStatus;
  detail?: string;
  startedAtMs?: number;
  finishedAtMs?: number;
  durationMs?: number;
};

export type PluginMarketplaceStatus = {
  status: "ready" | "needs_repair" | "error";
  needsRepair?: boolean;
  officialMarketplace?: boolean;
  officialRegistered?: boolean;
  officialPath?: string | null;
  remoteMarketplace?: boolean;
  remoteRegistered?: boolean;
  remotePath?: string | null;
  localMarketplacePath?: string;
  initializedRemote?: boolean;
  configuredRemote?: boolean;
  configChanged?: boolean;
  message?: string;
};

export type CodexAppDirectorySelection = {
  status: "selected" | "cancelled";
  path?: string;
};

export type CcSwitchStatus = {
  available: boolean;
  path: string;
  changed: boolean;
  message?: string;
  provider: {
    id: string;
    name: string;
    official: boolean;
    baseUrl: string;
    protocol: "responses" | "chatCompletions";
    source: "cc-switch" | "local";
  };
};

export type Notice = { tone: "info" | "success" | "error"; text: string };
export type InlineResult = {
  tone: "idle" | "pending" | "success" | "error";
  text: string;
};

export type Confirmation = {
  action: "clear" | "restart" | "install-update";
  title: string;
  description: string;
  confirmLabel: string;
  run: () => void;
};

export type TraceLogCleanup = {
  databasesFound: number;
  databasesCleaned: number;
  rowsDeleted: number;
  bytesBefore: number;
  bytesAfter: number;
  bytesReclaimed: number;
};

export type UpdateCheck = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  selectedAsset?: UpdateAsset;
};

export type UpdateAsset = {
  platform: string;
  arch: string;
  packageType: string;
  fileName: string;
  url: string;
  sha256: string;
  size: number;
};

export type UpdateDownload = {
  latestVersion: string;
  filePath: string;
  fileName: string;
  size: number;
  sha256: string;
  asset: UpdateAsset;
};

export type AppProps = {
  embedded?: boolean;
  onClose?: () => void;
};
