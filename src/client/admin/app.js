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
 * @property {'2d'|'vrm'} mode
 * @property {string} defaultExpression
 * @property {Expression[]} expressions
 */

/**
 * @typedef {Object} VrmConfig
 * @property {string} modelFileName
 * @property {Array<{id: string, name: string, displayName: string, blendShapes: Array<{name: string, weight: number}>}>} presets
 * @property {string} defaultPreset
 */

/** @type {File | null} */
let currentFile = null;

/** @type {Config | null} */
let config = null;

/** @type {VrmConfig | null} */
let vrmConfig = null;

/** @type {string[]} */
let availableBlendShapes = [];

/** @type {'2d'|'vrm'} */
let currentMode = "2d";

/** @type {import('../viewer/vrm-renderer.js').VrmRenderer | null} */
let previewRenderer = null;

/** @type {boolean} */
let previewLoading = false;

// 初期化
async function init() {
  await loadConfig();
  setupEventListeners();
}

// 設定読み込み
async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    config = await res.json();
    currentMode = config.mode || "2d";
    updateModeUI();

    if (currentMode === "2d") {
      renderExpressions();
    } else {
      await loadVrmData();
    }
  } catch (error) {
    console.error("Failed to load config:", error);
    alert("設定の読み込みに失敗しました");
  }
}

// モードUIの更新
function updateModeUI() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === currentMode);
  });

  document.getElementById("section2d").style.display =
    currentMode === "2d" ? "block" : "none";
  document.getElementById("sectionVrm").style.display =
    currentMode === "vrm" ? "block" : "none";
}

