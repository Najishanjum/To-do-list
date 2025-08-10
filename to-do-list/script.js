(function () {
  "use strict";

  // Storage keys
  const STORAGE_KEY = "todos-v2"; // upgraded structured storage
  const THEME_KEY = "theme-preference";
  const SETTINGS_KEY = "user-settings";

  /**
   * App state in memory
   */
  const state = {
    tasks: [],
    filter: "all", // all | active | completed
    search: "",
    sort: "createdAt-desc",
    category: "all",
    bulkMode: false,
    selectedIds: new Set(),
    lastAction: null, // { type: 'delete', payload, timeoutId }
    streak: 0,
    today: { done: 0, total: 0 },
  };

  // DOM references
  const elements = {
    addForm: /** @type {HTMLFormElement | null} */ (document.getElementById("add-form")),
    taskInput: /** @type {HTMLInputElement | null} */ (document.getElementById("task-input")),
    taskList: /** @type {HTMLUListElement | null} */ (document.getElementById("task-list")),
    filterButtons: /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll(".filter-btn")),
    taskCount: /** @type {HTMLElement | null} */ (document.getElementById("task-count")),
    themeToggle: /** @type {HTMLButtonElement | null} */ (document.getElementById("theme-toggle")),
    // New controls
    searchInput: /** @type {HTMLInputElement | null} */ (document.getElementById("search-input")),
    sortSelect: /** @type {HTMLSelectElement | null} */ (document.getElementById("sort-select")),
    categoryFilter: /** @type {HTMLSelectElement | null} */ (document.getElementById("category-filter")),
    // New sidebar UI
    quickFilterChips: /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll(".quick-filters .chip")),
    categoryList: /** @type {HTMLUListElement | null} */ (document.getElementById("category-list")),
    emojiInput: /** @type {HTMLInputElement | null} */ (document.getElementById("emoji-input")),
    prioritySelect: /** @type {HTMLSelectElement | null} */ (document.getElementById("priority-select")),
    categoryInput: /** @type {HTMLInputElement | null} */ (document.getElementById("category-input")),
    dueInput: /** @type {HTMLInputElement | null} */ (document.getElementById("due-input")),
    recurringSelect: /** @type {HTMLSelectElement | null} */ (document.getElementById("recurring-select")),
    bulkToggle: /** @type {HTMLButtonElement | null} */ (document.getElementById("bulk-toggle")),
    bulkBar: /** @type {HTMLElement | null} */ (document.getElementById("bulk-bar")),
    bulkCount: /** @type {HTMLElement | null} */ (document.getElementById("bulk-count")),
    bulkComplete: /** @type {HTMLButtonElement | null} */ (document.getElementById("bulk-complete")),
    bulkDelete: /** @type {HTMLButtonElement | null} */ (document.getElementById("bulk-delete")),
    bulkCancel: /** @type {HTMLButtonElement | null} */ (document.getElementById("bulk-cancel")),
    snackbar: /** @type {HTMLElement | null} */ (document.getElementById("snackbar")),
    snackbarText: /** @type {HTMLElement | null} */ (document.getElementById("snackbar-text")),
    snackbarUndo: /** @type {HTMLButtonElement | null} */ (document.getElementById("snackbar-undo")),
    exportBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById("export-json")),
    importInput: /** @type {HTMLInputElement | null} */ (document.getElementById("import-json")),
    streak: /** @type {HTMLElement | null} */ (document.getElementById("streak")),
    todayDone: /** @type {HTMLElement | null} */ (document.getElementById("today-done")),
    todayTotal: /** @type {HTMLElement | null} */ (document.getElementById("today-total")),
    progressBar: /** @type {HTMLElement | null} */ (document.getElementById("progress-bar")),
    settingsToggle: /** @type {HTMLButtonElement | null} */ (document.getElementById("settings-toggle")),
    settingsPanel: /** @type {HTMLElement | null} */ (document.getElementById("settings-panel")),
    bgColorInput: /** @type {HTMLInputElement | null} */ (document.getElementById("bg-color")),
    bgImageInput: /** @type {HTMLInputElement | null} */ (document.getElementById("bg-image")),
    bgApplyBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById("bg-apply")),
    confettiRoot: /** @type {HTMLElement | null} */ (document.getElementById("confetti-root")),
    // Modal
    modal: /** @type {HTMLElement | null} */ (document.getElementById("task-modal")),
    modalClose: /** @type {HTMLButtonElement | null} */ (document.getElementById("modal-close")),
    modalSave: /** @type {HTMLButtonElement | null} */ (document.getElementById("modal-save")),
    modalTitleInput: /** @type {HTMLInputElement | null} */ (document.getElementById("modal-title-input")),
    modalDescription: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("modal-description")),
    modalPriority: /** @type {HTMLSelectElement | null} */ (document.getElementById("modal-priority")),
    modalCategory: /** @type {HTMLInputElement | null} */ (document.getElementById("modal-category")),
    modalDue: /** @type {HTMLInputElement | null} */ (document.getElementById("modal-due")),
  };

  // ---- Init ----
  loadTheme();
  loadSettings();
  loadTasks();
  bindEvents();
  render();
  // periodic refresh for due countdowns
  setInterval(render, 60000);

  // ---- Storage helpers ----
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state.tasks = raw ? JSON.parse(raw) : [];
    } catch {
      state.tasks = [];
    }
    renderCategoryList();
    updateTodayStats();
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const s = raw ? JSON.parse(raw) : {};
      if (s.bgColor) document.documentElement.style.setProperty("--bg", s.bgColor);
      if (s.bgImage) document.body.style.backgroundImage = `url(${CSS.escape(s.bgImage)})`;
    } catch {}
  }

  function saveSettings(settings) {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...prev, ...settings }));
  }

  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved ?? (prefersDark ? "dark" : "light");
    setTheme(theme);
  }

  function setTheme(theme) {
    document.body.classList.toggle("theme-dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
    if (elements.themeToggle) {
      elements.themeToggle.querySelector(".icon").textContent = theme === "dark" ? "☀️" : "🌙";
      elements.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    }
  }

  // ---- Event bindings ----
  function bindEvents() {
    // Add task
    elements.addForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = elements.taskInput?.value?.trim() ?? "";
      if (!text) return;
      addTask(text, {
        emoji: elements.emojiInput?.value?.trim() || "",
        priority: elements.prioritySelect?.value || "medium",
        category: elements.categoryInput?.value?.trim() || "",
        dueAt: parseDateTimeLocal(elements.dueInput?.value || "") || null,
        recurring: elements.recurringSelect?.value || "none",
      });
      if (elements.taskInput) {
        elements.taskInput.value = "";
        elements.taskInput.focus();
      }
      if (elements.emojiInput) elements.emojiInput.value = "";
      if (elements.categoryInput) elements.categoryInput.value = "";
      if (elements.dueInput) elements.dueInput.value = "";
    });

    // Theme toggle
    elements.themeToggle?.addEventListener("click", () => {
      const isDark = document.body.classList.contains("theme-dark");
      setTheme(isDark ? "light" : "dark");
    });

    // Filter buttons
    elements.filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-filter");
        if (!filter) return;
        setFilter(filter);
      });
    });

    // Search
    elements.searchInput?.addEventListener("input", () => {
      state.search = elements.searchInput.value.toLowerCase();
      render();
    });

    // Sort
    elements.sortSelect?.addEventListener("change", () => {
      state.sort = elements.sortSelect.value;
      render();
    });

    // Category filter
    elements.categoryFilter?.addEventListener("change", () => {
      state.category = elements.categoryFilter.value;
      render();
    });

    // Quick filter chips
    elements.quickFilterChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const f = chip.getAttribute("data-filter");
        if (!f) return;
        setFilter(f);
        elements.quickFilterChips.forEach((c) => c.classList.toggle("is-active", c === chip));
      });
    });

    // Delegate list interactions
    elements.taskList?.addEventListener("click", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const li = target.closest("li.task-item");
      if (!li) return;
      const id = li.getAttribute("data-id");
      if (!id) return;

      if (target.closest("button.delete")) {
        deleteTask(id);
        return;
      }

      if (target.closest("button.edit")) {
        enterEditMode(li, id);
        return;
      }

      if (target.closest(".task-main")) {
        openModal(id);
        return;
      }

      if (target.matches("input[type=checkbox][data-role=select]")) {
        toggleSelect(id, /** @type {HTMLInputElement} */(target).checked);
        return;
      }

      // Subtasks
      if (target.closest("button.subtask-add")) {
        const input = li.querySelector("input.subtask-input");
        const value = input?.value?.trim() || "";
        if (value) addSubtask(id, value);
        if (input) input.value = "";
        return;
      }

      if (target.closest("button.subtask-delete")) {
        const stId = target.closest("[data-subtask-id]")?.getAttribute("data-subtask-id");
        if (stId) deleteSubtask(id, stId);
        return;
      }
    });

    elements.taskList?.addEventListener("change", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.matches("input[type=checkbox][data-role=toggle]")) {
        const li = target.closest("li.task-item");
        const id = li?.getAttribute("data-id");
        if (!id) return;
        toggleTask(id);
        const cb = /** @type {HTMLElement} */ (target);
        cb.classList.add("pulse");
        setTimeout(() => cb.classList.remove("pulse"), 220);
      }

      if (target.matches("input[type=checkbox][data-role=subtoggle]")) {
        const li = target.closest("li.task-item");
        const id = li?.getAttribute("data-id");
        const stId = target.closest("[data-subtask-id]")?.getAttribute("data-subtask-id");
        if (!id || !stId) return;
        toggleSubtask(id, stId);
      }
    });

    // Edit on double-click text
    elements.taskList?.addEventListener("dblclick", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const textEl = target.closest(".task-text");
      if (!textEl) return;
      const li = target.closest("li.task-item");
      const id = li?.getAttribute("data-id");
      if (!id) return;
      enterEditMode(li, id);
    });
    // Bulk mode
    elements.bulkToggle?.addEventListener("click", () => {
      state.bulkMode = !state.bulkMode;
      state.selectedIds.clear();
      render();
    });
    elements.bulkComplete?.addEventListener("click", () => {
      bulkComplete();
    });
    elements.bulkDelete?.addEventListener("click", () => {
      bulkDelete();
    });
    elements.bulkCancel?.addEventListener("click", () => {
      state.bulkMode = false;
      state.selectedIds.clear();
      render();
    });

    // Snackbar undo
    elements.snackbarUndo?.addEventListener("click", () => {
      undoLastAction();
    });

    // Export / Import
    elements.exportBtn?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state.tasks, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `todos-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    elements.importInput?.addEventListener("change", async () => {
      const file = elements.importInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          state.tasks = data;
          saveTasks();
          render();
        }
      } catch {}
      elements.importInput.value = "";
    });

    // Settings (background)
    elements.settingsToggle?.addEventListener("click", () => {
      if (!elements.settingsPanel) return;
      const hidden = elements.settingsPanel.hasAttribute("hidden");
      if (hidden) elements.settingsPanel.removeAttribute("hidden");
      else elements.settingsPanel.setAttribute("hidden", "");
    });
    elements.bgApplyBtn?.addEventListener("click", () => {
      const color = elements.bgColorInput?.value || null;
      const image = elements.bgImageInput?.value?.trim() || null;
      if (color) document.documentElement.style.setProperty("--bg", color);
      if (image) document.body.style.backgroundImage = `url(${image})`;
      else document.body.style.backgroundImage = "";
      saveSettings({ bgColor: color, bgImage: image });
    });

    // Modal events
    elements.modalClose?.addEventListener("click", closeModal);
    elements.modal?.addEventListener("click", (e) => {
      if (e.target === elements.modal?.querySelector(".modal-backdrop")) closeModal();
    });
    elements.modalSave?.addEventListener("click", saveModal);
  }

  // ---- State operations ----
  function addTask(text, extra = {}) {
    const task = {
      id: cryptoRandomId(),
      text,
      completed: false,
      createdAt: Date.now(),
      emoji: extra.emoji || "",
      priority: extra.priority || "medium", // high | medium | low
      category: extra.category || "",
      dueAt: extra.dueAt || null, // timestamp
      recurring: extra.recurring || "none", // none | daily | weekly | monthly
      subtasks: [],
      description: extra.description || "",
    };
    state.tasks.unshift(task);
    saveTasks();
    render();
  }

  function toggleTask(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    if (task.completed) handleRecurring(task);
    updateTodayStats();
    saveTasks();
    render();
  }

  function deleteTask(id) {
    const removed = state.tasks.find((t) => t.id === id);
    state.tasks = state.tasks.filter((t) => t.id !== id);
    showUndo({ type: "delete", payload: removed });
    saveTasks();
    render();
  }

  function editTask(id, newText) {
    const text = (newText ?? "").trim();
    if (!text) {
      // If emptied, delete the task
      deleteTask(id);
      return;
    }
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.text = text;
    saveTasks();
    render();
  }

  function setFilter(filter) {
    if (!["all", "active", "completed", "high"].includes(filter)) return;
    state.filter = filter;
    // Update button states
    elements.filterButtons.forEach((btn) => {
      const isActive = btn.getAttribute("data-filter") === filter;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
    render();
  }

  function toggleSelect(id, selected) {
    if (selected) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    renderBulkBar();
  }

  function bulkComplete() {
    state.tasks.forEach((t) => {
      if (state.selectedIds.has(t.id)) t.completed = true;
    });
    state.selectedIds.clear();
    updateTodayStats();
    saveTasks();
    render();
  }

  function bulkDelete() {
    const removed = state.tasks.filter((t) => state.selectedIds.has(t.id));
    state.tasks = state.tasks.filter((t) => !state.selectedIds.has(t.id));
    state.selectedIds.clear();
    showUndo({ type: "bulk-delete", payload: removed });
    saveTasks();
    render();
  }

  // ---- Rendering ----
  function render() {
    if (!elements.taskList) return;
    updateTodayStats();
    // Filter tasks
    let tasksToShow = state.tasks.filter((t) => {
      if (state.filter === "active") return !t.completed;
      if (state.filter === "completed") return t.completed;
      if (state.filter === "high") return t.priority === "high";
      return true;
    });

    // Category
    if (state.category !== "all") {
      tasksToShow = tasksToShow.filter((t) => (t.category || "").toLowerCase() === state.category.toLowerCase());
    }
    // Search
    if (state.search) {
      const q = state.search;
      tasksToShow = tasksToShow.filter((t) => `${t.emoji} ${t.text} ${t.category}`.toLowerCase().includes(q));
    }
    // Sort
    tasksToShow.sort((a, b) => compareTasks(a, b, state.sort));

    // Build list
    elements.taskList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    tasksToShow.forEach((task) => {
      const li = document.createElement("li");
      li.className = `task-item${task.completed ? " completed" : ""}`;
      li.setAttribute("data-id", task.id);
      const dueInfo = renderDue(task.dueAt);
      const priorityClass = task.priority ? `priority-${task.priority}` : "";
      li.draggable = true;
      const catStyle = categoryStyle(task.category);
      li.innerHTML = `
        ${state.bulkMode ? `<input type="checkbox" data-role="select" ${state.selectedIds.has(task.id) ? "checked" : ""} aria-label="Select task" />` : ""}
        <input type="checkbox" data-role="toggle" ${task.completed ? "checked" : ""} aria-label="Mark complete" />
        <div class="task-content">
          <div class="task-main">
            <span class="emoji">${escapeHtml(task.emoji || "")}</span>
            <span class="task-text" title="Double‑click to edit">${escapeHtml(task.text)}</span>
          </div>
          <div class="task-meta">
            <span class="priority-badge ${priorityClass}">${capitalize(task.priority)}</span>
            ${task.category ? `<span class="category-badge" style="${catStyle}">${escapeHtml(task.category)}</span>` : ""}
            <span class="due ${dueInfo.overdue ? "overdue" : ""}">${dueInfo.label}</span>
          </div>
          <div class="subtasks">
            ${renderSubtasks(task)}
            <div class="subtask-input-row">
              <input class="subtask-input" type="text" placeholder="Add subtask" />
              <button class="icon-btn subtask-add" title="Add subtask">＋</button>
            </div>
          </div>
        </div>
        <div class="task-actions">
          <button class="icon-btn edit" aria-label="Edit task" title="Edit"><i data-feather="edit-2"></i></button>
          <button class="icon-btn delete" aria-label="Delete task" title="Delete"><i data-feather="trash-2"></i></button>
        </div>
      `;
      fragment.appendChild(li);

      // Drag handlers
      li.addEventListener("dragstart", () => {
        li.classList.add("dragging");
        li.dataset.dragId = task.id;
      });
      li.addEventListener("dragend", () => {
        li.classList.remove("dragging");
        delete li.dataset.dragId;
      });
      li.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        const dragId = document.querySelector(".dragging")?.getAttribute("data-id");
        if (!dragId || dragId === task.id) return;
        reorderTasks(dragId, task.id);
      });

      // Swipe gestures (mobile)
      bindSwipe(li, task.id);
    });
    elements.taskList.appendChild(fragment);

    renderCount();
    renderBulkBar();
    renderCategoryList();
    renderStats();
    maybeCelebrate();
    if (window.feather) window.feather.replace();
  }

  function renderCount() {
    if (!elements.taskCount) return;
    const remaining = state.tasks.filter((t) => !t.completed).length;
    elements.taskCount.textContent = String(remaining);
  }

  function renderBulkBar() {
    if (!elements.bulkBar || !elements.bulkCount) return;
    if (!state.bulkMode) {
      elements.bulkBar.setAttribute("hidden", "");
      return;
    }
    elements.bulkBar.removeAttribute("hidden");
    elements.bulkCount.textContent = String(state.selectedIds.size);
  }

  // ---- Inline edit ----
  function enterEditMode(li, id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    if (li.querySelector(".edit-input")) return; // already editing

    const textEl = li.querySelector(".task-text");
    if (!textEl) return;

    const input = document.createElement("input");
    input.type = "text";
    input.value = task.text;
    input.className = "edit-input";
    input.setAttribute("aria-label", "Edit task text");

    // Replace text with input
    li.replaceChild(input, textEl);
    input.focus();
    input.setSelectionRange(task.text.length, task.text.length);

    const commit = () => {
      editTask(id, input.value);
    };
    const cancel = () => {
      // Restore original content if canceled
      render();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);
  }

  // ---- Utils ----
  function renderCategoryList() {
    if (!elements.categoryList) return;
    const counts = Object.create(null);
    state.tasks.forEach((t) => {
      const c = (t.category || "").trim();
      if (!c) return;
      counts[c] = (counts[c] || 0) + 1;
    });
    const categories = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    elements.categoryList.innerHTML = categories.map((c) => {
      const active = state.category.toLowerCase() === c.toLowerCase();
      const style = categoryStyle(c);
      return `<li data-category="${escapeHtml(c)}" class="${active ? "is-active" : ""}"><span>${escapeHtml(c)}</span><span class="badge" style="${style}">${counts[c]}</span></li>`;
    }).join("");
    elements.categoryList.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        const c = li.getAttribute("data-category") || "all";
        state.category = c;
        render();
      });
    });
  }

  function compareTasks(a, b, sort) {
    switch (sort) {
      case "name-asc": return a.text.localeCompare(b.text);
      case "dueAt-asc": return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
      case "priority-desc": return priorityRank(b.priority) - priorityRank(a.priority);
      case "createdAt-desc":
      default: return (b.createdAt || 0) - (a.createdAt || 0);
    }
  }

  function priorityRank(p) {
    return p === "high" ? 3 : p === "medium" ? 2 : 1;
  }

  function capitalize(s) { return (s || "").slice(0,1).toUpperCase() + (s || "").slice(1); }

  function renderDue(ts) {
    if (!ts) return { label: "No due date", overdue: false };
    const now = Date.now();
    const diff = ts - now;
    if (diff < 0) return { label: "Overdue", overdue: true };
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return { label: `${minutes}m`, overdue: false };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { label: `${hours}h`, overdue: false };
    const days = Math.floor(hours / 24);
    return { label: `${days}d`, overdue: false };
  }

  function categoryStyle(category) {
    if (!category) return "";
    const key = category.toLowerCase();
    const palette = {
      work: { bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" },
      personal: { bg: "#ffe4e6", color: "#be123c", border: "#fecdd3" },
      shopping: { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" },
      urgent: { bg: "#fee2e2", color: "#991b1b", border: "#fecaca" },
    };
    const p = palette[key] || { bg: "#eef2ff", color: "#3730a3", border: "#e0e7ff" };
    return `background:${p.bg};color:${p.color};border-color:${p.border}`;
  }

  // Modal helpers
  function openModal(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task || !elements.modal) return;
    elements.modal.dataset.taskId = id;
    if (elements.modalTitleInput) elements.modalTitleInput.value = task.text;
    if (elements.modalDescription) elements.modalDescription.value = task.description || "";
    if (elements.modalPriority) elements.modalPriority.value = task.priority || "medium";
    if (elements.modalCategory) elements.modalCategory.value = task.category || "";
    if (elements.modalDue) elements.modalDue.value = task.dueAt ? new Date(task.dueAt).toISOString().slice(0,16) : "";
    elements.modal.removeAttribute("hidden");
  }
  function closeModal() {
    elements.modal?.setAttribute("hidden", "");
  }
  function saveModal() {
    if (!elements.modal) return;
    const id = elements.modal.dataset.taskId;
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    const title = elements.modalTitleInput?.value || task.text;
    const desc = elements.modalDescription?.value || "";
    const pri = elements.modalPriority?.value || task.priority;
    const cat = elements.modalCategory?.value || "";
    const due = parseDateTimeLocal(elements.modalDue?.value || "") || null;
    task.text = title.trim() || task.text;
    task.description = desc;
    task.priority = pri;
    task.category = cat;
    task.dueAt = due;
    saveTasks();
    closeModal();
    render();
  }

  function bindSwipe(li, id) {
    let startX = 0, dx = 0, active = false;
    li.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX; dx = 0; active = true;
    });
    li.addEventListener("touchmove", (e) => {
      if (!active) return;
      dx = e.touches[0].clientX - startX;
      li.style.transform = `translateX(${dx}px)`;
      li.style.transition = "none";
    });
    li.addEventListener("touchend", () => {
      li.style.transition = "";
      li.style.transform = "";
      if (dx > 80) { toggleTask(id); }
      else if (dx < -80) { deleteTask(id); }
      active = false;
    });
  }

  function renderSubtasks(task) {
    if (!task.subtasks || !task.subtasks.length) return "";
    return task.subtasks.map((st) => `
      <div class="subtask" data-subtask-id="${st.id}">
        <input type="checkbox" data-role="subtoggle" ${st.completed ? "checked" : ""} />
        <div class="subtask-text ${st.completed ? "completed" : ""}">${escapeHtml(st.text)}</div>
        <button class="icon-btn subtask-delete" title="Delete subtask">🗑️</button>
      </div>
    `).join("");
  }

  function addSubtask(taskId, text) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.subtasks = task.subtasks || [];
    task.subtasks.push({ id: cryptoRandomId(), text, completed: false });
    saveTasks();
    render();
  }

  function toggleSubtask(taskId, subtaskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || !task.subtasks) return;
    const st = task.subtasks.find((s) => s.id === subtaskId);
    if (!st) return;
    st.completed = !st.completed;
    saveTasks();
    render();
  }

  function deleteSubtask(taskId, subtaskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || !task.subtasks) return;
    task.subtasks = task.subtasks.filter((s) => s.id !== subtaskId);
    saveTasks();
    render();
  }

  function parseDateTimeLocal(val) {
    if (!val) return null;
    // Treat as local date time; create UTC timestamp
    const dt = new Date(val);
    if (Number.isNaN(+dt)) return null;
    return dt.getTime();
  }

  function reorderTasks(dragId, overId) {
    const from = state.tasks.findIndex((t) => t.id === dragId);
    const to = state.tasks.findIndex((t) => t.id === overId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = state.tasks.splice(from, 1);
    state.tasks.splice(to, 0, moved);
    saveTasks();
    render();
  }

  function handleRecurring(task) {
    if (!task.recurring || task.recurring === "none") return;
    const next = { daily: 1, weekly: 7, monthly: 30 }[task.recurring] || 0;
    if (!next) return;
    const clone = { ...task, id: cryptoRandomId(), completed: false };
    if (task.dueAt) clone.dueAt = task.dueAt + next * 86400000;
    state.tasks.push(clone);
  }

  function showUndo(action) {
    state.lastAction = action;
    if (!elements.snackbar || !elements.snackbarText) return;
    const text = action.type === "delete" ? "Task deleted" : "Tasks deleted";
    elements.snackbarText.textContent = text;
    elements.snackbar.removeAttribute("hidden");
    clearTimeout(showUndo._tid);
    showUndo._tid = setTimeout(() => {
      hideUndo();
      state.lastAction = null;
    }, 5000);
  }
  function hideUndo() { elements.snackbar?.setAttribute("hidden", ""); }

  function undoLastAction() {
    if (!state.lastAction) return;
    if (state.lastAction.type === "delete") {
      const t = state.lastAction.payload;
      if (t) state.tasks.unshift(t);
    } else if (state.lastAction.type === "bulk-delete") {
      const arr = state.lastAction.payload || [];
      state.tasks.unshift(...arr);
    }
    state.lastAction = null;
    hideUndo();
    saveTasks();
    render();
  }

  function updateTodayStats() {
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const start = todayStart.getTime();
    const end = start + 86400000;
    const todays = state.tasks.filter((t) => (t.createdAt ?? 0) >= start && (t.createdAt ?? 0) < end);
    const done = todays.filter((t) => t.completed).length;
    state.today = { done, total: todays.length };

    // streak: if there's at least one completed today and on consecutive previous days
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const dayStart = start - i * 86400000;
      const dayEnd = dayStart + 86400000;
      const anyDone = state.tasks.some((t) => (t.createdAt ?? 0) >= dayStart && (t.createdAt ?? 0) < dayEnd && t.completed);
      if (anyDone) streak++;
      else break;
    }
    state.streak = streak;
  }

  function renderStats() {
    elements.todayDone && (elements.todayDone.textContent = String(state.today.done));
    elements.todayTotal && (elements.todayTotal.textContent = String(state.today.total));
    if (elements.progressBar) {
      const pct = state.today.total ? Math.round((state.today.done / state.today.total) * 100) : 0;
      elements.progressBar.style.width = `${pct}%`;
    }
    if (elements.streak) elements.streak.textContent = `🔥 ${state.streak}-day streak`;
  }

  function maybeCelebrate() {
    const remaining = state.tasks.filter((t) => !t.completed).length;
    const any = state.tasks.length > 0;
    if (any && remaining === 0) confetti(80);
  }

  function confetti(count) {
    const root = elements.confettiRoot;
    if (!root) return;
    root.innerHTML = "";
    const colors = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa"];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = colors[(Math.random() * colors.length) | 0];
      piece.style.animationDelay = (Math.random() * 0.5) + "s";
      root.appendChild(piece);
    }
    setTimeout(() => (root.innerHTML = ""), 1500);
  }
  function cryptoRandomId() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const arr = new Uint32Array(2);
      crypto.getRandomValues(arr);
      return (
        Date.now().toString(36) +
        "-" +
        Array.from(arr)
          .map((n) => n.toString(36))
          .join("")
      );
    }
    return Math.random().toString(36).slice(2);
  }

  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function noop() {}
})();

