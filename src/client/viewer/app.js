/**
 * @typedef {Object} Expression
 * @property {string} id
 * @property {string} name
 * @property {string} displayName
 * @property {string} filePath
 */

/**
 * @typedef {Object} Config
 * @property {'2d'|'vrm'} mode
 * @property {string} defaultExpression
 * @property {Expression[]} expressions
 */

/**
 * @typedef {'fade'|'quick-fade'|'slide'|'zoom'|'shake'|'instant'} TransitionType
 */

/** @type {Expression | null} */
let currentExpression = null;

/** @type {WebSocket | null} */
let ws = null;

/** @type {boolean} */
let debugMode = new URLSearchParams(window.location.search).has("debug");

/** @type {'2d'|'vrm'} */
let currentMode = "2d";

/** @type {import("./vrm-renderer.js").VrmRenderer | null} */
let vrmRenderer = null;

// 初期化
async function init() {
  if (debugMode) {
    document.getElementById("status").classList.add("show");
  }

  // 設定を読み込んでモードを判定
  try {
    const res = await fetch("/api/config");
    /** @type {Config} */
    const config = await res.json();
    currentMode = config.mode || "2d";

    if (currentMode === "vrm") {
      await initVrmMode();
    } else {
      await initImageMode(config);
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }

  // WebSocket接続
  connectWebSocket();

  // キーボードショートカット（デバッグ用）
  if (debugMode) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "d") {
        toggleDebug();
      }
    });
  }
}

// VRMモードの初期化
async function initVrmMode() {
  try {
    const { VrmRenderer } = await import("./vrm-renderer.js");

    const container = document.getElementById("viewer-container");
    vrmRenderer = new VrmRenderer();
    vrmRenderer.init(container);

    // VRM設定からモデルを読み込み
    const vrmRes = await fetch("/api/vrm/config");
    const vrmConfig = await vrmRes.json();

    if (vrmConfig.modelFileName) {
      await vrmRenderer.loadModel(`/vrm/${vrmConfig.modelFileName}`);

      // デフォルトプリセットを適用
      if (vrmConfig.defaultPreset) {
        const defaultPreset = vrmConfig.presets.find(
          (p) => p.id === vrmConfig.defaultPreset
        );
        if (defaultPreset) {
          vrmRenderer.applyExpression(defaultPreset, 0);
          updateStatus(defaultPreset, "instant");
        }
      }
    }
  } catch (error) {
    console.error("Failed to init VRM mode:", error);
  }
}

// 2D画像モードの初期化
async function initImageMode(config) {
  if (config.defaultExpression) {
    const defaultExpr = config.expressions.find(
      (e) => e.id === config.defaultExpression
    );
    if (defaultExpr) {
      displayExpression(defaultExpr, "instant", 0);
    }
  }
}

// WebSocket接続
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
    updateConnectionStatus(true);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    updateConnectionStatus(false);
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected");
    updateConnectionStatus(false);

    // 3秒後に再接続を試みる
    setTimeout(() => {
      console.log("Attempting to reconnect...");
      connectWebSocket();
    }, 3000);
  };
}

// メッセージ処理
function handleMessage(message) {
  if (message.type === "expression-change") {
    const data = message.data;

    if (data.mode === "vrm" && vrmRenderer) {
      // VRMモード: ブレンドシェイプを適用
      vrmRenderer.applyExpression(data.preset, data.duration);
      updateStatus(data.preset, data.transition);
    } else if (data.mode === "2d" || !data.mode) {
      // 2Dモード（後方互換: modeフィールドがない場合も2D扱い）
      const expression = data.expression;
      displayExpression(expression, data.transition, data.duration);
    }
  }
}

/**
 * 2D表情を表示
 * @param {Expression} expression
 * @param {TransitionType} transition
 * @param {number} duration
 */
function displayExpression(expression, transition = "fade", duration = 300) {
  const container = document.getElementById("viewer-container");

  // 既存の画像を削除（フェードアウト）
  const existing = container.querySelector(".character-sprite");
  if (existing) {
    existing.classList.remove("visible");
    setTimeout(() => {
      existing.remove();
    }, 300);
  }

  // 新しい画像を作成
  const img = document.createElement("img");
  img.className = `character-sprite transition-${transition}`;
  img.src = `/expressions/${expression.filePath}`;
  img.alt = expression.displayName;

  // トランジション時間を設定
  if (transition === "fade" || transition === "quick-fade") {
    img.style.transition = `opacity ${duration}ms ease-in-out`;
  }

  // 画像読み込み完了後に表示
  img.onload = () => {
    container.appendChild(img);

    // 少し遅延させてからvisibleクラスを追加（トランジション適用のため）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        img.classList.add("visible");
      });
    });

    // アニメーションクラスは一度だけ適用
    if (["slide", "zoom", "shake"].includes(transition)) {
      img.addEventListener(
        "animationend",
        () => {
          img.classList.remove(`transition-${transition}`);
        },
        { once: true }
      );
    }
  };

  img.onerror = () => {
    console.error("Failed to load expression image:", expression.filePath);
  };

  // 現在の表情を更新
  currentExpression = expression;
  updateStatus(expression, transition);
}

// 接続ステータスを更新
function updateConnectionStatus(connected) {
  const indicator = document.getElementById("connectionIndicator");
  const wsStatus = document.getElementById("wsStatus");

  if (connected) {
    indicator.classList.add("connected");
    if (wsStatus) wsStatus.textContent = "connected";
  } else {
    indicator.classList.remove("connected");
    if (wsStatus) wsStatus.textContent = "disconnected";
  }
}

// デバッグステータスを更新
function updateStatus(expressionOrPreset, transition) {
  if (!debugMode) return;

  const currentExprEl = document.getElementById("currentExpression");
  const currentTransEl = document.getElementById("currentTransition");

  if (currentExprEl) {
    const name = expressionOrPreset.name || "unknown";
    const displayName = expressionOrPreset.displayName || name;
    currentExprEl.textContent = `${name} (${displayName})`;
  }
  if (currentTransEl) {
    currentTransEl.textContent = transition;
  }
}

// デバッグ表示の切り替え
function toggleDebug() {
  debugMode = !debugMode;
  const status = document.getElementById("status");
  if (debugMode) {
    status.classList.add("show");
  } else {
    status.classList.remove("show");
  }
}

// 初期化実行
init();
