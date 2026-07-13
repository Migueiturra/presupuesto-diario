const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

const STORAGE_KEY = "presupuesto-diario:v2";
const LEGACY_STORAGE_KEY = "presupuesto-diario:v1";
const QUICK_AMOUNTS = [1000, 2000, 3000, 5000, 10000];
const CATEGORIES = [
  { id: "food", label: "Comida", icon: "🍽" },
  { id: "coffee", label: "Café", icon: "☕" },
  { id: "transport", label: "Uber", icon: "🚗" },
  { id: "market", label: "Compras", icon: "🛒" },
  { id: "fun", label: "Ocio", icon: "🎟" },
  { id: "other", label: "Otro", icon: "＋" }
];

const defaultState = {
  config: null,
  expenses: []
};

let state = loadLocalData();
let selectedQuickAmount = null;
let selectedDateKey = getTodayKey();
let editingExpenseId = null;
let selectedCategory = "other";
let supabaseClient = null;
let currentUser = null;
let isCloudReady = false;

const els = {
  tabs: document.querySelectorAll(".tab-button"),
  views: document.querySelectorAll(".view"),
  cloudPanel: document.querySelector("#cloudPanel"),
  cloudTitle: document.querySelector("#cloudTitle"),
  cloudStatus: document.querySelector("#cloudStatus"),
  cloudLoginForm: document.querySelector("#cloudLoginForm"),
  cloudEmail: document.querySelector("#cloudEmail"),
  cloudActions: document.querySelector("#cloudActions"),
  syncCloud: document.querySelector("#syncCloud"),
  logoutCloud: document.querySelector("#logoutCloud"),
  setupPanel: document.querySelector("#setupPanel"),
  expensePanel: document.querySelector("#expensePanel"),
  settingsForm: document.querySelector("#settingsForm"),
  expenseForm: document.querySelector("#expenseForm"),
  openSettings: document.querySelector("#openSettings"),
  cancelSettings: document.querySelector("#cancelSettings"),
  openExpense: document.querySelector("#openExpense"),
  cancelExpense: document.querySelector("#cancelExpense"),
  previousDay: document.querySelector("#previousDay"),
  nextDay: document.querySelector("#nextDay"),
  jumpToday: document.querySelector("#jumpToday"),
  dateStrip: document.querySelector("#dateStrip"),
  selectedDayLabel: document.querySelector("#selectedDayLabel"),
  selectedDateText: document.querySelector("#selectedDateText"),
  heroLabel: document.querySelector("#heroLabel"),
  budgetModeSelect: document.querySelector("#budgetModeSelect"),
  budgetAmount: document.querySelector("#budgetAmount"),
  amountLabel: document.querySelector("#amountLabel"),
  reminderTime: document.querySelector("#reminderTime"),
  enableNotifications: document.querySelector("#enableNotifications"),
  saveStatus: document.querySelector("#saveStatus"),
  availableToday: document.querySelector("#availableToday"),
  statusMessage: document.querySelector("#statusMessage"),
  progressFill: document.querySelector("#progressFill"),
  spentPercent: document.querySelector("#spentPercent"),
  progressState: document.querySelector("#progressState"),
  spentToday: document.querySelector("#spentToday"),
  dailyAvailable: document.querySelector("#dailyAvailable"),
  remainingToday: document.querySelector("#remainingToday"),
  carryBalance: document.querySelector("#carryBalance"),
  dailyBase: document.querySelector("#dailyBase"),
  quickAmounts: document.querySelector("#quickAmounts"),
  categoryPicker: document.querySelector("#categoryPicker"),
  expenseAmount: document.querySelector("#expenseAmount"),
  expenseNote: document.querySelector("#expenseNote"),
  submitExpense: document.querySelector("#submitExpense"),
  clearExpenseEdit: document.querySelector("#clearExpenseEdit"),
  expenseDateLabel: document.querySelector("#expenseDateLabel"),
  expenseTitle: document.querySelector("#expenseTitle"),
  todayExpensesList: document.querySelector("#todayExpensesList"),
  expensesDayLabel: document.querySelector("#expensesDayLabel"),
  simulationAmount: document.querySelector("#simulationAmount"),
  runSimulation: document.querySelector("#runSimulation"),
  simulationResult: document.querySelector("#simulationResult"),
  historyList: document.querySelector("#historyList"),
  resetData: document.querySelector("#resetData")
};

