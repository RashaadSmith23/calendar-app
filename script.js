/* ============================================================
   FLOWCAL – RESPONSIVE CALENDAR  (auto‑save + undo + remove event)
   ============================================================ */

// ---------- STATE ----------
let eventsMap = new Map();
let currentYear;
let currentMonth;
let selectedDateStr = "";
let toastTimeout = null;
let lastDeleted = null;
let touchStartX = 0;
let touchStartY = 0;

const STORAGE_KEY = "flowcal_events_v3";
const THEME_KEY = "flowcal_theme";

// ---------- DOM REFS ----------
const daysGrid        = document.getElementById("daysGrid");
const monthYearDisplay= document.getElementById("monthYearDisplay");
const weekdaysEl      = document.getElementById("weekdays");
const liveDateText    = document.getElementById("liveDateText");
const saveStatus      = document.getElementById("saveStatus");
const eventListContainer = document.getElementById("eventListContainer");
const selectedDayTitle   = document.getElementById("selectedDayTitle");
const eventForm       = document.getElementById("eventForm");
const eventTitleInput = document.getElementById("eventTitleInput");
const eventDateInput  = document.getElementById("eventDateInput");
const eventTimeInput  = document.getElementById("eventTimeInput");
const sidebar         = document.getElementById("sidebar");
const backdrop        = document.getElementById("backdrop");
const fabAdd          = document.getElementById("fabAdd");
const closeSidebar    = document.getElementById("closeSidebar");
const themeToggle     = document.getElementById("themeToggle");
const toast           = document.getElementById("toast");
const toastMsg        = document.getElementById("toastMsg");
const toastAction     = document.getElementById("toastAction");
const calendarMain    = document.getElementById("calendarMain");

// ---------- HELPERS ----------
function formatDateToYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYMD(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, (m) => {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ---------- TOAST ----------
function showToast(message, type = "success", actionLabel = null, actionFn = null) {
  clearTimeout(toastTimeout);

  toastMsg.textContent = message;
  toast.dataset.type = type;

  if (actionLabel && actionFn) {
    toastAction.hidden = false;
    toastAction.textContent = actionLabel;
    toastAction.onclick = () => {
      actionFn();
      hideToast();
    };
  } else {
    toastAction.hidden = true;
    toastAction.onclick = null;
  }

  toast.classList.add("show");
  toastTimeout = setTimeout(hideToast, 3500);
}

function hideToast() {
  toast.classList.remove("show");
  clearTimeout(toastTimeout);
}

// ---------- SAVE INDICATOR ----------
let saveIndicatorTimeout = null;
function flashSaveIndicator() {
  if (!saveStatus) return;
  saveStatus.style.background = "#10b981";
  saveStatus.style.opacity = "1";
  saveStatus.textContent = "💾 Saved";
  clearTimeout(saveIndicatorTimeout);
  saveIndicatorTimeout = setTimeout(() => {
    if (saveStatus) {
      saveStatus.style.background = "";
      saveStatus.style.opacity = "1";
      saveStatus.textContent = "💾 Saved";
    }
  }, 1500);
}

// ---------- PERSISTENCE ----------
function persistToLocalStorage() {
  const obj = {};
  for (const [key, val] of eventsMap.entries()) {
    obj[key] = val;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  flashSaveIndicator();
}

function loadEventsFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      eventsMap.clear();
      for (const [dateStr, eventsArr] of Object.entries(parsed)) {
        eventsMap.set(dateStr, eventsArr);
      }
    } catch (e) {
      console.warn("Failed to parse stored events", e);
    }
  }

  if (eventsMap.size === 0) {
    const today = new Date();
    const d1 = new Date(today); d1.setDate(today.getDate() + 2);
    const d2 = new Date(today); d2.setDate(today.getDate() + 5);
    const s1 = formatDateToYMD(d1);
    const s2 = formatDateToYMD(d2);
    const s0 = formatDateToYMD(today);

    addEventToMap(s1, { title: "✨ Team sync", time: "10:30", id: Date.now() + 1 }, false);
    addEventToMap(s2, { title: "🎂 Birthday dinner", time: "19:00", id: Date.now() + 2 }, false);
    addEventToMap(s0, { title: "📝 Plan week", time: "09:00", id: Date.now() + 3 }, false);
    persistToLocalStorage();
    showToast("Sample events loaded & saved", "info");
  }
}

