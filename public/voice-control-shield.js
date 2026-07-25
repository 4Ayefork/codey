(() => {
  window.__codeyVoiceControlShieldCleanup?.();

  const enabled = "__CODEY_SLIM_VOICE__" === "true";
  const voiceControlIds = new Set([
    "codex.command.composer.startDictation",
    "codex.command.composer.startVoiceMode",
    "codex.command.realtimeVoice",
    "codex.commandDescription.composer.startDictation",
    "codex.commandDescription.composer.startVoiceMode",
    "codex.commandDescription.globalDictationHold",
    "codex.commandDescription.globalDictationToggle",
    "codex.commandDescription.realtimeVoice",
    "codex.commandMenuTitle.composer.startDictation",
    "codex.command.globalDictationHold",
    "codex.command.globalDictationToggle",
    "composer.startDictation",
    "composer.startVoiceMode",
    "globalDictationHold",
    "globalDictationToggle",
    "settings.general.globalDictationHotkey",
    "settings.general.globalDictationToggleHotkey",
    "settings.general.globalDictationKeepVisible",
    "settings.general.dictation",
    "settings.nav.voice",
    "settings.section.voice",
    "settings.general.voice",
    "settings.general.realtimeVoice",
    "settings.general.realtimeVoiceHotkey",
    "settings.general.realtimeVoiceScreenContext",
    "realtimeVoice",
  ]);
  const voiceControlIdPrefixes = [
    "codex.command.realtimeVoice.",
    "codex.commandDescription.realtimeVoice.",
    "composer.realtime.",
    "realtimeVoice.",
    "settings.general.globalDictationHotkey.",
    "settings.general.globalDictationToggleHotkey.",
    "settings.general.globalDictation.",
    "settings.general.globalDictationHistory.",
    "settings.general.dictationDictionary.",
    "settings.general.realtimeVoice.",
    "settings.general.realtimeVoiceHotkey.",
    "settings.general.realtimeVoiceScreenContext.",
    "composer.dictation.",
    "settings.voice.",
  ];
  const gptVoicePromotionIdPrefixes = ["realtimeVoice.homeAnnouncement."];
  const fallbackLabelPattern = /^(?:try (?:chatgpt|codex) voice|voice|voice chat|voice chat hotkey|voice mode|start (?:new )?voice(?: chat| mode)?|stop voice chat|end voice chat|cancel voice chat|open the voice (?:chat )?control window|start or stop voice (?:chat|mode)|mute (?:your microphone|voice chat)|unmute (?:your microphone|voice chat)|dictate|dictation|start dictation|click to dictate or hold|hold(?:-| )to(?:-| )dictate|toggle dictation|global dictation|体验\s*(?:chatgpt|codex)?\s*语音|试试\s*(?:chatgpt|codex)?\s*语音|语音|语音聊天|开始语音(?:聊天|模式)?|停止语音聊天|结束语音聊天|打开语音控制窗口|听写|开始听写|全局听写|按住听写|切换听写|體驗\s*(?:chatgpt|codex)?\s*語音|試試\s*(?:chatgpt|codex)?\s*語音|語音|語音聊天|開始語音(?:聊天|模式)?|停止語音聊天|結束語音聊天|開啟語音控制視窗|聽寫|開始聽寫|全域聽寫)(?:\s*[(:（].*)?$/i;
  const reactInternalKeyPattern = /^__(?:reactProps|reactFiber|reactInternalInstance)\$.*/;
  const dictationRequestPattern = /(?:\/codex\/dictation-stream-connect-info|\/dictation\/stream)(?:[/?#]|$)/i;
  const gptVoicePromotionAssetPattern = /(?:^|\/)[^/?#]*(?:bidi[^/?#]*banner|voice[^/?#]*banner)[^/?#]*\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
  const restoreResourceGuards = [];
  const blockedElementStates = new Map();

  const disabledVoiceError = () => {
    const error = new Error("Codex voice is disabled by Codey");
    error.name = "NotAllowedError";
    return error;
  };

  if (enabled) {
    const mediaDevices = window.navigator?.mediaDevices;
    const nativeGetUserMedia = mediaDevices?.getUserMedia;
    if (typeof nativeGetUserMedia === "function") {
      const guardedGetUserMedia = function guardedGetUserMedia(constraints) {
        if (constraints?.audio) return Promise.reject(disabledVoiceError());
        return Reflect.apply(nativeGetUserMedia, mediaDevices, arguments);
      };
      try {
        mediaDevices.getUserMedia = guardedGetUserMedia;
        restoreResourceGuards.push(() => {
          if (mediaDevices.getUserMedia === guardedGetUserMedia) {
            mediaDevices.getUserMedia = nativeGetUserMedia;
          }
        });
      } catch {}
    }

    const nativeEnumerateDevices = mediaDevices?.enumerateDevices;
    if (typeof nativeEnumerateDevices === "function") {
      const guardedEnumerateDevices = async function guardedEnumerateDevices() {
        const devices = await Reflect.apply(nativeEnumerateDevices, mediaDevices, arguments);
        return Array.from(devices ?? []).filter(
          (device) => device?.kind !== "audioinput" && device?.kind !== "audiooutput",
        );
      };
      try {
        mediaDevices.enumerateDevices = guardedEnumerateDevices;
        restoreResourceGuards.push(() => {
          if (mediaDevices.enumerateDevices === guardedEnumerateDevices) {
            mediaDevices.enumerateDevices = nativeEnumerateDevices;
          }
        });
      } catch {}
    }

    const nativeFetch = window.fetch;
    if (typeof nativeFetch === "function") {
      const guardedFetch = function guardedFetch(input) {
        const url = typeof input === "string" || input instanceof URL
          ? String(input)
          : String(input?.url ?? "");
        if (dictationRequestPattern.test(url)) return Promise.reject(disabledVoiceError());
        return Reflect.apply(nativeFetch, this, arguments);
      };
      window.fetch = guardedFetch;
      restoreResourceGuards.push(() => {
        if (window.fetch === guardedFetch) window.fetch = nativeFetch;
      });
    }

    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket === "function") {
      const GuardedWebSocket = new Proxy(NativeWebSocket, {
        construct(target, argumentsList, newTarget) {
          if (dictationRequestPattern.test(String(argumentsList[0] ?? ""))) {
            throw disabledVoiceError();
          }
          return Reflect.construct(target, argumentsList, newTarget);
        },
      });
      window.WebSocket = GuardedWebSocket;
      restoreResourceGuards.push(() => {
        if (window.WebSocket === GuardedWebSocket) window.WebSocket = NativeWebSocket;
      });
    }
  }

  const isVoiceControlId = (value) =>
    voiceControlIds.has(value) ||
    voiceControlIdPrefixes.some((prefix) => value.startsWith(prefix));

  const containsMatchingValue = (value, predicate, depth = 0, seen = new WeakSet()) => {
    if (typeof value === "string") return predicate(value);
    if (!value || typeof value !== "object" || depth > 7 || seen.has(value)) return false;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (["return", "child", "sibling", "stateNode", "_owner"].includes(key)) continue;
      if (containsMatchingValue(child, predicate, depth + 1, seen)) return true;
    }
    return false;
  };

  const hasMatchingReactValue = (control, predicate) =>
    Object.keys(control)
      .filter((key) => reactInternalKeyPattern.test(key))
      .some((key) => {
        try {
          const internal = control[key];
          return containsMatchingValue(internal?.memoizedProps ?? internal, predicate);
        } catch {
          return false;
        }
      });

  const isVoiceControl = (control) => {
    if (!(control instanceof HTMLElement)) return false;
    const descriptor = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.textContent,
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (fallbackLabelPattern.test(descriptor)) return true;

    return hasMatchingReactValue(control, isVoiceControlId);
  };

  const isGptVoicePromotionControl = (control) =>
    control instanceof HTMLElement
      && hasMatchingReactValue(
        control,
        (value) => gptVoicePromotionIdPrefixes.some((prefix) => value.startsWith(prefix)),
      );

  const controlsWithin = (root, selector) => {
    const controls = [];
    if (root instanceof HTMLElement && root.matches?.(selector)) controls.push(root);
    if (root && typeof root.querySelectorAll === "function") {
      controls.push(...root.querySelectorAll(selector));
    }
    return controls;
  };

  const findGptVoicePromotionRoot = (asset) => {
    let promotion = asset;
    let current = asset?.parentElement;
    for (let depth = 0; current instanceof HTMLElement && depth < 8; depth += 1) {
      if (current === document.body || current === document.documentElement) break;
      const buttons = current.querySelectorAll?.("button, [role=button]") ?? [];
      const editors = current.querySelectorAll?.(
        "input, textarea, [contenteditable]:not([contenteditable=false])",
      ) ?? [];
      const textLength = current.textContent?.replace(/\s+/g, " ").trim().length ?? 0;
      if (buttons.length > 0 && buttons.length <= 4 && editors.length === 0 && textLength <= 1_000) {
        promotion = current;
      } else if (promotion !== asset) {
        break;
      }
      current = current.parentElement;
    }
    return promotion;
  };

  const fullyBlocked = (element) =>
    element.getAttribute("data-codey-voice-control-blocked") === "true"
      && element.getAttribute("aria-hidden") === "true"
      && element.getAttribute("tabindex") === "-1"
      && element.getAttribute("inert") !== null
      && String(element.style.display || "").startsWith("none")
      && (!("disabled" in element) || element.disabled);

  const blockElement = (element) => {
    if (fullyBlocked(element)) return;
    if (!blockedElementStates.has(element)) {
      blockedElementStates.set(element, {
        attributes: new Map(
          ["data-codey-voice-control-blocked", "aria-hidden", "tabindex", "inert"]
            .map((name) => [name, element.getAttribute(name)]),
        ),
        disabled: "disabled" in element ? element.disabled : undefined,
        display: element.style.getPropertyValue?.("display") ?? element.style.display ?? "",
        displayPriority: element.style.getPropertyPriority?.("display") ?? "",
      });
    }
    element.setAttribute("data-codey-voice-control-blocked", "true");
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("tabindex", "-1");
    element.setAttribute("inert", "");
    element.style.setProperty("display", "none", "important");
    if ("disabled" in element && !element.disabled) element.disabled = true;
  };

  const block = (root = document) => {
    if (!enabled) return 0;
    const blockedElements = new Set();
    controlsWithin(
      root,
      "button, [role=button], [role=menuitem], [role=option], [role=switch], input, label",
    ).forEach((control) => {
      if (!isVoiceControl(control)) return;
      const target = isGptVoicePromotionControl(control)
        ? findGptVoicePromotionRoot(control)
        : control;
      blockElement(target);
      blockedElements.add(target);
    });
    controlsWithin(root, "img").forEach((asset) => {
      if (!gptVoicePromotionAssetPattern.test(String(asset.getAttribute("src") ?? ""))) return;
      const promotion = findGptVoicePromotionRoot(asset);
      blockElement(promotion);
      blockedElements.add(promotion);
    });
    return blockedElements.size;
  };

  const restoreBlockedElements = () => {
    blockedElementStates.forEach((state, element) => {
      state.attributes.forEach((value, name) => {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      });
      element.style.removeProperty?.("display");
      if (state.display) {
        element.style.setProperty("display", state.display, state.displayPriority);
      }
      if (state.disabled !== undefined) element.disabled = state.disabled;
    });
    blockedElementStates.clear();
  };

  if (!enabled) {
    window.__codeyBlockNativeVoiceControls = () => 0;
    window.__codeyVoiceControlShield = Object.freeze({
      enabled,
      block: () => 0,
      isVoiceControl,
      resourceGuardsInstalled: 0,
    });
    window.__codeyVoiceControlShieldCleanup = () => {
      restoreBlockedElements();
      delete window.__codeyBlockNativeVoiceControls;
      delete window.__codeyVoiceControlShield;
      delete window.__codeyVoiceControlShieldCleanup;
    };
    return;
  }

  const stopVoiceControlEvent = (event) => {
    const control = event.target instanceof Element
      ? event.target.closest(
          "button, [role=button], [role=menuitem], [role=option], [role=switch], input, label",
        )
      : null;
    if (!isVoiceControl(control)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const eventNames = ["pointerdown", "click", "keydown"];
  eventNames.forEach((eventName) => {
    document.addEventListener(eventName, stopVoiceControlEvent, true);
  });
  window.__codeyBlockNativeVoiceControls = block;
  window.__codeyVoiceControlShield = Object.freeze({
    enabled,
    block,
    isVoiceControl,
    resourceGuardsInstalled: restoreResourceGuards.length,
  });
  window.__codeyVoiceControlShieldCleanup = () => {
    eventNames.forEach((eventName) => {
      document.removeEventListener(eventName, stopVoiceControlEvent, true);
    });
    restoreResourceGuards.splice(0).reverse().forEach((restore) => restore());
    restoreBlockedElements();
    delete window.__codeyBlockNativeVoiceControls;
    delete window.__codeyVoiceControlShield;
    delete window.__codeyVoiceControlShieldCleanup;
  };
  block();
})();