init();

async function init() {
  normalizeState();
  renderQuickAmounts();
  renderCategories();
  bindEvents();
  registerServiceWorker();
  await initSupabase();
  syncSettingsForm();
  updateInterface();
}

function bindEvents() {
  els.tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));
  els.budgetModeSelect.addEventListener("change", updateAmountLabel);
  els.openSettings.addEventListener("click", () => showSettings(true));
  els.cancelSettings.addEventListener("click", () => showSettings(false));
  els.openExpense.addEventListener("click", () => showExpensePanel(true));
  els.cancelExpense.addEventListener("click", () => {
    showExpensePanel(false);
    clearExpenseForm();
  });
  els.previousDay.addEventListener("click", () => changeSelectedDay(-1));
  els.nextDay.addEventListener("click", () => changeSelectedDay(1));
  els.jumpToday.addEventListener("click", () => setSelectedDate(getTodayKey()));
  bindDateSwipe();

  els.cloudLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendMagicLink();
  });
  els.syncCloud.addEventListener("click", syncCloudNow);
  els.logoutCloud.addEventListener("click", logoutCloud);

  els.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings();
  });

  els.expenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const manualAmount = parseAmount(els.expenseAmount.value);
    const amount = manualAmount || selectedQuickAmount;
    await addExpense(amount, els.expenseNote.value.trim(), selectedCategory);
  });

  els.todayExpensesList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-expense]");
    if (button) {
      await deleteExpense(button.dataset.deleteExpense);
      return;
    }

    const editButton = event.target.closest("[data-edit-expense]");
    if (editButton) {
      startEditExpense(editButton.dataset.editExpense);
    }
  });

  els.clearExpenseEdit.addEventListener("click", () => {
    clearExpenseForm();
  });

  els.runSimulation.addEventListener("click", () => {
    const amount = parseAmount(els.simulationAmount.value);
    els.simulationResult.textContent = simulateExpense(amount);
  });

  els.enableNotifications.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      showSaveStatus("Este navegador no soporta notificaciones.", true);
      return;
    }

    const permission = await Notification.requestPermission();
    showSaveStatus(permission === "granted" ? "Notificaciones activadas." : "No se activaron las notificaciones.", permission !== "granted");
  });

  els.resetData.addEventListener("click", async () => {
    const confirmed = window.confirm("¿Seguro que quieres borrar la configuración y todos los gastos?");
    if (!confirmed) return;
    state = structuredClone(defaultState);
    selectedDateKey = getTodayKey();
    selectedQuickAmount = null;
    els.expenseAmount.value = "";
    els.expenseNote.value = "";
    setActiveTab("today");
    syncSettingsForm();
    await persistData();
    updateInterface();
    showSaveStatus("Datos reiniciados.");
  });
}

function bindDateSwipe() {
  let startX = 0;
  let startY = 0;
  let pointerDown = false;

  els.dateStrip.addEventListener("pointerdown", (event) => {
    pointerDown = true;
    startX = event.clientX;
    startY = event.clientY;
  });

  els.dateStrip.addEventListener("pointerup", (event) => {
    if (!pointerDown) return;
    pointerDown = false;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaY) > 55) return;
    changeSelectedDay(deltaX < 0 ? 1 : -1);
  });

  els.dateStrip.addEventListener("pointercancel", () => {
    pointerDown = false;
  });
}

function setSelectedDate(dateKey) {
  selectedDateKey = dateKey;
  clearExpenseForm();
  updateInterface();
}

function changeSelectedDay(delta) {
  setSelectedDate(toDateKey(addDays(new Date(`${selectedDateKey}T12:00:00`), delta)));
}

