import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const template = readFileSync(
  new URL("../public/pet-control-shield.js", import.meta.url),
  "utf8",
);

class FakeElement {
  constructor(text = "", isControl = true) {
    this.textContent = text;
    this.attributes = new Map();
    this.disabled = false;
    this.isControl = isControl;
    this.style = {
      setProperty: (name, value, priority) => {
        this.style[name] = `${value}:${priority}`;
      },
    };
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  closest() {
    return this.isControl ? this : null;
  }

  contains() {
    return false;
  }

  matches() {
    return true;
  }
}

function loadShield(enabled) {
  const semantic = new FakeElement();
  semantic.__reactProps$test = {
    children: { props: { id: "settings.personalization.pets.openPet" } },
  };
  const localized = new FakeElement("唤醒宠物");
  const unrelated = new FakeElement("打开设置");
  const controls = [semantic, localized, unrelated];
  const listeners = new Map();
  let mutationCallback = null;
  let observerOptions = null;
  let observerDisconnected = false;
  class FakeMutationObserver {
    constructor(callback) {
      mutationCallback = callback;
    }

    observe(_target, options) {
      observerOptions = options;
    }

    disconnect() {
      observerDisconnected = true;
    }
  }
  const documentElement = new FakeElement("", false);
  const document = {
    documentElement,
    querySelectorAll: () => controls,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  };
  const window = {};
  window.window = window;
  const pendingTimers = new Map();
  let nextTimerId = 1;
  let scheduledFlushes = 0;
  window.setTimeout = (callback) => {
    const id = nextTimerId;
    nextTimerId += 1;
    scheduledFlushes += 1;
    pendingTimers.set(id, callback);
    return id;
  };
  window.clearTimeout = (id) => {
    pendingTimers.delete(id);
  };
  const runPendingTimers = () => {
    const callbacks = [...pendingTimers.values()];
    pendingTimers.clear();
    callbacks.forEach((callback) => callback());
  };
  vm.runInNewContext(
    template.replace("__CODEY_SLIM_PET__", enabled ? "true" : "false"),
    {
      document,
      Element: FakeElement,
      HTMLElement: FakeElement,
      MutationObserver: FakeMutationObserver,
      WeakMap,
      window,
    },
  );
  return {
    documentElement,
    get observerDisconnected() {
      return observerDisconnected;
    },
    listeners,
    localized,
    mutationCallback,
    observerOptions,
    get pendingTimerCount() {
      return pendingTimers.size;
    },
    runPendingTimers,
    get scheduledFlushes() {
      return scheduledFlushes;
    },
    semantic,
    unrelated,
    window,
  };
}

test("pet slim mode blocks semantic and localized native pet controls", () => {
  const runtime = loadShield(true);

  assert.equal(runtime.semantic.getAttribute("data-codey-pet-control-blocked"), "true");
  assert.equal(runtime.localized.getAttribute("data-codey-pet-control-blocked"), "true");
  assert.equal(runtime.semantic.disabled, true);
  assert.equal(runtime.semantic.style.display, "none:important");
  assert.equal(runtime.unrelated.getAttribute("data-codey-pet-control-blocked"), null);

  let prevented = false;
  let stopped = false;
  runtime.listeners.get("click")({
    target: runtime.semantic,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
    stopImmediatePropagation: () => {},
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test("disabling pet slim mode restores native pet controls", () => {
  const runtime = loadShield(false);

  assert.equal(runtime.window.__codeyPetControlShield.enabled, false);
  assert.equal(runtime.semantic.getAttribute("data-codey-pet-control-blocked"), null);
  assert.equal(runtime.localized.getAttribute("data-codey-pet-control-blocked"), null);
  assert.equal(runtime.mutationCallback, null);
  assert.equal(runtime.window.__codeyBlockNativePetControls(), 0);
});

test("pet slim mode blocks controls in the insertion observer callback", () => {
  const runtime = loadShield(true);
  const dynamic = new FakeElement("显示宠物");

  runtime.mutationCallback([{
    addedNodes: [dynamic],
    target: runtime.documentElement,
    type: "childList",
  }]);
  runtime.runPendingTimers();

  assert.equal(dynamic.getAttribute("data-codey-pet-control-blocked"), "true");
  assert.equal(dynamic.getAttribute("aria-hidden"), "true");
  assert.equal(dynamic.getAttribute("inert"), "");
  assert.equal(dynamic.style.display, "none:important");
  assert.equal(dynamic.disabled, true);
  assert.equal(runtime.observerOptions.attributes, true);
  assert.deepEqual([...runtime.observerOptions.attributeFilter], ["aria-label", "role", "title"]);
  assert.equal(runtime.observerOptions.childList, true);
  assert.equal(runtime.observerOptions.subtree, true);
});

test("streaming mutation batches coalesce into a single deferred sweep", () => {
  const runtime = loadShield(true);
  const flushesAfterLoad = runtime.scheduledFlushes;
  const dynamics = Array.from({ length: 12 }, (_, index) => new FakeElement(`节点${index}`));

  dynamics.forEach((node) => {
    runtime.mutationCallback([{
      addedNodes: [node],
      target: runtime.documentElement,
      type: "childList",
    }]);
  });

  assert.equal(
    runtime.scheduledFlushes - flushesAfterLoad,
    1,
    "a sustained mutation stream must not schedule one flush per batch",
  );
  assert.equal(runtime.pendingTimerCount, 1);

  runtime.runPendingTimers();
  assert.equal(runtime.pendingTimerCount, 0);
});

test("pet control verdicts are cached until an observed attribute changes", () => {
  const runtime = loadShield(true);
  // Plain label so the cheap text heuristic cannot short-circuit the fiber walk.
  const control = new FakeElement("打开设置");
  let fiberReads = 0;
  let fiberProps = { children: { props: { id: "codex.command.openPetOverlay" } } };
  Object.defineProperty(control, "__reactProps$test", {
    configurable: true,
    enumerable: true,
    get() {
      fiberReads += 1;
      return fiberProps;
    },
  });

  const evaluate = () => runtime.window.__codeyPetControlShield.isPetControl(control);
  assert.equal(evaluate(), true);
  assert.equal(fiberReads, 1);
  evaluate();
  evaluate();
  assert.equal(fiberReads, 1, "repeat verdicts must not re-walk the React fiber");

  fiberProps = {};
  assert.equal(evaluate(), true, "a stale cached verdict is expected until invalidation");

  runtime.mutationCallback([{
    attributeName: "aria-label",
    target: control,
    type: "attributes",
  }]);
  runtime.runPendingTimers();

  assert.equal(evaluate(), false, "an observed attribute change must invalidate the cached verdict");
});

test("pet shield cleanup disconnects the insertion observer", () => {
  const runtime = loadShield(true);

  runtime.window.__codeyPetControlShieldCleanup();

  assert.equal(runtime.observerDisconnected, true);
  assert.equal(runtime.listeners.size, 0);
});