// ---------- EVENT MAP OPERATIONS ----------
function addEventToMap(dateKey, eventObj, save = true) {
  if (!eventsMap.has(dateKey)) eventsMap.set(dateKey, []);
  const arr = eventsMap.get(dateKey);
  if (!eventObj.id) eventObj.id = Date.now() + Math.random() * 10000;
  arr.push(eventObj);
  eventsMap.set(dateKey, arr);
  if (save) {
    persistToLocalStorage();
    showToast(`Event "${eventObj.title}" added`, "success");
  }
  return eventObj;
}

function deleteEventFromMap(dateKey, eventId, eventTitle = "Event") {
  if (!eventsMap.has(dateKey)) return;
  const arr = eventsMap.get(dateKey);
  const index = arr.findIndex((ev) => ev.id == eventId);
  if (index === -1) return;

  lastDeleted = { dateKey, event: arr[index], index };
  arr.splice(index, 1);
  if (arr.length === 0) eventsMap.delete(dateKey);
  else eventsMap.set(dateKey, arr);

  persistToLocalStorage();
  showToast(`"${eventTitle}" removed`, "error", "Undo", undoDelete);
}

function undoDelete() {
  if (!lastDeleted) return;
  const { dateKey, event, index } = lastDeleted;
  if (!eventsMap.has(dateKey)) eventsMap.set(dateKey, []);
  const arr = eventsMap.get(dateKey);
  arr.splice(index, 0, event);
  eventsMap.set(dateKey, arr);
  persistToLocalStorage();
  lastDeleted = null;
  renderCalendar();
  selectDate(selectedDateStr || dateKey);
  showToast("Event restored", "success");
}

// ---------- RENDER CALENDAR ----------
function renderCalendar() {
  const firstDay = new Date(currentYear, currentMonth, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevMonthDate = new Date(currentYear, currentMonth, 0);
  const daysInPrevMonth = prevMonthDate.getDate();
  const todayYMD = formatDateToYMD(new Date());

  daysGrid.innerHTML = "";

  for (let i = 0; i < 42; i++) {
    let cellDate, displayDay, isCurrentMonth = false;

    if (i < startWeekday) {
      displayDay = daysInPrevMonth - (startWeekday - i) + 1;
      let pm = currentMonth - 1, py = currentYear;
      if (pm < 0) { pm = 11; py--; }
      cellDate = new Date(py, pm, displayDay);
    } else if (i >= startWeekday + daysInMonth) {
      displayDay = i - (startWeekday + daysInMonth) + 1;
      let nm = currentMonth + 1, ny = currentYear;
      if (nm > 11) { nm = 0; ny++; }
      cellDate = new Date(ny, nm, displayDay);
    } else {
      displayDay = i - startWeekday + 1;
      cellDate = new Date(currentYear, currentMonth, displayDay);
      isCurrentMonth = true;
    }

    const cellYMD = formatDateToYMD(cellDate);
    const events = eventsMap.get(cellYMD) || [];

    const dayDiv = document.createElement("div");
    dayDiv.className = "day-cell";
    dayDiv.setAttribute("role", "gridcell");
    dayDiv.setAttribute("tabindex", "-1");
    dayDiv.dataset.date = cellYMD;

    if (!isCurrentMonth) dayDiv.classList.add("other-month");
    if (cellYMD === todayYMD) dayDiv.classList.add("today-highlight");
    if (cellYMD === selectedDateStr) dayDiv.classList.add("selected");

    const numSpan = document.createElement("div");
    numSpan.className = "day-number";
    numSpan.textContent = displayDay;
    dayDiv.appendChild(numSpan);

    if (events.length > 0) {
      const list = document.createElement("div");
      list.className = "event-list";
      events.slice(0, 2).forEach((ev) => {
        const badge = document.createElement("span");
        badge.className = "event-badge";
        badge.textContent = ev.time ? `${ev.title} · ${formatTime(ev.time)}` : ev.title;
        list.appendChild(badge);
      });
      if (events.length > 2) {
        const more = document.createElement("span");
        more.className = "event-badge";
        more.textContent = `+${events.length - 2} more`;
        list.appendChild(more);
      }
      dayDiv.appendChild(list);
    }

    dayDiv.addEventListener("click", () => selectDate(cellYMD));
    daysGrid.appendChild(dayDiv);
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  monthYearDisplay.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  liveDateText.textContent = new Date().toDateString();

  if (selectedDateStr) {
    const sel = daysGrid.querySelector(`[data-date="${selectedDateStr}"]`);
    if (sel) sel.classList.add("selected");
  }
}

// ---------- SELECT DATE ----------
function selectDate(dateYMD) {
  selectedDateStr = dateYMD;

  daysGrid.querySelectorAll(".day-cell").forEach((cell) => {
    cell.classList.toggle("selected", cell.dataset.date === dateYMD);
  });

  refreshEventPanel(dateYMD);
  eventDateInput.value = dateYMD;

  if (window.innerWidth < 1024) {
    openSidebar();
  }
}

// ---------- EVENT PANEL ----------
function refreshEventPanel(dateYMD) {
  const events = eventsMap.get(dateYMD) || [];
  const dateObj = parseYMD(dateYMD);
  const pretty = dateObj.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric"
  });

  selectedDayTitle.textContent = pretty;

  if (events.length === 0) {
    eventListContainer.innerHTML = `<div class="no-events">✨ No events — add one below</div>`;
    return;
  }

  const sorted = [...events].sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  const fragment = document.createDocumentFragment();
  sorted.forEach((ev) => {
    const item = document.createElement("div");
    item.className = "event-item";

    const info = document.createElement("div");
    info.className = "event-info";
    info.innerHTML = `
      <strong>${escapeHtml(ev.title)}</strong>
      ${ev.time ? `<span class="event-time">⏰ ${formatTime(ev.time)}</span>` : ""}
    `;

    const del = document.createElement("button");
    del.className = "delete-event";
    del.textContent = "✕";
    del.title = "Delete event";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteEventFromMap(dateYMD, ev.id, ev.title);
      refreshEventPanel(dateYMD);
      renderCalendar();
    });

    item.appendChild(info);
    item.appendChild(del);
    fragment.appendChild(item);
  });

  eventListContainer.innerHTML = "";
  eventListContainer.appendChild(fragment);
}

