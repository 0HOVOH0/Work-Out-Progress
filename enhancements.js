(function () {
  const ready = () => typeof state !== "undefined" && Array.isArray(state.entries);
  if (!ready()) return;

  let activeExerciseId = "";

  const css = document.createElement("style");
  css.textContent = `
    .pill.pr{color:#0f766e;border-color:#93d8cf;background:#ecfdf9;font-weight:700}
    .pr-panel{display:grid;gap:10px}
    .pr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .pr-item{border:1px solid var(--line,#dce2e4);border-radius:8px;padding:10px;background:#f8faf9}
    .pr-item strong{display:block;font-size:18px}
    .history-record{border:1px solid var(--line,#dce2e4);border-radius:8px;background:white;overflow:hidden}
    .history-record summary{cursor:pointer;list-style:none;padding:12px;display:grid;gap:6px}
    .history-record summary::-webkit-details-marker{display:none}
    .history-detail{border-top:1px solid var(--line,#dce2e4);padding:12px;display:grid;gap:10px;background:#fbfcfb}
    .set-line{color:var(--muted,#66727a);font-size:13px;line-height:1.45}
    .history-toolbar,.photo-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
    .photo-footer button{min-height:32px;padding:5px 9px;font-size:12px}
    @media(max-width:760px){.pr-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(css);

  const q = selector => document.querySelector(selector);
  const n = value => Number(value || 0);
  const todayValue = () => new Date().toISOString().slice(0, 10);
  const entries = () => state.entries || [];
  const workouts = () => state.workouts || [];
  const photos = () => state.photos || state.checkins || [];
  const setPhotos = next => {
    if (state.photos) state.photos = next;
    else state.checkins = next;
  };
  const entryId = entry => entry.id;
  const workoutId = workout => workout.id;
  const entryWorkoutId = entry => entry.wid || entry.workoutId;
  const entryExerciseId = entry => entry.ex || entry.exerciseId;
  const entryDate = entry => entry.date || todayValue();
  const exerciseNameOf = id => {
    if (typeof ename === "function") return ename(id) || "";
    if (typeof exerciseName === "function") return exerciseName(id) || "";
    return (state.exercises || []).find(item => item.id === id)?.name || "";
  };
  const volumeOf = entry => {
    if (typeof volume === "function") return volume(entry);
    if (typeof entryVolume === "function") return entryVolume(entry);
    return [1, 2, 3, 4, 5].reduce((sum, set) => sum + n(entry[`s${set}kg`] ?? entry[`set${set}Weight`]) * n(entry[`s${set}r`] ?? entry[`set${set}Reps`]), 0);
  };

  function normalize() {
    state.workouts ||= [];
    state.entries ||= [];
    if (!state.photos && !state.checkins) state.photos = [];
    workouts().forEach((workout, index) => {
      workout.title ||= workout.name || `Day ${index + 1}`;
      workout.muscleGroup ||= workout.type || "";
      workout.progressImages ||= photos().filter(item => item.date === workout.date).map(item => item.id);
      workout.createdAt ||= workout.date || todayValue();
      workout.updatedAt ||= workout.createdAt;
    });
    entries().forEach(entry => {
      entry.createdAt ||= entryDate(entry);
      entry.updatedAt ||= entry.createdAt;
    });
    photos().forEach((item, index) => {
      item.id ||= Math.random().toString(36).slice(2, 9);
      item.title ||= `Day ${String(index + 1).padStart(3, "0")}`;
      item.createdAt ||= item.date || todayValue();
      item.updatedAt ||= item.createdAt;
    });
    addCardioExercises();
    safeSave();
  }

  function addCardioExercises() {
    state.exercises ||= [];
    [
      ["慢跑", "Cardio", "Outdoor / Treadmill"],
      ["跑步機爬坡", "Cardio", "Treadmill"],
      ["樓梯機", "Cardio", "Machine"]
    ].forEach(([name, muscle, equipment]) => {
      if (!state.exercises.some(item => item.name === name)) {
        state.exercises.push({ id: Math.random().toString(36).slice(2, 9), name, muscle, equipment, note: "" });
      }
    });
  }

  function safeSave() {
    try {
      if (typeof save === "function") save();
    } catch (error) {
      console.warn("Gym Progress save failed", error);
    }
  }

  function entrySets(entry, includeWarmup = false) {
    const sets = [];
    const warmWeight = n(entry.wkg ?? entry.warmWeight);
    const warmReps = n(entry.wr ?? entry.warmReps);
    if (includeWarmup && (warmWeight || warmReps)) {
      sets.push({ label: "Warm-up", setNumber: 0, weight: warmWeight, reps: warmReps, isWarmup: true, isFailure: false, rpe: "", volume: warmWeight * warmReps });
    }
    for (let set = 1; set <= 5; set += 1) {
      const weight = n(entry[`s${set}kg`] ?? entry[`set${set}Weight`]);
      const reps = n(entry[`s${set}r`] ?? entry[`set${set}Reps`]);
      if (!weight && !reps) continue;
      sets.push({ label: `Set ${set}`, setNumber: set, weight, reps, isWarmup: false, isFailure: Boolean(entry.fail ?? entry.isFailure), rpe: entry.rpe || "", volume: weight * reps });
    }
    return sets;
  }

  function entryMetrics(entry) {
    const sets = entrySets(entry);
    const topWeight = sets.reduce((best, set) => set.weight > best.weight ? set : best, { weight: 0, reps: 0, setNumber: 0 });
    const topReps = sets.reduce((best, set) => set.reps > best.reps ? set : best, { weight: 0, reps: 0, setNumber: 0 });
    const topOneRm = sets.reduce((best, set) => {
      const value = set.weight && set.reps ? set.weight * (1 + set.reps / 30) : 0;
      return value > best.value ? { ...set, value } : best;
    }, { value: 0, weight: 0, reps: 0, setNumber: 0 });
    return {
      weight: { value: topWeight.weight, date: entryDate(entry), set: topWeight },
      reps: { value: topReps.reps, date: entryDate(entry), set: topReps },
      oneRm: { value: topOneRm.value, date: entryDate(entry), set: topOneRm },
      volume: { value: volumeOf(entry), date: entryDate(entry), set: { setNumber: sets.length } }
    };
  }

  function exercisePrs(exerciseId, options = {}) {
    return entries()
      .filter(entry => entryExerciseId(entry) === exerciseId)
      .filter(entry => !options.excludeEntryId || entryId(entry) !== options.excludeEntryId)
      .filter(entry => !options.beforeDate || entryDate(entry) < options.beforeDate)
      .reduce((best, entry) => {
        const metrics = entryMetrics(entry);
        Object.keys(best).forEach(key => {
          if (metrics[key].value > best[key].value) best[key] = metrics[key];
        });
        return best;
      }, { weight: { value: 0 }, reps: { value: 0 }, oneRm: { value: 0 }, volume: { value: 0 } });
  }

  function newPrTypes(entry) {
    const exerciseId = entryExerciseId(entry);
    if (!exerciseId) return [];
    const current = entryMetrics(entry);
    const previous = exercisePrs(exerciseId, { excludeEntryId: entryId(entry), beforeDate: entryDate(entry) });
    return [
      current.weight.value && current.weight.value > previous.weight.value ? "重量 PR" : "",
      current.reps.value && current.reps.value > previous.reps.value ? "次數 PR" : "",
      current.oneRm.value && current.oneRm.value > previous.oneRm.value ? "1RM PR" : "",
      current.volume.value && current.volume.value > previous.volume.value ? "容量 PR" : ""
    ].filter(Boolean);
  }

  function format(value) {
    return Number.isInteger(value) ? value : Number(value || 0).toFixed(1);
  }

  function ensurePrPanel() {
    let panel = q("#selectedPrPanel");
    if (panel) return panel;
    const quick = q("#quick") || q("#quickExercises");
    if (!quick) return null;
    panel = document.createElement("div");
    panel.id = "selectedPrPanel";
    panel.className = "pr-panel";
    quick.insertAdjacentElement("afterend", panel);
    return panel;
  }

  function renderSelectedPr() {
    const panel = ensurePrPanel();
    if (!panel) return;
    const currentWorkout = typeof workout === "function" ? workout() : (typeof todayWorkout === "function" ? todayWorkout() : null);
    const fallback = entries().find(entry => entryWorkoutId(entry) === currentWorkout?.id && entryExerciseId(entry));
    const exerciseId = activeExerciseId || entryExerciseId(fallback || {});
    if (!exerciseId) {
      panel.innerHTML = `<div class="empty">選一個動作後，這裡會顯示歷史 PR。</div>`;
      return;
    }
    const exercise = (state.exercises || []).find(item => item.id === exerciseId);
    const prs = exercisePrs(exerciseId);
    const hasPr = Object.values(prs).some(item => item.value);
    if (!hasPr) {
      panel.innerHTML = `<div class="empty">${exercise?.name || "此動作"} 目前尚無歷史 PR。</div>`;
      return;
    }
    const item = (label, pr, suffix) => `<div class="pr-item"><span class="muted">${label}</span><strong>${format(pr.value)}${suffix}</strong><span class="muted">${pr.date || ""}${pr.set?.setNumber ? ` · Set ${pr.set.setNumber}` : ""}${pr.set?.weight || pr.set?.reps ? ` · ${pr.set.weight || 0}kg x ${pr.set.reps || 0}` : ""}</span></div>`;
    panel.innerHTML = `
      <div><strong>${exercise?.name || "選取動作"} 歷史 PR</strong><div class="meta">會隨著今天填入的重量、次數自動更新。</div></div>
      <div class="pr-grid">
        ${item("最大重量", prs.weight, " kg")}
        ${item("最大次數", prs.reps, " reps")}
        ${item("最佳估算 1RM", prs.oneRm, " kg")}
        ${item("最高訓練量", prs.volume, "")}
      </div>
    `;
  }

  function ensureTrainingHistory() {
    let container = q("#trainingHistoryCards");
    if (container) return container;
    const progress = q("#progress") || q("#view-progress");
    if (!progress) return null;
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.innerHTML = `
      <div class="panel-head">
        <h3>歷史訓練紀錄</h3>
        <select id="trainingHistoryLimit"><option value="5">最近 5 次</option><option value="10">最近 10 次</option></select>
      </div>
      <div class="panel-body"><div id="trainingHistoryCards" class="stack"></div></div>
    `;
    progress.appendChild(panel);
    q("#trainingHistoryLimit").addEventListener("change", renderTrainingHistory);
    return q("#trainingHistoryCards");
  }

  function renderTrainingHistory() {
    const container = ensureTrainingHistory();
    if (!container) return;
    const limit = Number(q("#trainingHistoryLimit")?.value || 5);
    const recent = [...workouts()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit);
    if (!recent.length) {
      container.innerHTML = `<div class="empty">目前還沒有訓練紀錄，開始新增第一筆吧！</div>`;
      return;
    }
    container.innerHTML = recent.map(workoutItem => {
      const list = entries().filter(entry => entryWorkoutId(entry) === workoutId(workoutItem)).sort((a, b) => (a.order || 0) - (b.order || 0));
      const filled = list.filter(entry => entryExerciseId(entry) || volumeOf(entry) || entry.distance || entry.minutes || entry.cardioDistance || entry.cardioMinutes);
      const totalVolume = filled.reduce((sum, entry) => sum + volumeOf(entry), 0);
      return `
        <details class="history-record">
          <summary>
            <div class="history-toolbar"><strong>${workoutItem.date || ""}</strong><span class="pill">${filled.length} 動作</span></div>
            <span class="muted">${workoutItem.title || workoutItem.name || workoutItem.date || ""} · ${workoutItem.type || workoutItem.muscleGroup || "未分類"}</span>
            <div class="actions"><span class="pill">Volume ${Math.round(totalVolume)}</span>${filled.some(entry => entry.pr || entry.isPr || newPrTypes(entry).length) ? `<span class="pill good">PR</span>` : ""}${filled.some(entry => entry.fail || entry.isFailure) ? `<span class="pill warn">Failure</span>` : ""}</div>
          </summary>
          <div class="history-detail">${filled.length ? filled.map(historyEntry).join("") : `<div class="empty">這天還沒有填入動作。</div>`}</div>
        </details>
      `;
    }).join("");
  }

  function historyEntry(entry) {
    const sets = entrySets(entry, true);
    const setText = sets.length ? sets.map(set => `${set.label}: ${set.weight || 0}kg x ${set.reps || 0}${set.rpe ? ` · RPE ${set.rpe}` : ""}${set.isWarmup ? " · 熱身組" : ""}${set.isFailure ? " · 力竭" : ""}`).join("<br>") : "尚未填入組數";
    const distance = entry.distance ?? entry.cardioDistance;
    const minutes = entry.minutes ?? entry.cardioMinutes;
    const incline = entry.incline ?? entry.cardioIncline;
    const cardio = distance || minutes ? `<div class="set-line">有氧：${distance || 0} km · ${minutes || 0} min · 坡度 ${incline || 0}%</div>` : "";
    return `
      <article class="card">
        <h4>${exerciseNameOf(entryExerciseId(entry)) || "未選動作"}</h4>
        <div class="actions">${entry.pr || entry.isPr ? `<span class="pill good">PR</span>` : ""}${newPrTypes(entry).length ? `<span class="pill pr">New PR</span>` : ""}${entry.fail || entry.isFailure ? `<span class="pill warn">力竭</span>` : ""}</div>
        <div class="set-line">${setText}</div>${cardio}
      </article>
    `;
  }

  function renderPhotosWithDelete() {
    const container = q("#photos") || q("#photoGrid");
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
            <div class="photo-footer"><span>${item.weight ? `${item.weight} kg` : "未填體重"}</span><button class="danger" data-delete-image="${item.id}">刪除</button></div>
          </div>
        </article>
      `;
    }).join("");
  }

  function markNewPrBadges() {
    document.querySelectorAll(".new-pr-badge").forEach(item => item.remove());
    entries().forEach(entry => {
      if (!newPrTypes(entry).length) return;
      const row = document.querySelector(`[data-id="${entryId(entry)}"],[data-entry="${entryId(entry)}"]`);
      if (!row) return;
      const checkbox = row.querySelector('input[type="checkbox"][data-f="pr"],input[type="checkbox"][data-field="isPr"]');
      if (!checkbox) return;
      checkbox.insertAdjacentHTML("afterend", ` <span class="pill pr new-pr-badge">New PR</span>`);
    });
  }

  function afterRender() {
    renderSelectedPr();
    renderTrainingHistory();
    renderPhotosWithDelete();
    markNewPrBadges();
  }

  normalize();

  const originalRender = typeof render === "function" ? render : null;
  if (originalRender) {
    render = function () {
      originalRender();
      afterRender();
    };
  }

  if (typeof renderPhotos === "function") {
    renderPhotos = renderPhotosWithDelete;
  }

  document.addEventListener("input", event => {
    const target = event.target;
    const field = target.dataset.f || target.dataset.field;
    if (field === "ex" || field === "exerciseId") activeExerciseId = target.value;
    window.setTimeout(afterRender, 0);
  });

  document.addEventListener("change", event => {
    const target = event.target;
    const field = target.dataset.f || target.dataset.field;
    if (field === "ex" || field === "exerciseId") activeExerciseId = target.value;
    window.setTimeout(afterRender, 0);
  });

  document.addEventListener("click", event => {
    const addButton = event.target.closest("[data-add],[data-add-exercise]");
    if (addButton) activeExerciseId = addButton.dataset.add || addButton.dataset.addExercise || activeExerciseId;

    const imageId = event.target.dataset.deleteImage;
    if (!imageId) return;
    if (!confirm("確定要刪除這張圖片嗎？此動作無法復原。")) return;
    try {
      const before = photos().length;
      setPhotos(photos().filter(item => item.id !== imageId));
      workouts().forEach(workout => {
        workout.progressImages = (workout.progressImages || []).filter(id => id !== imageId);
        workout.updatedAt = new Date().toISOString();
      });
      if (photos().length === before) throw new Error("Image not found");
      safeSave();
      afterRender();
    } catch (error) {
      alert("刪除圖片失敗，請重新整理後再試一次。");
    }
  });

  afterRender();
})();
