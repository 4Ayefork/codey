import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("settings panels keep stable handlers and skip unrelated parent renders", async () => {
  const [app, sections, dialogs, trace] = await Promise.all([
    readFile(new URL("src/App.tsx", root), "utf8"),
    readFile(new URL("src/AppSections.tsx", root), "utf8"),
    readFile(new URL("src/AppDialogs.tsx", root), "utf8"),
    readFile(new URL("src/TraceLogModule.tsx", root), "utf8"),
  ]);

  assert.match(app, /function useStableEvent</);
  assert.match(app, /onRepairPluginMarketplace=\{handleRepairPluginMarketplace\}/);
  assert.match(app, /onRefresh=\{handleRefreshTraceLogStats\}/);
  assert.match(app, /onToggleDraftModel=\{handleToggleDraftModel\}/);
  assert.doesNotMatch(
    app,
    /onRepairPluginMarketplace=\{\(\) => void repairPluginMarketplace\(\)\}/,
  );

  for (const component of [
    "OperationsPanel",
    "AppUpdateCard",
    "ModelSection",
    "ExperimentalFeaturesCard",
    "FeaturePolicyCard",
    "WebhookCard",
  ]) {
    assert.match(sections, new RegExp(`export const ${component} = memo\\(`));
  }
  for (const component of [
    "ModelPickerDialog",
    "ConfirmationDialog",
    "CodexAppPathDialog",
  ]) {
    assert.match(dialogs, new RegExp(`export const ${component} = memo\\(`));
  }
  assert.match(trace, /export const TraceLogModule = memo\(/);
});