// ---------- ADD EVENT ----------
function addNewEvent(e) {
  e.preventDefault();

  const title = eventTitleInput.value.trim();
  const dateVal = eventDateInput.value;
  const timeVal = eventTimeInput.value || "";

  if (!title) {
    showToast("Please enter a title", "error");
    eventTitleInput.focus();
    return;
  }
  if (!dateVal) {
    showToast("Please select a date", "error");
    eventDateInput.focus();
    return;
  }

  addEventToMap(dateVal, {
    title,
    time: timeVal,
    id: Date.now() + Math.random() * 10000,
  });

  eventTitleInput.value = "";
  eventTimeInput.value = "";
  eventTitleInput.focus();

  renderCalendar();
  selectDate(dateVal);

  if (window.innerWidth < 1024) {
    closeSidebarFn();
  }
}

// ---------- REMOVE EVENT (the new primary action) ----------
function removeEvent() {
  // Determine which date we're working with
  const dateVal = eventDateInput.value || selectedDateStr;

  if (!dateVal) {
    showToast("Please select a date first", "error");
    return;
  }

  const events = eventsMap.get(dateVal) || [];
  if (events.length === 0) {
    showToast("No events to remove on this day", "error");
    return;
  }

  const titleVal = eventTitleInput.value.trim();
  let targetEvent = null;

  if (titleVal) {
    // 1) Exact (case-insensitive) title match
    targetEvent = events.find(
      (ev) => ev.title.toLowerCase() === titleVal.toLowerCase()
    );

    // 2) Fallback: partial match
    if (!targetEvent) {
      targetEvent = events.find(
        (ev) => ev.title.toLowerCase().includes(titleVal.toLowerCase())
      );
    }

    if (!targetEvent) {
      showToast(`No event matching "${titleVal}" found`, "error");
      return;
    }
  } else {
    // No title given — remove the last event on that day
    targetEvent = events[events.length - 1];
  }

  deleteEventFromMap(dateVal, targetEvent.id, targetEvent.title);

  // Clear title so the user sees the action took place
  eventTitleInput.value = "";
  eventTimeInput.value = "";
  eventTitleInput.focus();

  refreshEventPanel(dateVal);
  renderCalendar();
}