async function initSupabase() {
  const configured = SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;
  if (!configured) {
    updateCloudUi("local");
    return;
  }

  if (!window.supabase) {
    updateCloudUi("error", "No se pudo cargar Supabase. Revisa la conexión.");
    return;
  }

  isCloudReady = true;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await loadCloudData();
    updateCloudUi(currentUser ? "signed-in" : "signed-out");
    updateInterface();
  });

  if (currentUser) await loadCloudData();
  updateCloudUi(currentUser ? "signed-in" : "signed-out");
}

function updateCloudUi(mode, overrideMessage = "") {
  if (mode === "local") {
    els.cloudPanel.hidden = true;
    els.cloudTitle.textContent = "Modo local";
    els.cloudStatus.textContent = "Supabase no está configurado. Tus datos quedan en este navegador.";
    els.cloudLoginForm.hidden = true;
    els.cloudActions.hidden = true;
    return;
  }

  if (mode === "error") {
    els.cloudPanel.hidden = false;
    els.cloudTitle.textContent = "Nube no disponible";
    els.cloudStatus.textContent = overrideMessage;
    els.cloudLoginForm.hidden = true;
    els.cloudActions.hidden = true;
    return;
  }

  if (mode === "signed-in") {
    els.cloudPanel.hidden = false;
    els.cloudTitle.textContent = "Sincronizado";
    els.cloudStatus.textContent = `Sesión iniciada: ${currentUser.email}`;
    els.cloudLoginForm.hidden = true;
    els.cloudActions.hidden = false;
    return;
  }

  els.cloudPanel.hidden = false;
  els.cloudTitle.textContent = "Sincronización";
  els.cloudStatus.textContent = overrideMessage || "Ingresa tu email para recibir un enlace de acceso.";
  els.cloudLoginForm.hidden = false;
  els.cloudActions.hidden = true;
}

async function sendMagicLink() {
  if (!isCloudReady || !supabaseClient) return;
  const email = els.cloudEmail.value.trim();
  if (!email) {
    updateCloudUi("signed-out", "Ingresa un email válido.");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("#")[0] }
  });

  updateCloudUi("signed-out", error ? error.message : "Te envié un enlace de acceso al email.");
}

async function logoutCloud() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateCloudUi("signed-out");
}

async function syncCloudNow() {
  if (!currentUser) return;
  await persistCloudData();
  await loadCloudData();
  updateInterface();
  updateCloudUi("signed-in");
}

async function loadCloudData() {
  if (!supabaseClient || !currentUser) return;

  const { data: settings, error: settingsError } = await supabaseClient
    .from("budget_settings")
    .select("mode, amount, reminder_time, start_date, updated_at")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  const { data: expenses, error: expensesError } = await supabaseClient
    .from("expenses")
    .select("id, amount, note, category, date_key, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (settingsError || expensesError) {
    updateCloudUi("signed-in");
    els.cloudStatus.textContent = "No pude cargar datos de Supabase. Revisa tablas y políticas RLS.";
    return;
  }

  if (!settings && state.config) {
    await persistCloudData();
    return;
  }

  state = {
    config: settings
      ? {
          mode: settings.mode,
          amount: settings.amount,
          reminderTime: settings.reminder_time || "20:30",
          startDate: settings.start_date || getTodayKey(),
          updatedAt: settings.updated_at || new Date().toISOString()
        }
      : null,
    expenses: (expenses || []).map((expense) => ({
      id: expense.id,
      amount: expense.amount,
      note: expense.note || "",
      category: expense.category || "other",
      dateKey: expense.date_key,
      createdAt: expense.created_at
    }))
  };

  normalizeState();
  saveLocalData();
}

async function persistData() {
  saveLocalData();
  if (currentUser) await persistCloudData();
}

