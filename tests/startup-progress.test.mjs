import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("backend records startup stages and exposes a progress snapshot", async () => {
  const [libSource, commandSource, launcherSource, progressSource] =
    await Promise.all([
      readFile(new URL("backend/src/lib.rs", root), "utf8"),
      readFile(new URL("backend/src/commands.rs", root), "utf8"),
      readFile(new URL("backend/src/launcher.rs", root), "utf8"),
      readFile(new URL("backend/src/startup_progress.rs", root), "utf8"),
    ]);

  assert.match(libSource, /mod startup_progress;/);
  assert.match(libSource, /startup_progress\.begin_session\(\)/);
  assert.match(commandSource, /"startup_progress"\s*=>\s*startup_progress\(state\)/);
  assert.match(
    commandSource,
    /"startupProgress": state\.startup_progress\.snapshot\(\)/,
  );
  assert.match(progressSource, /pub struct StartupProgressSnapshot/);
  assert.match(
    progressSource,
    /append_diagnostic_log\(\s*"codey\.startup_progress"/,
  );

  for (const stepId of [
    "restore_previous_state",
    "sync_current_provider",
    "prepare_runtime",
    "sync_provider_models",
    "resolve_codex_app",
    "spawn_codex",
    "install_startup_patch",
    "inject_cdp_bridge",
    "finalize_runtime",
  ]) {
    assert.ok(
      libSource.includes(`"${stepId}"`) ||
        commandSource.includes(`"${stepId}"`) ||
        launcherSource.includes(`"${stepId}"`),
      `missing startup stage ${stepId}`,
    );
  }
});

test("loading screen renders backend and frontend steps with timeout recovery", async () => {
  const [appSource, loadingSource, typeSource, styleSource, mockSource] =
    await Promise.all([
      readFile(new URL("src/App.tsx", root), "utf8"),
      readFile(new URL("src/StartupLoading.tsx", root), "utf8"),
      readFile(new URL("src/App.types.ts", root), "utf8"),
      readFile(new URL("src/styles.css", root), "utf8"),
      readFile(new URL("src/main.tsx", root), "utf8"),
    ]);

  assert.match(typeSource, /export type StartupProgress =/);
  assert.match(typeSource, /"pending" \| StartupStepStatus/);
  assert.match(appSource, /invoke<StartupProgress>\("startup_progress"\)/);
  assert.match(appSource, /STARTUP_CONFIG_TIMEOUT_MS = 10_000/);
  assert.match(appSource, /STARTUP_RUNTIME_TIMEOUT_MS = 15_000/);
  assert.match(appSource, /startupAttemptRef\.current !== attempt/);
  assert.match(appSource, /<StartupLoading/);
  assert.match(loadingSource, /title="Codex 启动"/);
  assert.match(loadingSource, /title="设置面板"/);
  assert.match(loadingSource, /formatDuration\(durationMs\)/);
  assert.match(loadingSource, /重新检测/);
  assert.match(loadingSource, /进入设置/);
  assert.match(styleSource, /\.startup-step-row\s*\{[\s\S]*min-height: 52px/);
  assert.match(
    styleSource,
    /@media \(max-width: 680px\)[\s\S]*\.startup-loading-shell/,
  );
  assert.match(mockSource, /command === "startup_progress"/);
  assert.match(mockSource, /startupProgress: previewStartupProgress/);
  assert.match(mockSource, /previewStartupError/);
});
