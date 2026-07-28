import React from "react";
import ReactDOM from "react-dom/client";
import "../node_modules/@douyinfe/semi-ui/lib/es/_base/base.css";
import { App } from "./App";
import { previewOfficialModels, previewUpstreamModels } from "./previewModels";
import { previewTraceLogStats } from "./previewTraceLogStats";
import "./styles.css";

// 在 Vite 开发模式下，若未通过 Codey Bridge/Token 访问，自动注入 Mock 接口方便 UI 调试
if (import.meta.env.DEV) {
  if (!window.__codeyInvokeApi) {
    console.log("[Dev Mode] Auto-injecting Codey Mock API");
    const previewParams = new URLSearchParams(window.location.search);
    const previewClientPlatform =
      previewParams.get("platform") === "windows"
        ? "windows"
        : "macos";
    const previewStartupError = previewParams.get("startup") === "error";
    let previewConfig = {
      activeProfileId: "primary",
      profiles: [
        {
          id: "primary",
          name: "主力代理 (ChatGPT)",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-proj-....................",
          protocol: "responses" as const,
          ccSwitchProviderId: "primary",
          ccSwitchReadOnly: false,
        },
        {
          id: "backup",
          name: "备用中转 (Claude)",
          baseUrl: "https://api.anthropic.com/v1",
          apiKey: "",
          protocol: "chatCompletions" as const,
          ccSwitchProviderId: "backup",
          ccSwitchReadOnly: false,
        },
      ],
      webhook: {
        enabled: true,
        url: "https://open.feishu.cn/open-apis/bot/v2/hook/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      },
      codexAppPath: "/Applications/ChatGPT.app",
      userScripts: [],
      selectedModelsByProvider: {
        primary: ["provider-fast-coder", "claude-sonnet-4-5"],
      },
      upstreamModelsByProvider: { primary: previewUpstreamModels },
      defaultModelByProvider: {},
      disableTraceLogWrites: true,
      slimCodexPet: true,
      slimCodexVoice: false,
      gpuLaunchMode: "off" as const,
      fastContextTools: false,
      fastCodexStartup: true,
      subagentOptimization: false,
      hideFullAccessWarning: false,
      experimentalFeatures: {
        unifiedExec: false,
        shellSnapshot: false,
        responsesWebsocketsV2: false,
        toolSearchAlwaysDeferMcpTools: false,
        standaloneWebSearch: false,
        enableRequestCompression: true,
        remoteCompactionV2: true,
        applyPatchStreamingEvents: true,
        concurrentReasoningSummaries: true,
      },
    };
    const previewCcSwitch = {
      available: true,
      path: "~/.cc-switch/cc-switch.db",
      changed: false,
      provider: {
        id: "primary",
        name: "主力代理 (ChatGPT)",
        official: false,
        baseUrl: "https://api.openai.com/v1",
        protocol: "responses" as const,
        source: "cc-switch" as const,
      },
    };
    let previewModelState = {
      officialModels: previewOfficialModels
        .filter((model) => previewUpstreamModels.includes(model.slug))
        .map((model) => ({ ...model, supported: true })),
      officialModelIds: previewOfficialModels.map((model) => model.slug),
      thirdPartyModels: ["provider-fast-coder", "claude-sonnet-4-5"],
      upstreamModels: previewUpstreamModels,
      defaultModel: "gpt-5.6-sol",
    };
    let previewTraceStats: typeof previewTraceLogStats | undefined;
    const previewStartupStartedAt = Date.now() - 6_840;
    const previewStartupProgress = {
      status: "success" as const,
      startedAtMs: previewStartupStartedAt,
      finishedAtMs: previewStartupStartedAt + 6_840,
      capturedAtMs: Date.now(),
      elapsedMs: 6_840,
      steps: [
        {
          id: "restore_previous_state",
          label: "恢复上次临时配置",
          status: "success" as const,
          detail: "临时配置状态正常",
          startedAtMs: previewStartupStartedAt,
          finishedAtMs: previewStartupStartedAt + 38,
          durationMs: 38,
        },
        {
          id: "sync_current_provider",
          label: "读取当前线路",
          status: "success" as const,
          detail: "当前线路：主力代理 (ChatGPT)",
          startedAtMs: previewStartupStartedAt + 38,
          finishedAtMs: previewStartupStartedAt + 94,
          durationMs: 56,
        },
        {
          id: "sync_provider_models",
          label: "同步线路模型",
          status: "warning" as const,
          detail: "上游请求超时，已使用默认模型",
          startedAtMs: previewStartupStartedAt + 94,
          finishedAtMs: previewStartupStartedAt + 5_108,
          durationMs: 5_014,
        },
        {
          id: "spawn_codex",
          label: "拉起 Codex",
          status: "success" as const,
          detail: "Codex 进程已创建",
          startedAtMs: previewStartupStartedAt + 5_108,
          finishedAtMs: previewStartupStartedAt + 5_472,
          durationMs: 364,
        },
        {
          id: "inject_cdp_bridge",
          label: "注入 Codey bridge",
          status: "success" as const,
          detail: "设置面板 bridge 已连接",
          startedAtMs: previewStartupStartedAt + 5_472,
          finishedAtMs: previewStartupStartedAt + 6_840,
          durationMs: 1_368,
        },
      ],
    };

    window.__codeyInvokeApi = async (command, args) => {
      console.log(`[Mock API Call] ${command}`, args);
      // Wait a tiny bit to simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (
        previewStartupError &&
        (command === "startup_progress" || command === "load_codey_config")
      ) {
        throw new Error(
          "Codey bridge 请求超时：Windows WebView 初始化阶段长时间没有返回，请检查 codey.log 中最后一个启动步骤",
        );
      }
      if (command === "startup_progress") {
        return previewStartupProgress;
      }
      if (command === "load_codey_config") {
        return {
          config: previewConfig,
          modelState: previewModelState,
          startupError: undefined,
          ccSwitch: previewCcSwitch,
          startupProgress: previewStartupProgress,
        };
      }
      if (command === "runtime_status") {
        return {
          running: true,
          appVersion: "0.2.0",
          clientPlatform: previewClientPlatform,
          restartRequired: false,
          restartInProgress: false,
          activeProfileId: previewConfig.activeProfileId,
          activeProfileName:
            previewConfig.profiles.find(
              (p) => p.id === previewConfig.activeProfileId,
            )?.name || "未命名代理",
          startupProgress: previewStartupProgress,
          codexAppPath: previewConfig.codexAppPath,
          maintenance: {
            sessionStatus: "ready",
            sessionDetail: "会话索引与恢复链路正常 (18 线程活跃)",
            pluginStatus: "ready",
            pluginDetail: "Codex 插件已注入，且会话生命周期托管中",
            performanceStatus: "ready",
            performanceDetail:
              previewClientPlatform === "windows"
                ? "Windows 启动补丁已启用：WMI 周期采样、临时 WebView 残留和执行环境泄漏已修复"
                : "启动补丁已启用：临时 WebView 和执行环境会自动回收",
          },
          experimentalFeatureRuntime: {
            status: "effective",
            detail: "运行态与当前页面配置一致",
            updatedAt: Date.now(),
            configuredFeatures: previewConfig.experimentalFeatures,
            effectiveFeatures: previewConfig.experimentalFeatures,
          },
          injectionScripts: [
            {
              id: "bridge-helpers",
              name: "桥接辅助",
              source: "builtin",
              status: "effective",
              detail: "桥接函数可调用",
            },
            {
              id: "model-whitelist",
              name: "模型白名单",
              source: "builtin",
              status: "effective",
              detail: "模型目录已加载（5 个模型）",
            },
            {
              id: "pet-control-shield",
              name: "宠物控制精简",
              source: "builtin",
              status: "effective",
              detail: "宠物控制精简已启用",
            },
            {
              id: "voice-control-shield",
              name: "语音控制精简",
              source: "builtin",
              status: "effective",
              detail: previewConfig.slimCodexVoice
                ? "语音 UI 与资源拦截已启用"
                : "控制器已就绪，当前精简策略关闭",
            },
            {
              id: "security-warning-shield",
              name: "安全提示控制",
              source: "builtin",
              status: "effective",
              detail: "控制器已就绪，当前屏蔽策略关闭",
            },
            {
              id: "settings-overlay-loader",
              name: "配置面板加载器",
              source: "builtin",
              status: "effective",
              detail: "配置面板按需加载器可用",
            },
            {
              id: "renderer-controls",
              name: "渲染器控制",
              source: "builtin",
              status: "effective",
              detail: "渲染器控制与按需加载 API 可用",
            },
            {
              id: "plugin-marketplace-compatibility",
              name: "插件市场兼容",
              source: "builtin",
              status: "effective",
              detail: "插件市场桥接已接管",
            },
          ],
          ...(previewTraceStats ? { traceLogStats: previewTraceStats } : {}),
        };
      }
      if (command === "refresh_trace_log_stats") {
        previewTraceStats = previewTraceLogStats;
        return { status: "ok", traceLogStats: previewTraceStats };
      }
      if (command === "refresh_injection_status") {
        return { status: "ok" };
      }
      if (command === "save_codey_config") {
        previewConfig = args.config as typeof previewConfig;
        return {
          config: previewConfig,
          modelState: previewModelState,
          ccSwitch: previewCcSwitch,
          restartRequired: false,
        };
      }
      if (command === "sync_current_provider") {
        return {
          config: previewConfig,
          modelState: previewModelState,
          ccSwitch: previewCcSwitch,
          restartRequired: false,
        };
      }
      if (command === "sync_official_experimental_features") {
        return {
          status: "ok",
          experimentalFeatures: previewConfig.experimentalFeatures,
        };
      }
      if (command === "clear_codex_trace_logs") {
        return {
          status: "ok",
          protectionEnabled: previewConfig.disableTraceLogWrites,
          cleanup: {
            databasesFound: 1,
            databasesCleaned: 1,
            rowsDeleted: 30141,
            bytesBefore: 406921216,
            bytesAfter: 49152,
            bytesReclaimed: 406872064,
          },
        };
      }
      if (command === "fetch_current_provider_models") {
        return {
          status: "ok",
          models: previewUpstreamModels,
          modelState: previewModelState,
          restartRequired: false,
        };
      }
      if (command === "save_selected_models") {
        const requested = new Set(args.models as string[]);
        previewModelState = {
          ...previewModelState,
          thirdPartyModels: previewUpstreamModels.filter(
            (model) =>
              requested.has(model) &&
              !previewOfficialModels.some(
                (official) => official.slug === model,
              ),
          ),
        };
        return {
          status: "ok",
          config: previewConfig,
          modelState: previewModelState,
          restartRequired: true,
        };
      }
      if (command === "save_default_model") {
        const model = String(args.model || "");
        previewConfig = {
          ...previewConfig,
          defaultModelByProvider: {
            ...previewConfig.defaultModelByProvider,
            primary: model,
          },
        };
        previewModelState = { ...previewModelState, defaultModel: model };
        return {
          status: "ok",
          config: previewConfig,
          modelState: previewModelState,
          restartRequired: true,
        };
      }
      if (command === "restart_codey") {
        return { status: "restarting" };
      }
      if (command === "check_for_updates") {
        return {
          currentVersion: "0.1.0",
          latestVersion: "0.2.0",
          updateAvailable: true,
          selectedAsset: {
            platform: "macos",
            arch: "arm64",
            packageType: "app-zip",
            fileName: "Codey-0.2.0-macos-arm64-unsigned.zip",
            url: "https://updates.example.com/releases/v0.2.0/Codey-0.2.0-macos-arm64-unsigned.zip",
            sha256:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            size: 31_911_421,
          },
        };
      }
      if (command === "download_update") {
        return {
          latestVersion: "0.2.0",
          filePath: "/tmp/codey-updates/Codey-0.2.0-macos-arm64-unsigned.zip",
          fileName: "Codey-0.2.0-macos-arm64-unsigned.zip",
          size: 31_911_421,
          sha256:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          asset: {
            platform: "macos",
            arch: "arm64",
            packageType: "app-zip",
            fileName: "Codey-0.2.0-macos-arm64-unsigned.zip",
            url: "https://updates.example.com/releases/v0.2.0/Codey-0.2.0-macos-arm64-unsigned.zip",
            sha256:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            size: 31_911_421,
          },
        };
      }
      if (command === "install_downloaded_update") {
        return { status: "installing" };
      }
      if (command === "test_webhook") {
        return { status: 200 };
      }
      return { status: "ok" };
    };
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
