import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const template = readFileSync(
  new URL("../public/voice-control-shield.js", import.meta.url),
  "utf8",
);

class FakeElement {
  constructor(text = "") {
    this.textContent = text;
    this.attributes = new Map();
    this.disabled = false;
    this.parentElement = null;
    this.style = {
      getPropertyPriority: (name) => {
        const value = String(this.style[name] ?? "");
        return value.endsWith(":important") ? "important" : "";
      },
      getPropertyValue: (name) => String(this.style[name] ?? "").replace(/:important$/, ""),
      removeProperty: (name) => {
        delete this.style[name];
      },
      setProperty: (name, value, priority) => {
        this.style[name] = priority ? `${value}:${priority}` : value;
      },
    };
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  closest() {
    return this;
  }

  querySelectorAll() {
    return [];
  }
}

function loadShield(enabled) {
  const semantic = new FakeElement();
  semantic.__reactProps$test = {
    children: { props: { id: "codex.command.composer.startDictation" } },
  };
  const settings = new FakeElement();
  settings.__reactFiber$test = {
    memoizedProps: { id: "settings.general.globalDictationHotkey.label" },
  };
  const localized = new FakeElement("开始听写");
  const localizedNewVoiceChat = new FakeElement();
  localizedNewVoiceChat.setAttribute("aria-label", "开始新的语音聊天");
  const localizedTraditionalNewVoiceChat = new FakeElement();
  localizedTraditionalNewVoiceChat.setAttribute("aria-label", "開始新的語音聊天");
  const gptVoiceComposer = new FakeElement();
  gptVoiceComposer.__reactProps$test = {
    children: { props: { id: "composer.realtime.start" } },
  };
  const gptVoiceIcon = new FakeElement();
  gptVoiceIcon.matches = () => true;
  gptVoiceIcon.__reactFiber$test = {
    memoizedProps: { className: "composer-icon-button" },
    return: {
      memoizedProps: {
        tooltipContent: { props: { id: "composer.realtime.start" } },
      },
      return: null,
    },
  };
  const gptVoiceSettings = new FakeElement();
  gptVoiceSettings.__reactFiber$test = {
    memoizedProps: { id: "settings.general.realtimeVoiceHotkey.label" },
  };
  const gptVoiceBannerAction = new FakeElement("Start Voice");
  gptVoiceBannerAction.__reactProps$test = {
    children: { props: { id: "realtimeVoice.homeAnnouncement.action" } },
  };
  const gptVoiceBannerDismiss = new FakeElement();
  const gptVoicePromotion = new FakeElement(
    "Try ChatGPT Voice Coordinate tasks, connect tools, and explore ideas Start Voice",
  );
  gptVoicePromotion.querySelectorAll = (selector) =>
    selector.includes("button") ? [gptVoiceBannerAction, gptVoiceBannerDismiss] : [];
  const gptVoicePromotionVisual = new FakeElement();
  gptVoicePromotionVisual.parentElement = gptVoicePromotion;
  gptVoiceBannerAction.parentElement = gptVoicePromotion;
  gptVoiceBannerDismiss.parentElement = gptVoicePromotion;
  const gptVoicePromotionAsset = new FakeElement();
  gptVoicePromotionAsset.setAttribute(
    "src",
    "https://persistent.oaistatic.com/voice/bidi-homepage-banner-orb.21107572.webp",
  );
  gptVoicePromotionAsset.parentElement = gptVoicePromotionVisual;
  const unrelated = new FakeElement("打开设置");
  const unrelatedIcon = new FakeElement();
  unrelatedIcon.__reactFiber$test = {
    memoizedProps: { className: "composer-icon-button" },
    return: {
      memoizedProps: {
        children: { props: { id: "composer.realtime.start" } },
      },
      return: null,
    },
  };
  const controls = [
    semantic,
    settings,
    localized,
    localizedNewVoiceChat,
    localizedTraditionalNewVoiceChat,
    gptVoiceComposer,
    gptVoiceIcon,
    gptVoiceSettings,
    gptVoiceBannerAction,
    gptVoiceBannerDismiss,
    unrelated,
    unrelatedIcon,
  ];
  const listeners = new Map();
  const document = {
    body: null,
    documentElement: null,
    querySelectorAll: (selector) => selector === "img" ? [gptVoicePromotionAsset] : controls,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  };
  const mediaCalls = [];
  const enumerateDeviceCalls = [];
  const fetchCalls = [];
  const webSocketCalls = [];
  const nativeGetUserMedia = (constraints) => {
    mediaCalls.push(constraints);
    return Promise.resolve("native-media");
  };
  const nativeEnumerateDevices = () => {
    enumerateDeviceCalls.push(true);
    return Promise.resolve([
      { deviceId: "microphone", kind: "audioinput" },
      { deviceId: "speakers", kind: "audiooutput" },
      { deviceId: "camera", kind: "videoinput" },
    ]);
  };
  const nativeFetch = (input) => {
    fetchCalls.push(input);
    return Promise.resolve("native-fetch");
  };
  class NativeWebSocket {
    constructor(url) {
      this.url = url;
      webSocketCalls.push(url);
    }
  }
  const rtcPeerConnectionCalls = [];
  class NativeRTCPeerConnection {
    constructor(configuration) {
      rtcPeerConnectionCalls.push(configuration);
    }
  }
  const window = {
    fetch: nativeFetch,
    navigator: {
      mediaDevices: {
        enumerateDevices: nativeEnumerateDevices,
        getUserMedia: nativeGetUserMedia,
      },
    },
    RTCPeerConnection: NativeRTCPeerConnection,
    WebSocket: NativeWebSocket,
  };
  window.window = window;
  vm.runInNewContext(
    template.replace("__CODEY_SLIM_VOICE__", enabled ? "true" : "false"),
    { document, Element: FakeElement, HTMLElement: FakeElement, URL, window },
  );
  return {
    enumerateDeviceCalls,
    fetchCalls,
    gptVoiceBannerAction,
    gptVoiceComposer,
    gptVoiceIcon,
    gptVoicePromotion,
    gptVoiceSettings,
    listeners,
    localized,
    localizedNewVoiceChat,
    localizedTraditionalNewVoiceChat,
    mediaCalls,
    nativeEnumerateDevices,
    nativeFetch,
    nativeGetUserMedia,
    NativeRTCPeerConnection,
    NativeWebSocket,
    rtcPeerConnectionCalls,
    semantic,
    settings,
    unrelated,
    unrelatedIcon,
    webSocketCalls,
    window,
  };
}

test("voice slim mode blocks composer, settings, and localized voice controls", () => {
  const runtime = loadShield(true);

  for (const control of [
    runtime.semantic,
    runtime.settings,
    runtime.localized,
    runtime.localizedNewVoiceChat,
    runtime.localizedTraditionalNewVoiceChat,
    runtime.gptVoiceComposer,
    runtime.gptVoiceIcon,
    runtime.gptVoiceSettings,
    runtime.gptVoicePromotion,
  ]) {
    assert.equal(control.getAttribute("data-codey-voice-control-blocked"), "true");
    assert.equal(control.disabled, true);
    assert.equal(control.style.display, "none:important");
  }
  assert.equal(
    runtime.gptVoiceBannerAction.getAttribute("data-codey-voice-control-blocked"),
    null,
  );
  assert.equal(runtime.unrelated.getAttribute("data-codey-voice-control-blocked"), null);
  assert.equal(runtime.unrelatedIcon.getAttribute("data-codey-voice-control-blocked"), null);

  runtime.gptVoiceIcon.setAttribute("aria-label", "Send");
  runtime.window.__codeyBlockNativeVoiceControls();
  assert.equal(runtime.gptVoiceIcon.getAttribute("data-codey-voice-control-blocked"), null);
  assert.equal(runtime.gptVoiceIcon.getAttribute("aria-hidden"), null);
  assert.equal(runtime.gptVoiceIcon.disabled, false);
  assert.equal(runtime.gptVoiceIcon.style.display, undefined);

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

test("disabling voice slim mode restores native voice controls", () => {
  const runtime = loadShield(false);

  assert.equal(runtime.window.__codeyVoiceControlShield.enabled, false);
  assert.equal(runtime.window.__codeyVoiceControlShield.resourceGuardsInstalled, 0);
  assert.equal(runtime.semantic.getAttribute("data-codey-voice-control-blocked"), null);
  assert.equal(runtime.localized.getAttribute("data-codey-voice-control-blocked"), null);
  assert.equal(runtime.window.__codeyBlockNativeVoiceControls(), 0);
  assert.equal(runtime.window.navigator.mediaDevices.getUserMedia, runtime.nativeGetUserMedia);
  assert.equal(runtime.window.navigator.mediaDevices.enumerateDevices, runtime.nativeEnumerateDevices);
  assert.equal(runtime.window.RTCPeerConnection, runtime.NativeRTCPeerConnection);
  assert.equal(runtime.window.fetch, runtime.nativeFetch);
  assert.equal(runtime.window.WebSocket, runtime.NativeWebSocket);
});

test("voice slim mode prevents GPT Voice before WebRTC while preserving other peer connections", async () => {
  const runtime = loadShield(true);

  await assert.rejects(
    runtime.window.navigator.mediaDevices.getUserMedia({ audio: true }),
    (error) => error?.name === "NotAllowedError",
  );
  assert.deepEqual(runtime.mediaCalls, []);

  assert.equal(
    await runtime.window.navigator.mediaDevices.getUserMedia({ video: true }),
    "native-media",
  );
  assert.deepEqual(runtime.mediaCalls, [{ video: true }]);

  const devices = await runtime.window.navigator.mediaDevices.enumerateDevices();
  assert.equal(devices.map((device) => device.kind).join(","), "videoinput");
  assert.equal(runtime.enumerateDeviceCalls.length, 1);

  await assert.rejects(
    async () => {
      await runtime.window.navigator.mediaDevices.getUserMedia({ audio: true });
      return new runtime.window.RTCPeerConnection({ voice: true });
    },
    (error) => error?.name === "NotAllowedError",
  );
  assert.equal(runtime.rtcPeerConnectionCalls.length, 0);
  assert.ok(
    new runtime.window.RTCPeerConnection({ dataOnly: true })
      instanceof runtime.NativeRTCPeerConnection,
  );
  assert.equal(runtime.rtcPeerConnectionCalls.length, 1);

  await assert.rejects(
    runtime.window.fetch("https://chatgpt.com/backend-api/codex/dictation-stream-connect-info"),
    (error) => error?.name === "NotAllowedError",
  );
  assert.equal(await runtime.window.fetch("https://chatgpt.com/backend-api/models"), "native-fetch");
  assert.deepEqual(runtime.fetchCalls, ["https://chatgpt.com/backend-api/models"]);

  assert.throws(
    () => new runtime.window.WebSocket("wss://chatgpt.com/dictation/stream"),
    (error) => error?.name === "NotAllowedError",
  );
  const socket = new runtime.window.WebSocket("wss://chatgpt.com/other-stream");
  assert.equal(socket.url, "wss://chatgpt.com/other-stream");
  assert.deepEqual(runtime.webSocketCalls, ["wss://chatgpt.com/other-stream"]);
  assert.equal(runtime.window.__codeyVoiceControlShield.resourceGuardsInstalled, 4);

  runtime.window.__codeyVoiceControlShieldCleanup();
  assert.equal(runtime.window.navigator.mediaDevices.getUserMedia, runtime.nativeGetUserMedia);
  assert.equal(runtime.window.navigator.mediaDevices.enumerateDevices, runtime.nativeEnumerateDevices);
  assert.equal(runtime.window.RTCPeerConnection, runtime.NativeRTCPeerConnection);
  assert.equal(runtime.window.fetch, runtime.nativeFetch);
  assert.equal(runtime.window.WebSocket, runtime.NativeWebSocket);
  assert.equal(runtime.semantic.getAttribute("data-codey-voice-control-blocked"), null);
  assert.equal(runtime.semantic.disabled, false);
  assert.equal(runtime.semantic.style.display, undefined);
  assert.equal(runtime.gptVoicePromotion.getAttribute("data-codey-voice-control-blocked"), null);
  assert.equal(runtime.gptVoicePromotion.style.display, undefined);
});
