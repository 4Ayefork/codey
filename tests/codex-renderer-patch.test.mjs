import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const normalizeLineEndings = (source) => source.replace(/\r\n/g, "\n");

async function loadStartupPatchExpression() {
  const source = normalizeLineEndings(await readFile(
    new URL("../backend/src/codex_startup_patch.rs", import.meta.url),
    "utf8",
  ));
  const template = source.match(
    /const STARTUP_PATCH_TEMPLATE: &str = r#"\n([\s\S]*?)\n"#;/,
  )?.[1];
  assert.ok(template);
  return template
    .replaceAll("__DISABLE_PET__", "false")
    .replaceAll("__DISABLE_VOICE__", "false")
    .replaceAll("__FAST_CODEX_STARTUP__", "true");
}

test("an incompatible optional renderer patch never blocks the Codex module response", async () => {
  const Module = process.getBuiltinModule("module");
  const nativeLoad = Module._load;
  const nativeJsExtension = Module._extensions[".js"];
  let installedHandler = null;
  class FakeBrowserWindow {}
  const fakeElectron = {
    BrowserWindow: FakeBrowserWindow,
    protocol: {
      handle(scheme, handler) {
        assert.equal(scheme, "app");
        installedHandler = handler;
      },
    },
  };
  Module._load = function testElectronLoader(request) {
    if (request === "electron") return fakeElectron;
    return Reflect.apply(nativeLoad, this, arguments);
  };

  const nativeConsoleError = console.error;
  const patchErrors = [];
  console.error = (...args) => { patchErrors.push(args); };

  try {
    assert.equal(
      (0, eval)(await loadStartupPatchExpression()),
      "codey-startup-patch-installed-v13",
    );
    const electron = Module._load("electron", undefined, false);
    const upstreamHandler = async () => new Response([
      "useHiddenModels:",
      "availableModels:",
      "includeUltraReasoningEffort",
      "amazonBedrock",
    ].join(" "));
    electron.protocol.handle("app", upstreamHandler);
    assert.equal(typeof installedHandler, "function");

    const response = await installedHandler({
      url: "app://-/assets/app-initial-new-codex-build.js",
    });
    assert.equal(response.ok, true);
    assert.match(await response.text(), /useHiddenModels:/);
    assert.equal(patchErrors.length, 1);
    assert.match(String(patchErrors[0][0]), /incompatible Codex renderer patch/);

    const statsigSource = [
      "function Ftu(e){",
      "let m=async e=>{",
      "let t=await Ueu(e);",
      "try{let client=new Vtu.StatsigClient(c,t.user,config);return client}",
      "catch(error){throw new Jeu(",
      "mb.CODEX_POST_LOGIN_STATSIG_BOOTSTRAP_FAILURE_TYPE_CLIENT_INITIALIZATION_FAILED,",
      "error)}};",
      "return m}",
      "`Statsig: error while bootstrapping post-login client ",
      "CodexStatsigProvider.sync`;",
      "`useStatsigInternalClientFactoryAsync`;`_getInstance`;",
      "function runAsyncStatsigGate(i,n,o){",
      "return i.loadingStatus!==`Ready`&&",
      "i.initializeAsync().catch(n.Log.error).finally(()=>o(!1))}",
    ].join("");
    electron.protocol.handle("app", async () => new Response(statsigSource));
    const statsigResponse = await installedHandler({
      url: "app://-/assets/app-initial-BHB6SClA.js",
    });
    const patchedStatsigSource = await statsigResponse.text();
    assert.match(
      patchedStatsigSource,
      /let t=await Promise\.race\(\[Ueu\(e\),new Promise/,
    );
    assert.match(
      patchedStatsigSource,
      /Codey Statsig bootstrap timeout/,
    );
    assert.doesNotMatch(patchedStatsigSource, /let t=await Ueu\(e\);/);
    assert.match(
      patchedStatsigSource,
      /Promise\.race\(\[i\.initializeAsync\(\),new Promise/,
    );
    assert.match(
      patchedStatsigSource,
      /Codey Statsig async initialization timeout/,
    );
    assert.doesNotMatch(
      patchedStatsigSource,
      /i\.initializeAsync\(\)\.catch/,
    );

    let rejectBootstrap;
    const neverCompletesBootstrap = new Promise((_, reject) => {
      rejectBootstrap = reject;
    });
    const createStatsigSync = Function(
      "Ueu",
      "Vtu",
      "Jeu",
      "mb",
      "c",
      "config",
      `${patchedStatsigSource};return Ftu()`,
    );
    const syncStatsig = createStatsigSync(
      () => neverCompletesBootstrap,
      {
        StatsigClient() {
          assert.fail("StatsigClient must not be constructed after bootstrap timeout");
        },
      },
      class FakeStatsigInitializationError extends Error {},
      {
        CODEX_POST_LOGIN_STATSIG_BOOTSTRAP_FAILURE_TYPE_CLIENT_INITIALIZATION_FAILED:
          "client-initialization-failed",
      },
      {},
      {},
    );
    const unhandledRejections = [];
    const onUnhandledRejection = (reason) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    const timeoutStartedAt = Date.now();
    let releaseAsyncInitialization;
    const neverCompletesAsyncInitialization = new Promise((_, reject) => {
      releaseAsyncInitialization = reject;
    });
    const asyncInitializationErrors = [];
    const asyncGateFinished = [];
    const runAsyncStatsigGate = Function(
      `${patchedStatsigSource};return runAsyncStatsigGate`,
    )();
    const asyncGatePromise = runAsyncStatsigGate(
      {
        loadingStatus: "Loading",
        initializeAsync: () => neverCompletesAsyncInitialization,
      },
      {
        Log: {
          error: (error) => {
            asyncInitializationErrors.push(error);
          },
        },
      },
      (loading) => {
        asyncGateFinished.push(loading);
      },
    );
    try {
      await assert.rejects(syncStatsig("input"), (error) => {
        assert.match(String(error), /Codey Statsig bootstrap timeout/);
        return true;
      });
      await asyncGatePromise;
      const timeoutElapsedMs = Date.now() - timeoutStartedAt;
      assert.ok(timeoutElapsedMs >= 1_400, `timeout fired too early: ${timeoutElapsedMs}ms`);
      assert.ok(timeoutElapsedMs < 3_000, `timeout fired too late: ${timeoutElapsedMs}ms`);
      assert.equal(asyncInitializationErrors.length, 1);
      assert.match(
        String(asyncInitializationErrors[0]),
        /Codey Statsig async initialization timeout/,
      );
      assert.deepEqual(asyncGateFinished, [false]);
      rejectBootstrap(new Error("late bootstrap failure"));
      releaseAsyncInitialization(new Error("late async initialization failure"));
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(unhandledRejections, []);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }

    assert.equal(patchErrors.length, 1);
  } finally {
    console.error = nativeConsoleError;
    Module._load = nativeLoad;
    Module._extensions[".js"] = nativeJsExtension;
  }
});
