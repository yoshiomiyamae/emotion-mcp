// 型定義（JSDoc用）
/**
 * @typedef {Object} Expression
 * @property {string} id
 * @property {string} name
 * @property {string} displayName
 * @property {string} filePath
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Config
 * @property {string} defaultExpression
 * @property {Expression[]} expressions
 */

/** @type {File | null} */
let currentFile = null;

/** @type {Config | null} */
let config = null;

// 初期化
async function init() {
  await loadExpressions();
  setupEventListeners();
}

// 表情一覧読み込み
async function loadExpressions() {
  try {
    const res = await fetch("/api/config");
    config = await res.json();
    renderExpressions();
  } catch (error) {
    console.error("Failed to load expressions:", error);
    alert("表情の読み込みに失敗しました");
  }
}

// 表情カード描画
function renderExpressions() {
  const grid = document.getElementById("expressionsGrid");
  const emptyState = document.getElementById("emptyState");

  if (!config || config.expressions.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.add("show");
    return;
  }

  emptyState.classList.remove("show");
  grid.innerHTML = "";

  config.expressions.forEach((expr) => {
    const card = document.createElement("div");
    card.className = "expression-card";
    if (expr.id === config.defaultExpression) {
      card.classList.add("is-default");
    }

    card.innerHTML = `
      ${
        expr.id === config.defaultExpression
          ? '<div class="default-badge">✨ デフォルト</div>'
          : ""
      }
      <img src="/expressions/${expr.filePath}" alt="${expr.displayName}">
      <div class="expression-info">
        <div class="expression-name">${expr.displayName || expr.name}</div>
        <div class="expression-id">${expr.name}</div>
        <div class="expression-actions">
          ${
            expr.id !== config.defaultExpression
              ? `<button class="btn btn-secondary" onclick="setDefault('${expr.id}')">デフォルトに設定</button>`
              : '<button class="btn btn-secondary" disabled>現在のデフォルト</button>'
          }
          <button class="btn btn-danger" onclick="deleteExpression('${expr.id}')">削除</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// イベントリスナー設定
function setupEventListeners() {
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("fileInput");

  // クリックでファイル選択
  uploadArea.addEventListener("click", () => {
    fileInput.click();
  });

  // ファイル選択
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  });

  // ドラッグ&ドロップ
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("drag-over");
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    const file = e.dataTransfer?.files[0];
    if (file) {
      handleFile(file);
    }
  });

  // アップロードフォーム
  const form = document.getElementById("uploadForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitUpload(form);
  });
}

// ファイル処理
function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください");
    return;
  }

  currentFile = file;

  // プレビュー表示
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById("previewImage");
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // モーダル表示
  document.getElementById("uploadModal").classList.add("show");
}

// アップロード送信
async function submitUpload(form) {
  if (!currentFile) {
    alert("ファイルが選択されていません");
    return;
  }

  const formData = new FormData();
  formData.append("file", currentFile);
  formData.append("name", form.elements.namedItem("name").value);
  formData.append(
    "displayName",
    form.elements.namedItem("displayName").value || form.elements.namedItem("name").value
  );

  try {
    const res = await fetch("/api/expressions", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      closeModal();
      await loadExpressions();
      form.reset();
      document.getElementById("previewImage").removeAttribute("src");
      currentFile = null;

      // 成功メッセージ（オプション）
      showToast("表情を追加しました", "success");
    } else {
      const error = await res.json();
      alert(`アップロードに失敗しました: ${error.error || "不明なエラー"}`);
    }
  } catch (err) {
    console.error("Upload error:", err);
    alert("エラーが発生しました");
  }
}

// デフォルト設定
async function setDefault(id) {
  try {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultExpression: id }),
    });

    if (res.ok) {
      await loadExpressions();
      showToast("デフォルト表情を変更しました", "success");
    } else {
      alert("設定の更新に失敗しました");
    }
  } catch (err) {
    console.error("Set default error:", err);
    alert("エラーが発生しました");
  }
}

// 削除
async function deleteExpression(id) {
  if (!confirm("この表情を削除しますか？この操作は取り消せません。")) {
    return;
  }

  try {
    const res = await fetch(`/api/expressions/${id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      await loadExpressions();
      showToast("表情を削除しました", "success");
    } else {
      alert("削除に失敗しました");
    }
  } catch (err) {
    console.error("Delete error:", err);
    alert("エラーが発生しました");
  }
}

// モーダルを閉じる
function closeModal() {
  document.getElementById("uploadModal").classList.remove("show");
}

// トースト通知（簡易版）
function showToast(message, type = "info") {
  // 既存のトーストがあれば削除
  const existing = document.querySelector(".toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    background: ${type === "success" ? "#4CAF50" : "#2196F3"};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// グローバルに公開（onclick属性用）
window.setDefault = setDefault;
window.deleteExpression = deleteExpression;
window.closeModal = closeModal;

// CSS アニメーション追加
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// 初期化実行
init();