// ---------- MONTH NAVIGATION ----------
function previousMonth() {
  let m = currentMonth - 1, y = currentYear;
  if (m < 0) { m = 11; y--; }
  currentMonth = m;
  currentYear = y;
  renderCalendar();
  if (selectedDateStr) {
    const sel = daysGrid.querySelector(`[data-date="${selectedDateStr}"]`);
    if (!sel) {
      selectedDateStr = "";
      refreshEventPanel("");
      selectedDayTitle.textContent = "—";
    }
  }
}

function nextMonth() {
  let m = currentMonth + 1, y = currentYear;
  if (m > 11) { m = 0; y++; }
  currentMonth = m;
  currentYear = y;
  renderCalendar();
  if (selectedDateStr) {
    const sel = daysGrid.querySelector(`[data-date="${selectedDateStr}"]`);
    if (!sel) {
      selectedDateStr = "";
      refreshEventPanel("");
      selectedDayTitle.textContent = "—";
    }
  }
}

function goToToday() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  renderCalendar();
  selectDate(formatDateToYMD(now));
  showToast("Jumped to today", "info");
}

// ---------- SIDEBAR (MOBILE) ----------
function openSidebar() {
  sidebar.classList.add("open");
  backdrop.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeSidebarFn() {
  sidebar.classList.remove("open");
  backdrop.classList.remove("show");
  document.body.style.overflow = "";
}

// ---------- THEME ----------
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.dataset.theme = saved;
  themeToggle.textContent = saved === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, next);
}

// ---------- SWIPE ----------
function initSwipe() {
  calendarMain.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  calendarMain.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].screenX - touchStartX;
    const dy = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) nextMonth();
      else previousMonth();
    }
  }, { passive: true });
}

// ---------- KEYBOARD NAV ----------
function initKeyboard() {
  daysGrid.addEventListener("keydown", (e) => {
    const focused = document.activeElement;
    if (!focused || !focused.classList.contains("day-cell")) return;

    const date = focused.dataset.date;
    if (!date) return;
    let d = parseYMD(date);
    let handled = true;

    switch (e.key) {
      case "ArrowRight": d.setDate(d.getDate() + 1); break;
      case "ArrowLeft":  d.setDate(d.getDate() - 1); break;
      case "ArrowDown":  d.setDate(d.getDate() + 7); break;
      case "ArrowUp":    d.setDate(d.getDate() - 7); break;
      case "Enter":
      case " ":
        selectDate(date);
        e.preventDefault();
        return;
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      const newYMD = formatDateToYMD(d);
      if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) {
        currentMonth = d.getMonth();
        currentYear = d.getFullYear();
        renderCalendar();
      }
      const nextCell = daysGrid.querySelector(`[data-date="${newYMD}"]`);
      if (nextCell) {
        nextCell.setAttribute("tabindex", "0");
        nextCell.focus();
        nextCell.setAttribute("tabindex", "-1");
      }
    }
  });
}

// ---------- WEEKDAY HEADERS ----------
function renderWeekdays() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  weekdaysEl.innerHTML = days.map((d) => `<span>${d}</span>`).join("");
}

// ---------- INIT ----------
function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  initTheme();
  renderWeekdays();
  loadEventsFromStorage();
  renderCalendar();

  const todayYMD = formatDateToYMD(now);
  selectDate(todayYMD);
  eventDateInput.value = todayYMD;

  // listeners
  document.getElementById("prevMonthBtn").addEventListener("click", previousMonth);
  document.getElementById("nextMonthBtn").addEventListener("click", nextMonth);
  document.getElementById("todayBtn").addEventListener("click", goToToday);

  // Form: Add (submit) + Remove (button click)
  eventForm.addEventListener("submit", addNewEvent);
  document.getElementById("removeEventBtn").addEventListener("click", removeEvent);

  themeToggle.addEventListener("click", toggleTheme);

  // mobile sidebar
  fabAdd.addEventListener("click", openSidebar);
  closeSidebar.addEventListener("click", closeSidebarFn);
  backdrop.addEventListener("click", closeSidebarFn);

  initSwipe();
  initKeyboard();

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 1024) {
      closeSidebarFn();
    }
  });
}

init();