async function persistCloudData() {
  if (!supabaseClient || !currentUser) return;

  if (state.config) {
    const { error } = await supabaseClient.from("budget_settings").upsert({
      user_id: currentUser.id,
      mode: state.config.mode,
      amount: state.config.amount,
      reminder_time: state.config.reminderTime || "20:30",
      start_date: state.config.startDate || getTodayKey(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  } else {
    await supabaseClient.from("budget_settings").delete().eq("user_id", currentUser.id);
  }

  const { error: deleteError } = await supabaseClient.from("expenses").delete().eq("user_id", currentUser.id);
  if (deleteError) throw deleteError;

  if (!state.expenses.length) return;

  const rows = state.expenses.map((expense) => ({
    id: expense.id,
    user_id: currentUser.id,
    amount: expense.amount,
    note: expense.note || "",
    category: expense.category || "other",
    date_key: expense.dateKey,
    created_at: expense.createdAt
  }));

  const { error: insertError } = await supabaseClient.from("expenses").insert(rows);
  if (insertError) throw insertError;
}

function setActiveTab(tabName) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  els.views.forEach((view) => {
    const isActive = view.dataset.view === tabName;
    view.classList.toggle("active", isActive);
    view.hidden = !isActive;
  });
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState() {
  if (!state || typeof state !== "object") state = structuredClone(defaultState);
  if (!Array.isArray(state.expenses)) state.expenses = [];
  if (state.config && !state.config.startDate) state.config.startDate = getTodayKey();
  state.expenses = state.expenses.map((expense) => ({
    ...expense,
    id: isUsableId(expense.id) ? expense.id : crypto.randomUUID(),
    note: expense.note || "",
    category: expense.category || "other",
    dateKey: expense.dateKey || getTodayKey(),
    createdAt: expense.createdAt || new Date().toISOString()
  }));
}

function saveLocalData() {
  normalizeState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

async function saveSettings() {
  const mode = els.budgetModeSelect.value;
  const amount = parseAmount(els.budgetAmount.value);

  if (!amount || amount <= 0) {
    showSaveStatus("Ingresa un monto válido.", true);
    els.budgetAmount.focus();
    return;
  }

  state.config = {
    mode,
    amount,
    reminderTime: els.reminderTime.value || "20:30",
    startDate: getTodayKey(),
    updatedAt: new Date().toISOString()
  };

  try {
    await persistData();
    updateInterface();
    showSettings(false);
    showSaveStatus(currentUser ? "Presupuesto guardado en la nube." : "Presupuesto guardado.");
  } catch {
    showSaveStatus("No se pudo guardar en Supabase. Quedó respaldo local.", true);
    saveLocalData();
    updateInterface();
  }
}

function calculateDailyBase(dateKey) {
  if (!state.config) return 0;
  const { mode, amount } = state.config;
  if (mode === "daily") return amount;
  if (mode === "weekly") return Math.floor(amount / 7);
  return Math.floor(amount / getDaysInMonth(dateKey));
}

function calculateDayRecord(dateKey) {
  if (!state.config) return emptyRecord(dateKey);

  const startDate = getCalculationStartDate(dateKey);
  let carry = 0;
  const cursor = new Date(`${startDate}T00:00:00`);
  const target = new Date(`${dateKey}T00:00:00`);

  while (cursor <= target) {
    const key = toDateKey(cursor);
    const base = calculateDailyBase(key);
    const available = base + carry;
    const spent = getExpensesForDate(key).reduce((sum, expense) => sum + expense.amount, 0);
    const balance = available - spent;

    if (key === dateKey) return { dateKey: key, base, carry, available, spent, balance };

    carry = balance;
    cursor.setDate(cursor.getDate() + 1);
  }

  return emptyRecord(dateKey);
}

function getHistory(days = 7) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    return calculateDayRecord(toDateKey(date));
  });
}

function getCalculationStartDate(dateKey) {
  const candidates = [state.config?.startDate || dateKey, dateKey, ...state.expenses.map((expense) => expense.dateKey)];
  return candidates.filter(Boolean).sort()[0] || dateKey;
}

async function addExpense(amount, note = "", category = "other") {
  if (!state.config) {
    showSaveStatus("Primero configura tu presupuesto.", true);
    showSettings(true);
    return;
  }

  if (!amount || amount <= 0) {
    showSaveStatus("Ingresa o elige un monto.", true);
    return;
  }

  if (editingExpenseId) {
    state.expenses = state.expenses.map((expense) =>
      expense.id === editingExpenseId
        ? { ...expense, amount, note, category, dateKey: selectedDateKey }
        : expense
    );
  } else {
    state.expenses.push({
      id: crypto.randomUUID(),
      amount,
      note,
      category,
      dateKey: selectedDateKey,
      createdAt: new Date().toISOString()
    });
  }

  try {
    await persistData();
    clearExpenseForm();
    showExpensePanel(false);
    updateInterface();
  } catch {
    showSaveStatus("No se pudo guardar en Supabase. Quedó respaldo local.", true);
    saveLocalData();
    updateInterface();
  }
}

async function deleteExpense(id) {
  state.expenses = state.expenses.filter((expense) => expense.id !== id);
  await persistData();
  updateInterface();
}

function simulateExpense(amount) {
  if (!state.config) return "Configura tu presupuesto para poder simular gastos.";
  if (!amount || amount <= 0) return "Escribe un monto válido para simular.";

  const today = calculateDayRecord(selectedDateKey);
  const remainingAfter = today.available - today.spent - amount;
  const tomorrowBase = calculateDailyBase(toDateKey(addDays(new Date(), 1)));
  const tomorrowAvailable = tomorrowBase + remainingAfter;

  if (remainingAfter >= 0) {
    return `Si gastas ${formatCurrency(amount)} ahora, quedarías con ${formatCurrency(remainingAfter)} para hoy. Mañana partirías con ${formatCurrency(tomorrowAvailable)} disponible.`;
  }

  return `Si haces este gasto, te pasarías por ${formatCurrency(Math.abs(remainingAfter))}. Mañana partirías con ${formatCurrency(tomorrowAvailable)} disponible.`;
}

function updateInterface() {
  const hasConfig = Boolean(state.config);
  els.setupPanel.hidden = hasConfig;
  els.openExpense.disabled = !hasConfig;
  updateDateHeader();

  if (!hasConfig) {
    updateEmptyInterface();
    renderTodayExpenses();
    renderHistory([]);
    return;
  }

  const today = calculateDayRecord(selectedDateKey);
  const remaining = today.available - today.spent;
  const percent = today.available > 0 ? Math.round((today.spent / today.available) * 100) : 100;
  const status = getVisualStatus(today.spent, today.available);

  els.availableToday.textContent = formatCurrency(remaining);
  els.spentToday.textContent = formatCurrency(today.spent);
  els.dailyAvailable.textContent = formatCurrency(today.available);
  els.remainingToday.textContent = formatCurrency(remaining);
  els.carryBalance.textContent = formatCurrency(today.carry);
  els.dailyBase.textContent = formatCurrency(today.base);
  els.spentPercent.textContent = `${Math.max(0, percent)}% usado`;
  els.progressState.textContent = status.label;
  els.statusMessage.textContent = status.message;
  els.progressFill.style.width = `${Math.min(Math.max(percent, 0), 120)}%`;
  els.progressFill.style.backgroundColor = status.color;

  renderTodayExpenses();
  renderHistory(getHistory());
  maybeShowReminder(today);
}

function updateEmptyInterface() {
  els.availableToday.textContent = "$0";
  els.spentToday.textContent = "$0";
  els.dailyAvailable.textContent = "$0";
  els.remainingToday.textContent = "$0";
  els.carryBalance.textContent = "$0";
  els.dailyBase.textContent = "$0";
  els.spentPercent.textContent = "0% usado";
  els.progressState.textContent = "Sin presupuesto";
  els.statusMessage.textContent = "Configura tu presupuesto para comenzar.";
  els.progressFill.style.width = "0%";
  els.progressFill.style.backgroundColor = "var(--teal)";
}

function renderQuickAmounts() {
  els.quickAmounts.innerHTML = "";
  QUICK_AMOUNTS.forEach((amount) => {
    const button = document.createElement("button");
    button.className = "quick-amount";
    button.type = "button";
    button.textContent = formatCurrency(amount);
    button.addEventListener("click", () => {
      selectedQuickAmount = amount;
      els.expenseAmount.value = String(amount);
      document.querySelectorAll(".quick-amount").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
    els.quickAmounts.append(button);
  });
}

function renderCategories() {
  els.categoryPicker.innerHTML = "";
  CATEGORIES.forEach((category) => {
    const button = document.createElement("button");
    button.className = "category-chip";
    button.type = "button";
    button.dataset.category = category.id;
    button.innerHTML = `<span aria-hidden="true">${category.icon}</span><strong>${category.label}</strong>`;
    button.addEventListener("click", () => setSelectedCategory(category.id));
    els.categoryPicker.append(button);
  });
  setSelectedCategory(selectedCategory);
}

function setSelectedCategory(categoryId) {
  selectedCategory = CATEGORIES.some((category) => category.id === categoryId) ? categoryId : "other";
  document.querySelectorAll(".category-chip").forEach((button) => {
    button.classList.toggle("selected", button.dataset.category === selectedCategory);
  });
}

function renderTodayExpenses() {
  const todayExpenses = getExpensesForDate(selectedDateKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  els.todayExpensesList.innerHTML = "";

  if (!todayExpenses.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = state.config ? `No hay gastos registrados para ${getRelativeDayLabel(selectedDateKey).toLowerCase()}.` : "Configura tu presupuesto para comenzar.";
    els.todayExpensesList.append(empty);
    return;
  }

  todayExpenses.forEach((expense) => {
    const category = getCategory(expense.category);
    const item = document.createElement("article");
    item.className = "expense-item";
    item.innerHTML = `
      <strong>${formatCurrency(expense.amount)}</strong>
      <span class="expense-note"><span aria-hidden="true">${category.icon}</span> ${escapeHtml(category.label)}${expense.note ? ` · ${escapeHtml(expense.note)}` : ""}</span>
      <button class="edit-expense" type="button" data-edit-expense="${expense.id}" aria-label="Editar gasto">Editar</button>
      <button class="delete-expense" type="button" data-delete-expense="${expense.id}" aria-label="Eliminar gasto">×</button>
    `;
    els.todayExpensesList.append(item);
  });
}

function renderHistory(records) {
  els.historyList.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aún no hay historial.";
    els.historyList.append(empty);
    return;
  }

  records.forEach((record) => {
    const status = getVisualStatus(record.spent, record.available);
    const item = document.createElement("article");
    item.className = `history-item ${status.tone}`;
    item.innerHTML = `
      <div class="history-date">${formatShortDate(record.dateKey)}</div>
      <div class="history-status">${status.label}</div>
      <div class="history-details">
        <span>Disponible<strong>${formatCurrency(record.available)}</strong></span>
        <span>Gastado<strong>${formatCurrency(record.spent)}</strong></span>
        <span>Saldo<strong>${formatCurrency(record.balance)}</strong></span>
      </div>
    `;
    els.historyList.append(item);
  });
}

function showSettings(show) {
  els.setupPanel.hidden = !show;
  if (show) {
    syncSettingsForm();
    els.saveStatus.textContent = "";
    els.budgetAmount.focus();
  }
}

function showExpensePanel(show) {
  els.expensePanel.hidden = !show;
  if (show) {
    els.expenseDateLabel.textContent = `${getRelativeDayLabel(selectedDateKey)} · ${formatShortDate(selectedDateKey)}`;
    els.expenseTitle.textContent = editingExpenseId ? "Editar gasto" : "Registrar gasto";
    els.submitExpense.textContent = editingExpenseId ? "Guardar cambios" : "Registrar";
    els.clearExpenseEdit.hidden = !editingExpenseId;
    els.expenseAmount.focus();
  }
}

function clearExpenseForm() {
  editingExpenseId = null;
  selectedQuickAmount = null;
  selectedCategory = "other";
  els.expenseAmount.value = "";
  els.expenseNote.value = "";
  els.expenseTitle.textContent = "Registrar gasto";
  els.submitExpense.textContent = "Registrar";
  els.clearExpenseEdit.hidden = true;
  document.querySelectorAll(".quick-amount").forEach((item) => item.classList.remove("selected"));
  setSelectedCategory(selectedCategory);
}

function startEditExpense(id) {
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense) return;
  editingExpenseId = id;
  selectedDateKey = expense.dateKey;
  els.expenseAmount.value = String(expense.amount);
  els.expenseNote.value = expense.note || "";
  setSelectedCategory(expense.category || "other");
  document.querySelectorAll(".quick-amount").forEach((item) => item.classList.remove("selected"));
  updateInterface();
  showExpensePanel(true);
}

function updateDateHeader() {
  const label = getRelativeDayLabel(selectedDateKey);
  els.selectedDayLabel.textContent = label;
  els.selectedDateText.textContent = formatLongDate(selectedDateKey);
  els.expensesDayLabel.textContent = label;
  els.heroLabel.textContent = `Te queda ${label.toLowerCase()}`;
  els.previousDay.textContent = getRelativeDayLabel(toDateKey(addDays(new Date(`${selectedDateKey}T12:00:00`), -1)));
  els.nextDay.textContent = getRelativeDayLabel(toDateKey(addDays(new Date(`${selectedDateKey}T12:00:00`), 1)));
  els.jumpToday.hidden = selectedDateKey === getTodayKey();
}

function syncSettingsForm() {
  const config = state.config || { mode: "daily", amount: "", reminderTime: "20:30" };
  els.budgetModeSelect.value = config.mode || "daily";
  els.budgetAmount.value = config.amount || "";
  els.reminderTime.value = config.reminderTime || "20:30";
  updateAmountLabel();
}

function updateAmountLabel() {
  const labels = {
    daily: "Monto diario",
    weekly: "Monto semanal",
    monthly: "Monto mensual"
  };
  els.amountLabel.textContent = labels[els.budgetModeSelect.value] || "Monto";
}

function showSaveStatus(message, isError = false) {
  els.saveStatus.textContent = message;
  els.saveStatus.classList.toggle("error", isError);
}

function getVisualStatus(spent, available) {
  const ratio = available > 0 ? spent / available : 1;
  if (ratio <= 0.7) {
    return {
      label: "Bien",
      tone: "good",
      color: "var(--teal)",
      message: "Vas bien, todavía tienes margen."
    };
  }
  if (ratio <= 1) {
    return {
      label: "Ojo",
      tone: "warning",
      color: "var(--amber)",
      message: "Ojo, ya usaste gran parte de tu presupuesto."
    };
  }
  return {
    label: "Excedido",
    tone: "danger",
    color: "var(--red)",
    message: "Te pasaste hoy; mañana partirás con menos disponible."
  };
}

function getExpensesForDate(dateKey) {
  return state.expenses.filter((expense) => expense.dateKey === dateKey);
}

function emptyRecord(dateKey) {
  return { dateKey, base: 0, carry: 0, available: 0, spent: 0, balance: 0 };
}

function parseAmount(value) {
  const clean = String(value || "").replace(/[^\d]/g, "");
  return Number(clean);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(Math.round(value || 0));
}

function formatLongDate(dateKey) {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatShortDate(dateKey) {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(new Date(`${dateKey}T12:00:00`));
}

function getRelativeDayLabel(dateKey) {
  const today = getTodayKey();
  const yesterday = toDateKey(addDays(new Date(), -1));
  const tomorrow = toDateKey(addDays(new Date(), 1));
  if (dateKey === today) return "Hoy";
  if (dateKey === yesterday) return "Ayer";
  if (dateKey === tomorrow) return "Mañana";
  return new Intl.DateTimeFormat("es-CL", { weekday: "long" }).format(new Date(`${dateKey}T12:00:00`));
}

function getTodayKey() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDaysInMonth(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCategory(categoryId) {
  return CATEGORIES.find((category) => category.id === categoryId) || CATEGORIES.find((category) => category.id === "other");
}

function isUsableId(id) {
  return typeof id === "string" && id.length >= 8;
}

function maybeShowReminder(today) {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  const reminderTime = state.config.reminderTime || "20:30";
  const reminderKey = `${getTodayKey()}:${reminderTime}`;

  if (currentTime < reminderTime || localStorage.getItem("presupuesto-diario:last-reminder") === reminderKey) return;

  localStorage.setItem("presupuesto-diario:last-reminder", reminderKey);

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Presupuesto diario", {
      body: `Hoy has gastado ${formatCurrency(today.spent)} y te quedan ${formatCurrency(today.balance)}.`
    });
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}