// モード切り替え
async function switchMode(mode) {
  if (mode === currentMode) return;

  try {
    const res = await fetch("/api/config/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });

    if (res.ok) {
      currentMode = mode;
      config.mode = mode;
      updateModeUI();

      if (mode === "vrm") {
        await loadVrmData();
      } else {
        renderExpressions();
      }

      showToast(`${mode === "vrm" ? "VRM 3D" : "2D 画像"}モードに切り替えました`, "success");
    }
  } catch (err) {
    console.error("Mode switch error:", err);
    alert("モードの切り替えに失敗しました");
  }
}

// VRMデータ読み込み
async function loadVrmData() {
  try {
    const [configRes, blendShapesRes] = await Promise.all([
      fetch("/api/vrm/config"),
      fetch("/api/vrm/blend-shapes"),
    ]);
    vrmConfig = await configRes.json();
    availableBlendShapes = await blendShapesRes.json();

    renderVrmUI();
  } catch (error) {
    console.error("Failed to load VRM data:", error);
  }
}

// VRM UI描画
function renderVrmUI() {
  // アップロードエリアのテキスト更新
  const uploadText = document.getElementById("vrmUploadText");
  if (vrmConfig?.modelFileName) {
    uploadText.textContent = `現在のモデル: ${vrmConfig.modelFileName}（クリックで変更）`;
  }

  // ブレンドシェイプ一覧
  const blendShapeSection = document.getElementById("blendShapeSection");
  const blendShapeList = document.getElementById("blendShapeList");

  if (availableBlendShapes.length > 0) {
    blendShapeSection.style.display = "block";
    blendShapeList.innerHTML = availableBlendShapes
      .map((name) => `<span class="blend-shape-tag">${name}</span>`)
      .join("");
  } else {
    blendShapeSection.style.display = "none";
  }

  // プリセットセクション
  const presetSection = document.getElementById("presetSection");
  if (vrmConfig?.modelFileName) {
    presetSection.style.display = "block";
    renderPresets();
  } else {
    presetSection.style.display = "none";
  }
}

// プリセット一覧描画
function renderPresets() {
  const grid = document.getElementById("presetsGrid");
  const emptyState = document.getElementById("presetEmptyState");

  if (!vrmConfig || vrmConfig.presets.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.add("show");
    return;
  }

  emptyState.classList.remove("show");
  grid.innerHTML = "";

  vrmConfig.presets.forEach((preset) => {
    const card = document.createElement("div");
    card.className = "preset-card";
    if (preset.id === vrmConfig.defaultPreset) {
      card.classList.add("is-default");
    }

    const blendShapeTags = preset.blendShapes
      .filter((bs) => bs.weight > 0)
      .map((bs) => `<span class="preset-blend-tag">${bs.name}: ${bs.weight.toFixed(2)}</span>`)
      .join("");

    card.innerHTML = `
      ${
        preset.id === vrmConfig.defaultPreset
          ? '<div class="default-badge">デフォルト</div>'
          : ""
      }
      <div class="preset-blend-shapes">${blendShapeTags || '<span style="color: #999; font-size: 0.85rem;">ブレンドシェイプ未設定</span>'}</div>
      <div class="expression-info">
        <div class="expression-name">${preset.displayName || preset.name}</div>
        <div class="expression-id">${preset.name}</div>
        <div class="expression-actions">
          <button class="btn btn-secondary" onclick="editPreset('${preset.id}')">編集</button>
          ${
            preset.id !== vrmConfig.defaultPreset
              ? `<button class="btn btn-secondary" onclick="setDefaultPreset('${preset.id}')">デフォルト</button>`
              : ""
          }
          <button class="btn btn-danger" onclick="deletePreset('${preset.id}')">削除</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// 表情カード描画（2Dモード）
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
          ? '<div class="default-badge">デフォルト</div>'
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
  // === 2D画像アップロード ===
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("fileInput");

  uploadArea.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

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
    if (file) handleFile(file);
  });

  const form = document.getElementById("uploadForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitUpload(form);
  });

  // === VRMアップロード ===
  const vrmUploadArea = document.getElementById("vrmUploadArea");
  const vrmFileInput = document.getElementById("vrmFileInput");

  vrmUploadArea.addEventListener("click", () => vrmFileInput.click());

  vrmFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleVrmUpload(file);
  });

  vrmUploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    vrmUploadArea.classList.add("drag-over");
  });

  vrmUploadArea.addEventListener("dragleave", () => {
    vrmUploadArea.classList.remove("drag-over");
  });

  vrmUploadArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    vrmUploadArea.classList.remove("drag-over");
    const file = e.dataTransfer?.files[0];
    if (file) await handleVrmUpload(file);
  });

  // === プリセットフォーム ===
  const presetForm = document.getElementById("presetForm");
  presetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitPreset(presetForm);
  });
}

// 2D画像ファイル処理
function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください");
    return;
  }

  currentFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("previewImage").src = e.target.result;
  };
  reader.readAsDataURL(file);

  document.getElementById("uploadModal").classList.add("show");
}

// VRMファイルアップロード
async function handleVrmUpload(file) {
  if (!file.name.endsWith(".vrm")) {
    alert(".vrm ファイルを選択してください");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/vrm/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      showToast("VRMモデルをアップロードしました", "success");
      await loadVrmData();
    } else {
      const error = await res.json();
      alert(`アップロードに失敗しました: ${error.error || "不明なエラー"}`);
    }
  } catch (err) {
    console.error("VRM upload error:", err);
    alert("エラーが発生しました");
  }
}

// 2Dアップロード送信
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
      await loadConfig();
      form.reset();
      document.getElementById("previewImage").removeAttribute("src");
      currentFile = null;
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

// デフォルト設定（2D）
async function setDefault(id) {
  try {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultExpression: id }),
    });

    if (res.ok) {
      await loadConfig();
      showToast("デフォルト表情を変更しました", "success");
    } else {
      alert("設定の更新に失敗しました");
    }
  } catch (err) {
    console.error("Set default error:", err);
    alert("エラーが発生しました");
  }
}

// 2D表情削除
async function deleteExpression(id) {
  if (!confirm("この表情を削除しますか？")) return;

  try {
    const res = await fetch(`/api/expressions/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadConfig();
      showToast("表情を削除しました", "success");
    } else {
      alert("削除に失敗しました");
    }
  } catch (err) {
    console.error("Delete error:", err);
    alert("エラーが発生しました");
  }
}

// === VRMプリセット管理 ===

// プリセットモーダルを開く
async function openPresetModal(editId = "") {
  const modal = document.getElementById("presetModal");
  const title = document.getElementById("presetModalTitle");
  const form = document.getElementById("presetForm");
  const editIdInput = document.getElementById("presetEditId");

  form.reset();
  editIdInput.value = editId;

  if (editId) {
    title.textContent = "プリセットを編集";
    const preset = vrmConfig?.presets.find((p) => p.id === editId);
    if (preset) {
      document.getElementById("presetName").value = preset.name;
      document.getElementById("presetDisplayName").value = preset.displayName;
    }
  } else {
    title.textContent = "新しいプリセットを作成";
  }

  // スライダーを生成
  renderPresetSliders(editId);

  modal.classList.add("show");

  // VRMプレビューを初期化
  await initVrmPreview(editId);
}

function closePresetModal() {
  document.getElementById("presetModal").classList.remove("show");
  disposeVrmPreview();
}

// プリセットスライダー描画
function renderPresetSliders(editId = "") {
  const container = document.getElementById("presetSliders");
  const preset = editId ? vrmConfig?.presets.find((p) => p.id === editId) : null;

  container.innerHTML = availableBlendShapes
    .map((name) => {
      const existing = preset?.blendShapes.find((bs) => bs.name === name);
      const value = existing ? existing.weight : 0;
      return `
        <div class="slider-row">
          <span class="slider-label">${name}</span>
          <input
            type="range"
            class="slider-input"
            data-blend-shape="${name}"
            min="0" max="1" step="0.01"
            value="${value}"
            oninput="updateSliderValue(this)"
          >
          <span class="slider-value">${value.toFixed(2)}</span>
        </div>
      `;
    })
    .join("");
}

// スライダー値表示更新
function updateSliderValue(slider) {
  const valueSpan = slider.parentElement.querySelector(".slider-value");
  valueSpan.textContent = parseFloat(slider.value).toFixed(2);

  // プレビューにリアルタイム反映
  updateVrmPreviewExpression();
}

// プリセット保存
async function submitPreset(form) {
  const editId = document.getElementById("presetEditId").value;
  const name = document.getElementById("presetName").value;
  const displayName = document.getElementById("presetDisplayName").value;

  // スライダーからブレンドシェイプ値を収集
  const sliders = document.querySelectorAll("#presetSliders .slider-input");
  const blendShapes = [];
  sliders.forEach((slider) => {
    const weight = parseFloat(slider.value);
    if (weight > 0) {
      blendShapes.push({
        name: slider.dataset.blendShape,
        weight,
      });
    }
  });

  const body = { name, displayName: displayName || name, blendShapes };

  try {
    let res;
    if (editId) {
      res = await fetch(`/api/vrm/presets/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch("/api/vrm/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    if (res.ok) {
      closePresetModal();
      await loadVrmData();
      showToast(editId ? "プリセットを更新しました" : "プリセットを作成しました", "success");
    } else {
      alert("保存に失敗しました");
    }
  } catch (err) {
    console.error("Preset save error:", err);
    alert("エラーが発生しました");
  }
}

// プリセット編集
function editPreset(id) {
  openPresetModal(id);
}

// プリセットをデフォルトに設定
async function setDefaultPreset(id) {
  try {
    const res = await fetch("/api/vrm/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultPreset: id }),
    });

    if (res.ok) {
      await loadVrmData();
      showToast("デフォルトプリセットを変更しました", "success");
    }
  } catch (err) {
    console.error("Set default preset error:", err);
    alert("エラーが発生しました");
  }
}

// プリセット削除
async function deletePreset(id) {
  if (!confirm("このプリセットを削除しますか？")) return;

  try {
    const res = await fetch(`/api/vrm/presets/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadVrmData();
      showToast("プリセットを削除しました", "success");
    }
  } catch (err) {
    console.error("Delete preset error:", err);
    alert("エラーが発生しました");
  }
}

// === VRMプレビュー ===

// VRMプレビューを初期化
async function initVrmPreview(editId = "") {
  if (!vrmConfig?.modelFileName || previewLoading) return;

  const container = document.getElementById("vrmPreviewContainer");
  const placeholder = document.getElementById("vrmPreviewPlaceholder");

  // 既存プレビューを破棄
  disposeVrmPreview();

  placeholder.textContent = "読み込み中...";
  previewLoading = true;

  try {
    const { VrmRenderer } = await import("/viewer/vrm-renderer.js");
    previewRenderer = new VrmRenderer();
    previewRenderer.init(container);

    await previewRenderer.loadModel(`/vrm/${vrmConfig.modelFileName}`);
    placeholder.style.display = "none";

    // 編集時: 既存のブレンドシェイプ値を適用
    if (editId) {
      const preset = vrmConfig.presets.find((p) => p.id === editId);
      if (preset) {
        previewRenderer.applyExpression(preset, 0);
      }
    }
  } catch (err) {
    console.error("VRM preview init error:", err);
    placeholder.textContent = "プレビューの読み込みに失敗しました";
  } finally {
    previewLoading = false;
  }
}

// プレビューの表情をスライダーの現在値で更新
function updateVrmPreviewExpression() {
  if (!previewRenderer?.vrm) return;

  const sliders = document.querySelectorAll("#presetSliders .slider-input");
  const blendShapes = [];
  sliders.forEach((slider) => {
    blendShapes.push({
      name: slider.dataset.blendShape,
      weight: parseFloat(slider.value),
    });
  });

  previewRenderer.applyExpression({ blendShapes }, 50);
}

// VRMプレビューを破棄
function disposeVrmPreview() {
  if (previewRenderer) {
    previewRenderer.dispose();
    previewRenderer = null;
  }
  const placeholder = document.getElementById("vrmPreviewPlaceholder");
  if (placeholder) {
    placeholder.style.display = "";
    placeholder.textContent = "VRMプレビュー";
  }
}

// モーダルを閉じる
function closeModal() {
  document.getElementById("uploadModal").classList.remove("show");
}

// トースト通知
function showToast(message, type = "info") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

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
window.switchMode = switchMode;
window.openPresetModal = openPresetModal;
window.closePresetModal = closePresetModal;
window.editPreset = editPreset;
window.setDefaultPreset = setDefaultPreset;
window.deletePreset = deletePreset;
window.updateSliderValue = updateSliderValue;

// CSS アニメーション追加
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

// 初期化実行
init();
