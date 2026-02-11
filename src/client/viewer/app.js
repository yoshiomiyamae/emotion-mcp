/**
 * @typedef {Object} Expression
 * @property {string} id
 * @property {string} name
 * @property {string} displayName
 * @property {string} filePath
 */

/**
 * @typedef {Object} Config
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

// 初期化
async function init() {
  if (debugMode) {
    document.getElementById("status").classList.add("show");
  }

  // デフォルト表情を読み込み
  await loadDefaultExpression();

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

// デフォルト表情を読み込んで表示
async function loadDefaultExpression() {
  try {
    const res = await fetch("/api/config");
    /** @type {Config} */
    const config = await res.json();

    if (config.defaultExpression) {
      const defaultExpr = config.expressions.find(
        (e) => e.id === config.defaultExpression
      );
      if (defaultExpr) {
        displayExpression(defaultExpr, "instant", 0);
      }
    }
  } catch (error) {
    console.error("Failed to load default expression:", error);
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
    const { expression, transition, duration } = message.data;
    displayExpression(expression, transition, duration);
  }
}

/**
 * 表情を表示
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
function updateStatus(expression, transition) {
  if (!debugMode) return;

  const currentExprEl = document.getElementById("currentExpression");
  const currentTransEl = document.getElementById("currentTransition");

  if (currentExprEl) {
    currentExprEl.textContent = `${expression.name} (${expression.displayName})`;
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
