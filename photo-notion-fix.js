(function () {
  if (typeof state === "undefined") return;

  const $ = selector => document.querySelector(selector);
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const photos = () => state.photos || state.checkins || [];
  const setPhotos = next => {
    if (state.photos) state.photos = next;
    else state.checkins = next;
  };

  const style = document.createElement("style");
  style.textContent = `
    .sync-panel{display:grid;gap:10px}
    .sync-status{font-size:13px;color:var(--muted,#66727a)}
    .photo-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
    .photo-footer button{min-height:32px;padding:5px 9px;font-size:12px}
  `;
  document.head.appendChild(style);

  function safeSave() {
    try {
      if (typeof save === "function") save();
      else localStorage.setItem("gym-progress-v3", JSON.stringify(state));
      return true;
    } catch (error) {
      alert("資料儲存失敗：照片可能太大。這次我已經改成會壓縮照片，請重新選一次照片再試。");
      return false;
    }
  }

  function compressImage(file, maxSize = 1280, quality = 0.72) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve("");
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function savePhoto(photoData) {
    if (!state.photos && !state.checkins) state.photos = [];
    const list = photos();
    const item = {
      id: uid(),
      title: `Day ${String(list.length + 1).padStart(3, "0")}`,
      date: today(),
      weight: $("#cw")?.value || $("#checkinWeight")?.value || "",
      waist: $("#waist")?.value || $("#checkinWaist")?.value || "",
      chest: $("#checkinChest")?.value || "",
      arm: $("#checkinArm")?.value || "",
      angle: $("#angle")?.value || $("#checkinAngle")?.value || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (state.photos) item.img = photoData;
    else item.photo = photoData;
    list.push(item);

    const workout = (state.workouts || []).find(record => record.date === today());
    if (workout) {
      workout.progressImages ||= [];
      workout.progressImages.push(item.id);
      workout.updatedAt = new Date().toISOString();
    }

    if (!safeSave()) {
      list.pop();
      return;
    }

    if ($("#photo")) $("#photo").value = "";
    if ($("#checkinPhoto")) $("#checkinPhoto").value = "";
    renderPhotos();
  }

  function renderPhotos() {
    const container = $("#photos") || $("#photoGrid");
    if (!container) return;
    const list = [...photos()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);
    if (!list.length) {
      container.innerHTML = `<div class="empty">還沒有體態照片。</div>`;
      return;
    }
    container.innerHTML = list.map(item => {
      const image = item.img || item.photo || "";
      return `
        <article class="photo card">
          ${image ? `<img src="${image}" alt="${item.date || ""} 體態照片">` : `<img alt="">`}
          <div>
            <strong>${item.title || ""}</strong>
            <span class="muted">${item.date || ""} · ${item.angle || ""}</span>
            <div class="photo-footer">
              <span>${item.weight ? `${item.weight} kg` : "未填體重"}</span>
              <button class="danger" data-delete-image="${item.id}">刪除</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function ensureSyncPanel() {
    if ($("#notionSyncPanel")) return;
    const parent = $("#backup") || $("#view-data") || $("#view-backup");
    if (!parent) return;
    const panel = document.createElement("section");
    panel.id = "notionSyncPanel";
    panel.className = "panel";
    panel.innerHTML = `
      <div class="panel-head"><h3>Notion 雲端同步</h3></div>
      <div class="panel-body sync-panel">
        <div class="actions">
          <button class="primary" id="syncToNotion">同步到 Notion</button>
          <button id="restoreFromNotion">從 Notion 抓回</button>
        </div>
        <div class="sync-status" id="notionSyncStatus">尚未同步。Notion 先同步訓練資料與體態文字資料，照片會壓縮後留在此瀏覽器。</div>
      </div>
    `;
    parent.appendChild(panel);
    $("#syncToNotion").addEventListener("click", syncToNotion);
    $("#restoreFromNotion").addEventListener("click", restoreFromNotion);
  }

  function syncSecret() {
    let secret = localStorage.getItem("gym-progress-sync-secret") || "";
    if (!secret) {
      secret = prompt("如果你有設定 Netlify 的 SYNC_SECRET，請輸入同步密碼。沒有設定可以直接按確定。") || "";
      localStorage.setItem("gym-progress-sync-secret", secret);
    }
    return secret;
  }

  function payload() {
    return {
      syncedAt: new Date().toISOString(),
      workouts: state.workouts || [],
      entries: state.entries || [],
      exercises: state.exercises || [],
      checkins: photos().map(item => ({
        ...item,
        img: item.img ? "[stored locally]" : undefined,
        photo: item.photo ? "[stored locally]" : undefined
      }))
    };
  }

  function setStatus(text) {
    const status = $("#notionSyncStatus");
    if (status) status.textContent = text;
  }

  async function syncToNotion() {
    setStatus("正在同步到 Notion...");
    try {
      const response = await fetch("/.netlify/functions/notion-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-sync-secret": syncSecret() },
        body: JSON.stringify(payload())
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "sync failed");
      setStatus(`已同步到 Notion：${new Date().toLocaleString("zh-TW")}`);
    } catch (error) {
      setStatus("同步失敗：請確認 Netlify 已設定 NOTION_TOKEN / NOTION_PARENT_PAGE_ID。");
    }
  }

  async function restoreFromNotion() {
    setStatus("正在從 Notion 抓回資料...");
    try {
      const response = await fetch("/.netlify/functions/notion-sync", {
        headers: { "x-sync-secret": syncSecret() }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.data) throw new Error(result.error || "restore failed");
      state.workouts = result.data.workouts || state.workouts || [];
      state.entries = result.data.entries || state.entries || [];
      state.exercises = result.data.exercises || state.exercises || [];
      if (state.photos) state.photos = result.data.checkins || [];
      else state.checkins = result.data.checkins || [];
      safeSave();
      if (typeof render === "function") render();
      renderPhotos();
      setStatus(`已從 Notion 抓回：${new Date().toLocaleString("zh-TW")}`);
    } catch (error) {
      setStatus("抓回失敗：Notion 目前可能還沒有備份，或 Netlify 環境變數還沒設定。");
    }
  }

  document.addEventListener("click", event => {
    const saveButton = event.target.closest("#savePhoto,#saveCheckin");
    if (saveButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const input = $("#photo") || $("#checkinPhoto");
      const file = input?.files?.[0];
      const oldText = saveButton.textContent;
      saveButton.disabled = true;
      saveButton.textContent = "正在儲存...";
      compressImage(file)
        .then(savePhoto)
        .catch(() => alert("圖片處理失敗，請換一張照片再試一次。"))
        .finally(() => {
          saveButton.disabled = false;
          saveButton.textContent = oldText;
        });
      return;
    }

    const deleteId = event.target.dataset.deleteImage;
    if (!deleteId) return;
    if (!confirm("確定要刪除這張圖片嗎？此動作無法復原。")) return;
    const before = photos().length;
    setPhotos(photos().filter(item => item.id !== deleteId));
    (state.workouts || []).forEach(record => {
      record.progressImages = (record.progressImages || []).filter(id => id !== deleteId);
      record.updatedAt = new Date().toISOString();
    });
    if (photos().length === before) {
      alert("刪除圖片失敗，請重新整理後再試一次。");
      return;
    }
    safeSave();
    renderPhotos();
  }, true);

  const originalRender = typeof render === "function" ? render : null;
  if (originalRender) {
    render = function () {
      originalRender();
      ensureSyncPanel();
      renderPhotos();
    };
  }

  ensureSyncPanel();
  renderPhotos();
})();
