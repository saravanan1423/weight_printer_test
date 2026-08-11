const fields = {
  serialNo: document.querySelector("#serialNo"),
  refNo: document.querySelector("#refNo"),
  date: document.querySelector("#entryDate"),
  time: document.querySelector("#entryTime"),
  grossEntryDate: document.querySelector("#grossEntryDate"),
  grossEntryTime: document.querySelector("#grossEntryTime"),
  tareEntryDate: document.querySelector("#tareEntryDate"),
  tareEntryTime: document.querySelector("#tareEntryTime"),
  vehicleNo: document.querySelector("#vehicleNo"),
  vehicleType: document.querySelector("#vehicleType"),
  mobileNo: document.querySelector("#mobileNo"),
  weighingType: document.querySelector("#weighingType"),
  customer: document.querySelector("#customer"),
  material: document.querySelector("#material"),
  charge1: document.querySelector("#charge1"),
  charge2: document.querySelector("#charge2"),
  paymentMode: document.querySelector("#paymentMode"),
  gross: document.querySelector("#grossWeight"),
  tare: document.querySelector("#tareWeight"),
  net: document.querySelector("#netWeight"),
  grossDisplay: document.querySelector("#grossWeightDisplay"),
  tareDisplay: document.querySelector("#tareWeightDisplay"),
  netDisplay: document.querySelector("#netWeightDisplay")
};

const form = document.querySelector("#weighmentForm");
const saveButton = form.querySelector('button[type="submit"]');
const cameraDuo = document.querySelector("#cameraDuo");
const vehicleStatus = document.querySelector("#vehicleStatus");
const vehicleFilter = document.querySelector("#vehicleFilter");
const materialFilter = document.querySelector("#materialFilter");
const customerFilter = document.querySelector("#customerFilter");
const mobileFilter = document.querySelector("#mobileFilter");
const vehicleTypeBadge = document.querySelector("#vehicleTypeBadge");
const liveWeightValue = document.querySelector("#liveWeightValue");
const liveWeightTitle = document.querySelector("#liveWeightTitle");
const liveWeightCard = document.querySelector(".live-weight");
const chargeRow = document.querySelector("#chargeRow");
const prevButton = document.querySelector("#prevBtn");
const nextButton = document.querySelector("#nextBtn");
const visitStageButtons = Array.from(document.querySelectorAll("[data-visit-stage]"));
const previousWeighmentModal = document.querySelector("#previousWeighmentModal");
const previousWeighmentClose = document.querySelector("#previousWeighmentClose");
const previousWeighmentRows = document.querySelector("#previousWeighmentRows");
const SCALE_LIVE_WORKER_URL = "/static/js/weightment_live_worker.js?v=20260701-1";
const SCALE_DISCONNECT_FAILURE_THRESHOLD = 3;
const PRINTER_DRAFT_STORAGE_KEY = "weighman:printer-draft";
const EMPTY_MATERIAL = "EMPTY";
const saveButtonDefaultLabel = saveButton.textContent.trim() || "Save";
const pageSearchParams = new URLSearchParams(window.location.search);
const openNewEntryOnLoad = pageSearchParams.get("new") === "1";

const masterUrls = {
  vehicles: "/master/api/vehicles",
  vehicleTypes: "/master/api/vehicle-types",
  materials: "/master/api/materials",
  customers: "/master/api/customers"
};
const adminSettingsApiUrl = "/settings/api/admin";
const customFieldSettingsApiUrl = "/settings/api/custom-fields";
const cameraApiUrl = "/settings/api/cameras";
const masterPages = {
  vehicle: "/master/vehicle-number",
  material: "/master/material",
  customer: "/master/customer"
};
const vehicleRecords = [];
const vehicleTypeRecords = [];
const materialRecords = [];
const customerRecords = [];
let registeredReadOnly = false;
let dashboardCameras = [];
let currentWeighmentEntry = null;
let currentVehicleVisitEntry = null;
let selectedPreviousVisitEntry = null;
let currentVehicleVisitMode = "";
let selectedVisitStage = "first";
let vehicleVisitLookupToken = 0;
let activePreviousWeighmentPromptFinish = null;
let currentLiveWeightValue = "";
let consecutiveScaleReadFailures = 0;
let masterTareDecisionMade = false;
let applyMasterTareForCycle = false;
let appliedMasterTareValue = "";
let tareEditEnabled = false;
let vehicleRegistrationPromptActive = false;
let rfidEnabled = true;
let tareWeightEnabled = true;
let liveWeightEnabled = liveWeightCard?.dataset.liveWeightEnabled !== "false";
const activePrinterType = liveWeightCard?.dataset.printerType || "";
const activePrinterName = liveWeightCard?.dataset.printerName || "";
const directPrintEnabled = liveWeightCard?.dataset.directPrint !== "false";
let scaleLiveWorker = null;
let scaleLiveFallbackTimer = null;
let scaleLiveFallbackBusy = false;
let hasPreviousWeighmentRecord = false;
let hasNextWeighmentRecord = false;
const lastSyncedVehicleTareWeights = new Map();
const pendingVehicleTareSyncs = new Set();
const requiredWeighmentFields = [
  ["serialNo", "S.No is required"],
  ["refNo", "Ref No is required"],
  ["date", "Date is required"],
  ["time", "Time is required"],
  ["vehicleNo", "Vehicle number is required"],
  ["weighingType", "Weighing type is required"],
  ["paymentMode", "Payment mode is required"]
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatNumber(value) {
  return String(Number(value || 0));
}

function hasNumericValue(value) {
  return value !== "" && value !== null && value !== undefined && !Number.isNaN(Number(value));
}

function formatWeightDisplay(value) {
  return hasNumericValue(value) ? formatNumber(value) : "--";
}

function syncEntryWeightWidth(input) {
  if (!input) return;
  const text = String(input.value || "--");
  const width = Math.min(Math.max(text.length + 1, 3), 12);
  input.style.setProperty("--entry-weight-width", `${width}ch`);
}

function normalizeText(value) {
  return (value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function sanitizeMobileNumber(value) {
  return (value || "").replace(/\D/g, "").slice(0, 10);
}

function splitMobileNumberEntry(value) {
  const [primaryPart = "", secondaryPart = ""] = String(value || "")
    .split(",")
    .map(part => part.trim());
  const primary = sanitizeMobileNumber(primaryPart);
  const secondary = sanitizeMobileNumber(secondaryPart);
  return { primary, secondary };
}

function normalizeMobileNumberEntry(value) {
  const raw = String(value || "");
  const hasComma = raw.includes(",");
  const { primary, secondary } = splitMobileNumberEntry(raw);
  if (hasComma && !secondary) {
    return primary ? `${primary},` : ",";
  }
  return secondary ? `${primary},${secondary}` : primary;
}

function formatDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

function normalizeDateForApi(value) {
  const text = String(value || "").trim();
  if (!text) return formatDateInput(new Date());
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return text;
  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }
  return text;
}

function formatShortDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${String(value.getFullYear()).slice(-2)}`;
  }

  const text = String(value).trim();
  const parts = text.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${String(year).slice(-2)}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${String(parsed.getFullYear()).slice(-2)}`;
  }

  return text;
}

function formatFullDate(value) {
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${slashMatch[1].padStart(2, "0")}/${slashMatch[2].padStart(2, "0")}/${year}`;
  }
  return text || "--";
}

function setDateTime() {
  const now = new Date();

  fields.date.value = formatDateInput(now);
  fields.grossEntryDate.value = formatShortDate(now);
  fields.tareEntryDate.value = fields.grossEntryDate.value;
  updateCurrentTime(now);
}

function ensureWeightMetaVisible() {
  if (!fields.grossEntryDate.value) {
    fields.grossEntryDate.value = fields.date.value ? formatShortDate(fields.date.value) : formatShortDate(new Date());
  }
  if (!fields.tareEntryDate.value) {
    fields.tareEntryDate.value = fields.grossEntryDate.value;
  }
}

function updateCurrentTime(date = new Date()) {
  if (registeredReadOnly) return;

  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12;

  fields.time.value = `${pad(hours)}:${minutes} ${ampm}`;
}

function registeredEditableFields() {
  return [
    fields.vehicleNo,
    fields.mobileNo,
    fields.weighingType,
    fields.customer,
    fields.material,
    fields.charge1,
    fields.charge2,
    fields.paymentMode,
    ...document.querySelectorAll(".extra-fields-body input[name]")
  ];
}

function setChargeFieldState() {
  fields.charge1.readOnly = false;
  fields.charge2.value = "0";
}

function setRegisteredReadOnly(isReadOnly) {
  registeredReadOnly = isReadOnly;
  registeredEditableFields().forEach(field => {
    field.disabled = isReadOnly || field.dataset.configDisabled === "true";
  });
  saveButton.disabled = isReadOnly;
  visitStageButtons.forEach(button => {
    button.disabled = isReadOnly;
  });
  form.classList.toggle("registered-readonly", isReadOnly);
  syncManualWeightInputState();
  hideAllFilters();
}

function startClock() {
  updateCurrentTime();
  window.setInterval(updateCurrentTime, 1000);
}

function syncWeightTimestampFromForm(targetDateField, targetTimeField) {
  targetDateField.value = formatShortDate(fields.date.value || new Date());
  targetTimeField.value = fields.time.value || "";
}

function syncGrossTimestampFromForm() {
  syncWeightTimestampFromForm(fields.grossEntryDate, fields.grossEntryTime);
}

function syncTareTimestampFromForm() {
  syncWeightTimestampFromForm(fields.tareEntryDate, fields.tareEntryTime);
}

function calculateChargeTotal() {
  const charge1 = hasNumericValue(fields.charge1.value) ? Number(fields.charge1.value) : 0;
  const charge2 = hasNumericValue(fields.charge2.value) ? Number(fields.charge2.value) : 0;
  const total = charge1 + charge2;
  return { charge1, charge2, total };
}

function formatChargeInputValue(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim();
  return Number(text) === 0 ? "" : text;
}

function setWeighmentNavigationState({ hasPrevious = false, hasNext = false } = {}) {
  hasPreviousWeighmentRecord = Boolean(hasPrevious);
  hasNextWeighmentRecord = Boolean(hasNext);
  if (prevButton) {
    prevButton.disabled = !hasPreviousWeighmentRecord;
    prevButton.setAttribute("aria-disabled", String(!hasPreviousWeighmentRecord));
  }
  if (nextButton) {
    nextButton.disabled = !hasNextWeighmentRecord;
    nextButton.setAttribute("aria-disabled", String(!hasNextWeighmentRecord));
  }
}

async function syncActiveWeightFieldFromLive() {
  const liveValue = liveWeightEnabled ? String(currentLiveWeightValue || "").trim() : "";
  const visitEntry = currentVehicleVisitEntry;
  const selectedWeight = currentVehicleVisitMode === "second" ? previousEntryWeight(visitEntry) : null;

  if (isFullLoadSelected()) {
    if (tareEditEnabled && hasNumericValue(fields.tare.value)) {
      if (!fields.tareEntryDate.value || !fields.tareEntryTime.value) {
        syncTareTimestampFromForm();
      }
    } else if (selectedWeight && hasNumericValue(selectedWeight.value)) {
      fields.tare.value = formatTareWeight(selectedWeight.value);
      fields.tareEntryDate.value = formatShortDate(selectedWeight.date || fields.tareEntryDate.value);
      fields.tareEntryTime.value = selectedWeight.time || fields.tareEntryTime.value;
    } else if (visitEntry && normalizeText(visitEntry.weighingType) === "EMPTY" && hasNumericValue(visitEntry.tareWeight)) {
      fields.tare.value = formatTareWeight(visitEntry.tareWeight);
      fields.tareEntryDate.value = formatShortDate(visitEntry.tareDate || fields.tareEntryDate.value);
      fields.tareEntryTime.value = visitEntry.tareTime || fields.tareEntryTime.value;
    } else if (applyMasterTareForCycle && hasNumericValue(appliedMasterTareValue)) {
      fields.tare.value = appliedMasterTareValue;
      if (!fields.tareEntryDate.value || !fields.tareEntryTime.value) {
        syncTareTimestampFromForm();
      }
    } else if (isManualWeightMode() && hasNumericValue(fields.tare.value)) {
      syncTareTimestampFromForm();
    } else {
      fields.tare.value = "";
      fields.tareEntryDate.value = "";
      fields.tareEntryTime.value = "";
    }
    if (liveValue && !fields.gross.value.trim()) {
      fields.gross.value = liveValue;
    }
    if (fields.gross.value.trim()) {
      syncGrossTimestampFromForm();
    }
    return;
  }

  if (isEmptyLoadSelected()) {
    if (selectedWeight && hasNumericValue(selectedWeight.value)) {
      fields.gross.value = formatTareWeight(selectedWeight.value);
      fields.grossEntryDate.value = formatShortDate(selectedWeight.date || fields.grossEntryDate.value);
      fields.grossEntryTime.value = selectedWeight.time || fields.grossEntryTime.value;
    } else if (visitEntry && normalizeText(visitEntry.weighingType) === "FULL LOAD" && hasNumericValue(visitEntry.grossWeight)) {
      fields.gross.value = formatTareWeight(visitEntry.grossWeight);
      fields.grossEntryDate.value = formatShortDate(visitEntry.grossDate || fields.grossEntryDate.value);
      fields.grossEntryTime.value = visitEntry.grossTime || fields.grossEntryTime.value;
    } else {
      fields.gross.value = "";
      fields.grossEntryDate.value = "";
      fields.grossEntryTime.value = "";
    }
    if (liveValue) {
      fields.tare.value = liveValue;
    }
    if (fields.tare.value.trim()) {
      syncTareTimestampFromForm();
    }
  }
}

function setLiveWeightDisplay(value) {
  const displayValue = formatWeightDisplay(value);
  currentLiveWeightValue = displayValue === "--" ? "" : displayValue;
  liveWeightValue.textContent = displayValue;
}

function clearLiveWeightDisplay() {
  currentLiveWeightValue = "";
  liveWeightValue.textContent = "--";
}

function isManualWeightMode() {
  return !liveWeightEnabled;
}

function manualWeightDisplayValue() {
  if (isFullLoadSelected() && hasNumericValue(fields.gross.value)) return fields.gross.value;
  if (isEmptyLoadSelected() && hasNumericValue(fields.tare.value)) return fields.tare.value;
  if (hasNumericValue(fields.gross.value)) return fields.gross.value;
  if (hasNumericValue(fields.tare.value)) return fields.tare.value;
  return "";
}

function updateManualWeightDisplay() {
  if (!isManualWeightMode()) return;
  setLiveWeightDisplay(manualWeightDisplayValue());
}

function syncManualWeightInputState() {
  const manualMode = isManualWeightMode();
  const grossItem = fields.gross.closest(".weight-entry-item");
  const tareItem = fields.tare.closest(".weight-entry-item");
  fields.gross.readOnly = registeredReadOnly || !manualMode || !isFullLoadSelected();
  grossItem?.classList.toggle("manual-weight-editable", !fields.gross.readOnly && isFullLoadSelected());
  if (manualMode) {
    const tareEditable = isEmptyLoadSelected();
    fields.tare.readOnly = registeredReadOnly || !tareEditable;
    tareItem?.classList.toggle("manual-weight-editable", !fields.tare.readOnly && tareEditable);
    setTareEditMode(!fields.tare.readOnly && tareEditable);
  } else {
    grossItem?.classList.remove("manual-weight-editable");
    tareItem?.classList.remove("manual-weight-editable");
  }
}

function applyWeightCaptureMode() {
  const manualMode = isManualWeightMode();
  if (liveWeightTitle) liveWeightTitle.textContent = manualMode ? "Manual Weight" : "Live Weight";
  liveWeightCard?.classList.toggle("manual-weight", manualMode);
  if (manualMode) {
    stopLiveWeightUpdates();
    syncManualWeightInputState();
    updateManualWeightDisplay();
  } else {
    syncManualWeightInputState();
    startLiveWeightUpdates();
  }
}

function handleScaleLiveUpdate(detail = {}) {
  if (!liveWeightEnabled) return;
  const rawValue = String(detail.value ?? "").trim();
  if (detail.status !== "success" || rawValue === "--" || rawValue === "") {
    consecutiveScaleReadFailures += 1;
    if (consecutiveScaleReadFailures >= SCALE_DISCONNECT_FAILURE_THRESHOLD) {
      clearLiveWeightDisplay();
    }
    return;
  }

  consecutiveScaleReadFailures = 0;
  applyScaleValue(detail.value);
}

async function fetchLiveWeightOnce() {
  if (!liveWeightEnabled) return;
  if (scaleLiveFallbackBusy) return;
  scaleLiveFallbackBusy = true;

  try {
    const response = await fetch("/settings/api/communication/live", {
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    document.dispatchEvent(new CustomEvent("scale-live-update", { detail: result }));
    handleScaleLiveUpdate(result);
  } catch (error) {
    const disconnected = {
      status: "not_connected",
      value: "--",
      message: error.message || "Failed to read scale"
    };
    document.dispatchEvent(new CustomEvent("scale-live-update", { detail: disconnected }));
    handleScaleLiveUpdate(disconnected);
  } finally {
    scaleLiveFallbackBusy = false;
  }
}

function stopLiveWeightUpdates() {
  if (scaleLiveWorker) {
    scaleLiveWorker.postMessage({ type: "stop" });
    scaleLiveWorker.terminate();
    scaleLiveWorker = null;
  }

  if (scaleLiveFallbackTimer) {
    window.clearInterval(scaleLiveFallbackTimer);
    scaleLiveFallbackTimer = null;
  }
}

function startLiveWeightFallback() {
  stopLiveWeightUpdates();
  fetchLiveWeightOnce();
  scaleLiveFallbackTimer = window.setInterval(fetchLiveWeightOnce, 1000);
}

function startLiveWeightUpdates() {
  stopLiveWeightUpdates();
  if (!liveWeightEnabled) {
    clearLiveWeightDisplay();
    return;
  }

  if (!("Worker" in window)) {
    startLiveWeightFallback();
    return;
  }

  try {
    scaleLiveWorker = new Worker(SCALE_LIVE_WORKER_URL);
    scaleLiveWorker.addEventListener("message", event => {
      if (event.data?.type !== "scale-live-update") return;
      document.dispatchEvent(new CustomEvent("scale-live-update", { detail: event.data.detail || {} }));
      handleScaleLiveUpdate(event.data.detail || {});
    });
    scaleLiveWorker.addEventListener("error", () => {
      startLiveWeightFallback();
    });
  } catch (error) {
    startLiveWeightFallback();
  }
}

function clearVehicleTareSyncCache() {
  lastSyncedVehicleTareWeights.clear();
  pendingVehicleTareSyncs.clear();
}

async function syncVehicleMasterTare(record, tareWeight) {
  if (!tareWeightEnabled) return;
  if (!record || !hasNumericValue(tareWeight)) return;
  const cleanTareWeight = Number(tareWeight);

  const cacheKey = String(record.id || record.vehicleNumber || "");
  if (pendingVehicleTareSyncs.has(cacheKey)) return;
  const lastSyncedTare = lastSyncedVehicleTareWeights.get(cacheKey);
  if (lastSyncedTare === cleanTareWeight) return;

  pendingVehicleTareSyncs.add(cacheKey);
  try {
    const response = await fetch(`${masterUrls.vehicles}/${record.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        vehicleNumber: record.vehicleNumber,
        rfiNumber: record.rfiNumber || null,
        tareWeight: cleanTareWeight,
        vehicleTypeName: record.vehicleTypeName || "",
        vehicleTypeId: record.vehicleTypeId || null
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to update vehicle tare weight");
    }

    record.tareWeight = cleanTareWeight;
    lastSyncedVehicleTareWeights.set(cacheKey, cleanTareWeight);
  } catch (error) {
    console.warn(error.message || "Failed to update vehicle tare weight");
  } finally {
    pendingVehicleTareSyncs.delete(cacheKey);
  }
}

async function maybeSyncVehicleMasterTare(record, tareWeight) {
  if (!tareWeightEnabled) return;
  if (!record || !hasNumericValue(tareWeight)) return;

  const cleanTareWeight = Number(tareWeight);
  await syncVehicleMasterTare(record, cleanTareWeight);
  fields.tare.value = formatTareWeight(cleanTareWeight);
  syncTareTimestampFromForm();
  calculateNet();
}

function normalizeVehicleNo(value) {
  return (value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
}

function isValidVehicleNo(value) {
  return /^[A-Z0-9]{6,12}$/.test(normalizeVehicleNo(value));
}

function formatVehicleNo(value) {
  return normalizeVehicleNo(value);
}

function formatTareWeight(value) {
  if (!hasNumericValue(value)) return "";
  const tareWeight = Number(value);
  return Number.isInteger(tareWeight) ? String(tareWeight) : tareWeight.toFixed(2);
}

function getNextRfiNumber() {
  const maxRfi = vehicleRecords.reduce((highest, record) => {
    const value = String(record.rfiNumber || "").trim();
    return /^\d+$/.test(value) ? Math.max(highest, Number(value)) : highest;
  }, 0);
  return String(maxRfi + 1);
}

function isEmptyLoadSelected() {
  return normalizeText(fields.weighingType.value) === "EMPTY";
}

function isFullLoadSelected() {
  return normalizeText(fields.weighingType.value) === "FULL LOAD";
}

function setWeightTimestamp(targetDateField, targetTimeField, sourceDate = new Date()) {
  targetDateField.value = formatShortDate(sourceDate);
  let hours = sourceDate.getHours();
  const minutes = pad(sourceDate.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12;
  targetTimeField.value = `${pad(hours)}:${minutes} ${ampm}`;
}

function setWeighingTypeValue(value, { apply = false } = {}) {
  const previousValue = normalizeText(fields.weighingType.value);
  const normalizedValue = normalizeText(value);
  const displayValue = weighingTypeDisplayValue(value);
  const matchingOption = Array.from(fields.weighingType.options).find(option => {
    return normalizeText(option.value || option.textContent) === normalizeText(displayValue);
  });

  if (matchingOption) {
    fields.weighingType.value = matchingOption.value || matchingOption.textContent;
  } else if (displayValue) {
    fields.weighingType.value = displayValue;
  } else {
    fields.weighingType.value = "";
  }
  if (normalizeText(fields.weighingType.value) !== previousValue) {
    clearMasterTareDecision();
  }
  if (apply) {
    applyWeighingTypeRules();
  }
}

function weighingTypeDisplayValue(value) {
  const normalizedValue = normalizeText(value);
  if (normalizedValue === "FULL LOAD" || normalizedValue === "FULLLOAD") return "Full load";
  if (normalizedValue === "EMPTY") return "Empty";
  if (normalizedValue === "PARTIAL LOAD" || normalizedValue === "PARTIALLOAD") return "Partial Load";
  return String(value || "").trim();
}

function getOppositeVisitWeighingType(previousType) {
  const normalizedType = normalizeText(previousType);
  if (normalizedType === "EMPTY") return "Full load";
  if (normalizedType === "FULL LOAD") return "Empty";
  return "Empty";
}

function setSaveButtonSavingState(isSaving) {
  saveButton.textContent = isSaving ? "Saving..." : saveButtonDefaultLabel;
  saveButton.disabled = isSaving || registeredReadOnly;
}

function setTareEditMode(isEditable) {
  const tareItem = fields.tare.closest(".weight-entry-item");
  tareItem?.classList.toggle("tare-editable", Boolean(isEditable));
}

function setVehicleVisitEntry(entry = null) {
  currentVehicleVisitEntry = entry;
  setChargeFieldState();
}

function clearSelectedPreviousVisit() {
  selectedPreviousVisitEntry = null;
}

function selectPreviousVisit(entry) {
  selectedPreviousVisitEntry = entry || null;
  setVehicleVisitEntry(entry || null);
}

function setVisitStage(stage) {
  selectedVisitStage = stage === "second" ? "second" : "first";
  visitStageButtons.forEach(button => {
    const isActive = button.dataset.visitStage === selectedVisitStage;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });
}

function previousEntryWeight(entry) {
  const previousType = normalizeText(entry?.weighingType);
  if (previousType === "FULL LOAD") {
    return {
      label: "Gross Weight",
      value: entry?.grossWeight,
      date: entry?.grossDate || entry?.entryDate,
      time: entry?.grossTime || entry?.entryTime
    };
  }
  return {
    label: "Tare Weight",
    value: entry?.tareWeight,
    date: entry?.tareDate || entry?.entryDate,
    time: entry?.tareTime || entry?.entryTime
  };
}

function showPreviousWeighmentPrompt(entries) {
  const availableEntries = (Array.isArray(entries) ? entries : [entries]).filter(Boolean).slice(-10);
  if (!previousWeighmentModal || !previousWeighmentRows || !availableEntries.length) return Promise.resolve(null);
  activePreviousWeighmentPromptFinish?.(null);

  previousWeighmentRows.replaceChildren();
  let lastRow = null;
  availableEntries.forEach((entry, entryIndex) => {
    const weight = previousEntryWeight(entry);
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.title = "Use this previous weight";
    row.classList.toggle("is-selected", entryIndex === availableEntries.length - 1);
    [
      String(entryIndex + 1),
      formatFullDate(entry.entryDate),
      entry.entryTime || "--",
      weighingTypeDisplayValue(entry.weighingType) || "--",
      hasNumericValue(entry.charges) ? formatTareWeight(entry.charges) : "0",
      hasNumericValue(weight.value) ? `${formatWeightDisplay(weight.value)} kg` : "--"
    ].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 4) cell.className = "previous-weighment-table__charges";
      if (index === 5) cell.className = "previous-weighment-table__weight";
      row.appendChild(cell);
    });
    row.addEventListener("click", () => activePreviousWeighmentPromptFinish?.(entry));
    row.addEventListener("focus", () => {
      previousWeighmentRows.querySelectorAll("tr").forEach(item => item.classList.remove("is-selected"));
      row.classList.add("is-selected");
    });
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activePreviousWeighmentPromptFinish?.(entry);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const rows = Array.from(previousWeighmentRows.querySelectorAll("tr[tabindex]"));
        const currentIndex = rows.indexOf(row);
        const offset = event.key === "ArrowDown" ? 1 : -1;
        rows[Math.max(0, Math.min(currentIndex + offset, rows.length - 1))]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        activePreviousWeighmentPromptFinish?.(null);
      }
    });
    previousWeighmentRows.appendChild(row);
    lastRow = row;
  });

  previousWeighmentModal.classList.add("show");
  previousWeighmentModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => lastRow?.focus(), 0);

  return new Promise(resolve => {
    let completed = false;
    const finish = result => {
      if (completed) return;
      completed = true;
      previousWeighmentModal.classList.remove("show");
      previousWeighmentModal.setAttribute("aria-hidden", "true");
      previousWeighmentRows.replaceChildren();
      previousWeighmentClose.onclick = null;
      previousWeighmentModal.onclick = null;
      if (activePreviousWeighmentPromptFinish === finish) {
        activePreviousWeighmentPromptFinish = null;
      }
      resolve(result);
    };

    activePreviousWeighmentPromptFinish = finish;

    previousWeighmentClose.onclick = () => finish(null);
    previousWeighmentModal.onclick = event => {
      if (event.target === previousWeighmentModal) finish(null);
    };
  });
}

function dismissPreviousWeighmentPrompt() {
  activePreviousWeighmentPromptFinish?.(null);
}

function clearMasterTareDecision() {
  masterTareDecisionMade = false;
  applyMasterTareForCycle = false;
  appliedMasterTareValue = "";
  tareEditEnabled = false;
}

function isFirstFullLoadCycle() {
  return isFullLoadSelected() && currentVehicleVisitMode === "new" && !currentVehicleVisitEntry;
}

function applyMasterTareValue(value) {
  if (!hasNumericValue(value)) return;
  appliedMasterTareValue = formatTareWeight(value);
  applyMasterTareForCycle = true;
  masterTareDecisionMade = true;
  fields.tare.value = appliedMasterTareValue;
  syncTareTimestampFromForm();
  calculateNet();
}

function applyMasterTareForFirstFullLoad() {
  if (!tareWeightEnabled) return;
  if (!isFirstFullLoadCycle()) return;
  if (masterTareDecisionMade) return;
  const vehicle = findVehicleRecord(fields.vehicleNo.value);
  if (!hasNumericValue(vehicle?.tareWeight) || Number(vehicle.tareWeight) <= 0) {
    masterTareDecisionMade = true;
    return;
  }

  applyMasterTareValue(vehicle.tareWeight);
}

function updateLocalVehicleMasterTare(vehicleNumber, tareWeight) {
  if (!hasNumericValue(tareWeight)) return;
  const record = findVehicleRecord(vehicleNumber);
  if (record) {
    record.tareWeight = Number(tareWeight);
  }
}

function clearWeightEntryValues() {
  clearMasterTareDecision();
  fields.gross.value = "";
  fields.grossEntryDate.value = "";
  fields.grossEntryTime.value = "";
  fields.tare.value = "";
  fields.tareEntryDate.value = "";
  fields.tareEntryTime.value = "";
}

function applyVehicleVisitCarryForward() {
  const visitEntry = currentVehicleVisitEntry;
  const visitType = normalizeText(visitEntry?.weighingType);

  if (isEmptyLoadSelected() && visitType === "FULL LOAD" && hasNumericValue(visitEntry?.grossWeight)) {
    fields.gross.value = formatTareWeight(visitEntry.grossWeight);
    fields.grossEntryDate.value = formatShortDate(visitEntry.grossDate || fields.grossEntryDate.value);
    fields.grossEntryTime.value = visitEntry.grossTime || fields.grossEntryTime.value;
  }
}

function setWeightEntryVisualState(state = "neutral") {
  const grossItem = fields.gross.closest(".weight-entry-item");
  const tareItem = fields.tare.closest(".weight-entry-item");
  const netItem = fields.net.closest(".weight-entry-item");

  [grossItem, tareItem, netItem].forEach(item => {
    item?.classList.remove("is-active", "is-inactive", "is-neutral");
  });

  if (state === "full") {
    grossItem?.classList.add("is-active");
    tareItem?.classList.add("is-inactive");
    netItem?.classList.add("is-neutral");
    return;
  }

  if (state === "empty") {
    tareItem?.classList.add("is-active");
    grossItem?.classList.add("is-inactive");
    netItem?.classList.add("is-neutral");
    return;
  }

  if (state === "partial") {
    grossItem?.classList.add("is-active");
    tareItem?.classList.add("is-active");
    netItem?.classList.add("is-neutral");
    return;
  }

  grossItem?.classList.add("is-neutral");
  tareItem?.classList.add("is-neutral");
  netItem?.classList.add("is-neutral");
}

function applyTareFieldState(record = null) {
  const masterTare = record?.tareWeight;
  const visitEntry = currentVehicleVisitEntry;
  const visitType = normalizeText(visitEntry?.weighingType);
  fields.tare.readOnly = true;
  setTareEditMode(false);
  if (isFullLoadSelected() && tareEditEnabled && hasNumericValue(fields.tare.value)) {
    fields.tare.readOnly = false;
    setTareEditMode(true);
    if (!fields.tareEntryDate.value || !fields.tareEntryTime.value) {
      syncTareTimestampFromForm();
    }
  } else if (isFullLoadSelected() && currentVehicleVisitMode === "second" && hasNumericValue(previousEntryWeight(visitEntry).value)) {
    const selectedWeight = previousEntryWeight(visitEntry);
    fields.tare.value = formatTareWeight(selectedWeight.value);
    fields.tareEntryDate.value = formatShortDate(selectedWeight.date || fields.tareEntryDate.value);
    fields.tareEntryTime.value = selectedWeight.time || fields.tareEntryTime.value;
  } else if (isFullLoadSelected() && visitType === "EMPTY" && hasNumericValue(visitEntry?.tareWeight)) {
    fields.tare.value = formatTareWeight(visitEntry.tareWeight);
    fields.tareEntryDate.value = formatShortDate(visitEntry.tareDate || fields.tareEntryDate.value);
    fields.tareEntryTime.value = visitEntry.tareTime || fields.tareEntryTime.value;
  } else if (isFullLoadSelected() && applyMasterTareForCycle && hasNumericValue(appliedMasterTareValue)) {
    fields.tare.value = appliedMasterTareValue;
    if (!fields.tareEntryDate.value || !fields.tareEntryTime.value) {
      syncTareTimestampFromForm();
    }
  } else if (isFullLoadSelected()) {
    fields.tare.value = "";
    fields.tareEntryDate.value = "";
    fields.tareEntryTime.value = "";
  } else if (isEmptyLoadSelected() && !isManualWeightMode()) {
    fields.tare.value = "";
  }
}

function applyWeighingTypeRules() {
  if (isEmptyLoadSelected()) {
    fields.material.value = EMPTY_MATERIAL;
    hideFilter(materialFilter);
    fields.tare.readOnly = true;
    setTareEditMode(false);
  } else if (normalizeText(fields.material.value) === EMPTY_MATERIAL) {
    fields.material.value = "";
  }

  applyTareFieldState(findVehicleRecord(fields.vehicleNo.value));
  if (isFullLoadSelected()) {
    setWeightEntryVisualState("full");
  } else if (isEmptyLoadSelected()) {
    setWeightEntryVisualState("empty");
  } else if (normalizeText(fields.weighingType.value) === "PARTIAL LOAD") {
    setWeightEntryVisualState("partial");
  } else {
    ensureWeightMetaVisible();
    setWeightEntryVisualState("neutral");
  }
  syncActiveWeightFieldFromLive().catch(error => console.warn(error.message || error));
  syncManualWeightInputState();
  updateManualWeightDisplay();
  calculateNet();
}

function focusWeighingTypeNextField() {
  fields.material.focus();
  fields.material.select?.();
}

function findVehicleRecord(value) {
  const clean = normalizeVehicleNo(value);
  return vehicleRecords.find(record => normalizeVehicleNo(record.vehicleNumber) === clean);
}

function findMaterialRecord(value) {
  const query = normalizeText(value);
  return materialRecords.find(record => normalizeText(record.materialName) === query);
}

function findCustomerRecord(customerName, mobileNumber = fields.mobileNo.value) {
  const customerQuery = normalizeText(customerName);
  const mobileQuery = splitMobileNumberEntry(mobileNumber).primary;
  if (!customerQuery && !mobileQuery) return null;
  return customerRecords.find(record => {
    const matchesName = normalizeText(record.customerName) === customerQuery;
    const matchesMobile = sanitizeMobileNumber(record.mobileNumber) === mobileQuery;
    if (customerQuery && mobileQuery) return matchesName && matchesMobile;
    if (customerQuery) return matchesName;
    return matchesMobile;
  });
}

function findMobileRecord(value) {
  const mobileQuery = splitMobileNumberEntry(value).primary;
  return customerRecords.find(record => sanitizeMobileNumber(record.mobileNumber) === mobileQuery);
}

function hideFilter(filter) {
  filter?.classList.remove("show");
}

function hideAllFilters() {
  [vehicleFilter, materialFilter, customerFilter, mobileFilter].forEach(hideFilter);
}

function buildMasterUrl(url, params = {}) {
  const query = new URLSearchParams({ from: "weighment" });
  Object.entries(params).forEach(([key, value]) => {
    const cleanValue = String(value ?? "").trim();
    if (cleanValue) query.set(key, cleanValue);
  });
  return `${url}?${query}`;
}

function buildPrintPreviewUrl(entryId = 0, isDraft = false, nodisplay = false) {
  const searchParams = new URLSearchParams({ autoprint: "1" });
  if (nodisplay) searchParams.set("nodisplay", "1");
  const path = isDraft ? "/settings/printer-preview-draft" : `/settings/printer-preview/${entryId}`;
  return `${path}?${searchParams.toString()}`;
}

function ensureMasterModal() {
  let overlay = document.querySelector("#masterEntryModal");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "masterEntryModal";
  overlay.className = "master-modal";
  overlay.innerHTML = `
    <div class="master-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="masterEntryModalTitle">
      <div class="master-modal__header">
        <h3 id="masterEntryModalTitle"></h3>
        <button type="button" class="master-modal__close" aria-label="Close">&times;</button>
      </div>
      <p class="master-modal__message"></p>
      <div class="master-modal__fields"></div>
      <div class="master-modal__choices" hidden></div>
      <div class="master-modal__actions">
        <button type="button" class="primary master-modal__submit">Save</button>
        <button type="button" class="master-modal__cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function closeMasterModal(overlay, result = null) {
  overlay.classList.remove("show");
  const state = overlay._state;
  overlay._state = null;
  state?.resolve?.(result);
}

function openMasterModal(config) {
  const overlay = ensureMasterModal();
  const titleNode = overlay.querySelector("#masterEntryModalTitle");
  const messageNode = overlay.querySelector(".master-modal__message");
  const fieldsNode = overlay.querySelector(".master-modal__fields");
  const choicesNode = overlay.querySelector(".master-modal__choices");
  const submitButton = overlay.querySelector(".master-modal__submit");
  const closeButton = overlay.querySelector(".master-modal__close");
  const cancelButton = overlay.querySelector(".master-modal__cancel");

  overlay._state?.resolve?.(null);
  overlay._state = null;

  titleNode.textContent = config.title || "Add to master";
  messageNode.textContent = config.message || "";
  submitButton.textContent = config.submitLabel || "Save";
  overlay.classList.toggle("master-modal--compact", Boolean(config.compact));
  fieldsNode.innerHTML = "";
  choicesNode.innerHTML = "";
  choicesNode.hidden = !Array.isArray(config.choices) || !config.choices.length;

  const fieldElements = [];
  const focusNextModalControl = currentIndex => {
    const nextField = fieldElements
      .slice(currentIndex + 1)
      .find(field => !field.disabled && !field.readOnly && field.tabIndex !== -1);
    if (nextField) {
      nextField.focus();
      nextField.select?.();
      return;
    }
    submitButton.focus();
  };
  (config.fields || []).forEach((fieldConfig, index) => {
    const wrapper = document.createElement("label");
    wrapper.className = "master-modal__field";
    const hasOptions = Array.isArray(fieldConfig.options) && fieldConfig.options.length > 0;
    const allowTyping = Boolean(fieldConfig.allowTyping);
    const isSelect = hasOptions && fieldConfig.type === "select" && !allowTyping;
    wrapper.innerHTML = "";

    const labelRow = document.createElement("span");
    labelRow.textContent = fieldConfig.label;
    if (fieldConfig.required) {
      const requiredMark = document.createElement("b");
      requiredMark.className = "required-label-mark";
      requiredMark.textContent = " *";
      requiredMark.setAttribute("aria-hidden", "true");
      labelRow.appendChild(requiredMark);
    }
    wrapper.appendChild(labelRow);
    if (fieldConfig.suffix) {
      const suffix = document.createElement("small");
      suffix.textContent = fieldConfig.suffix;
      labelRow.appendChild(suffix);
    }

    const control = isSelect ? document.createElement("select") : document.createElement("input");
    if (isSelect) {
      if (fieldConfig.allowEmptyOption !== false) {
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = fieldConfig.placeholder || "Select";
        control.appendChild(emptyOption);
      }
      fieldConfig.options.forEach(option => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        control.appendChild(optionElement);
      });
      control.value = fieldConfig.value ?? "";
    } else if (hasOptions && allowTyping) {
      control.type = fieldConfig.type || "text";
      control.placeholder = fieldConfig.placeholder || "";
      control.value = fieldConfig.value ?? "";
      control.autocomplete = "off";
      const dropdown = document.createElement("div");
      dropdown.className = "master-modal__dropdown";
      dropdown.hidden = true;
      const renderDropdown = () => {
        const query = normalizeText(control.value);
        const matches = query
          ? fieldConfig.options.filter(option => normalizeText(option.label).includes(query))
          : fieldConfig.options;
        dropdown.innerHTML = "";
        if (!matches.length) {
          dropdown.hidden = true;
          return;
        }
        matches.forEach(option => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "master-modal__dropdown-item";
          button.textContent = option.label;
          button.addEventListener("click", () => {
            control.value = option.value;
            dropdown.hidden = true;
            if (typeof fieldConfig.onSelect === "function") {
              fieldConfig.onSelect(option, {
                fieldElements,
                config,
                overlay
              });
            }
            window.setTimeout(() => {
              dropdown.hidden = true;
              control.blur();
            }, 0);
            focusNextModalControl(index);
          });
          button.addEventListener("keydown", event => {
            const items = Array.from(dropdown.querySelectorAll(".master-modal__dropdown-item"));
            const currentIndex = items.indexOf(button);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              items[Math.min(currentIndex + 1, items.length - 1)]?.focus();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (currentIndex === 0) control.focus();
              else items[currentIndex - 1]?.focus();
            } else if (event.key === "Escape") {
              event.preventDefault();
              dropdown.hidden = true;
              control.focus();
            }
          });
          dropdown.appendChild(button);
        });
        dropdown.hidden = false;
      };
      const focusDropdownItem = index => {
        const items = Array.from(dropdown.querySelectorAll(".master-modal__dropdown-item"));
        if (!items.length) return false;
        const boundedIndex = Math.max(0, Math.min(index, items.length - 1));
        items[boundedIndex].focus();
        return true;
      };
      control.addEventListener("focus", renderDropdown);
      control.addEventListener("input", renderDropdown);
      control.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (dropdown.hidden) renderDropdown();
          focusDropdownItem(0);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          if (dropdown.hidden) renderDropdown();
          const items = Array.from(dropdown.querySelectorAll(".master-modal__dropdown-item"));
          focusDropdownItem(items.length - 1);
        }
      });
      control.addEventListener("blur", () => {
        window.setTimeout(() => {
          if (!dropdown.contains(document.activeElement)) {
            dropdown.hidden = true;
          }
        }, 120);
      });
      wrapper.appendChild(control);
      wrapper.appendChild(dropdown);
      window.setTimeout(renderDropdown, 0);
    } else {
      control.type = fieldConfig.type || "text";
      control.placeholder = fieldConfig.placeholder || "";
      control.value = fieldConfig.value ?? "";
      if (fieldConfig.inputMode) {
        control.inputMode = fieldConfig.inputMode;
      }
      if (fieldConfig.maxLength) {
        control.maxLength = fieldConfig.maxLength;
      }
      if (fieldConfig.readonly) {
        control.readOnly = true;
        control.tabIndex = -1;
      }
      control.autocomplete = "off";
      wrapper.appendChild(control);
    }
    control.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      focusNextModalControl(index);
    });
    if (typeof fieldConfig.onInput === "function") {
      control.addEventListener("input", event => {
        fieldConfig.onInput(event, {
          fieldElements,
          config,
          overlay
        });
      });
    }
    fieldsNode.appendChild(wrapper);
    if (!wrapper.contains(control)) {
      wrapper.appendChild(control);
    }
    fieldElements.push(control);
  });

  const firstEditableField = fieldElements.find(input => !input.readOnly && input.tabIndex !== -1);
  if (firstEditableField) {
    window.setTimeout(() => firstEditableField.focus(), 0);
  }

  return new Promise(resolve => {
    overlay._state = { resolve, fieldElements, config };

    const submit = async () => {
      const values = {};
      for (const [index, fieldConfig] of (config.fields || []).entries()) {
        const input = fieldElements[index];
        const value = input ? String(input.value || "").trim() : "";
        if (fieldConfig.required && !value) {
          showToast(fieldConfig.errorMessage || `${fieldConfig.label} is required`, "warning");
          input?.focus?.();
          return;
        }
        values[fieldConfig.name] = value;
      }
      closeMasterModal(overlay, values);
    };

    const cancel = () => closeMasterModal(overlay, null);

    submitButton.onclick = submit;
    closeButton.onclick = cancel;
    cancelButton.onclick = cancel;

    overlay.onclick = event => {
      if (event.target === overlay) cancel();
    };

    overlay.classList.add("show");
  });
}

async function createVehicleMasterRecord(params = {}) {
  const vehicleNumber = formatVehicleNo(params.vehicle || fields.vehicleNo.value);
  const generatedRfiNumber = params.rfiNumber || getNextRfiNumber();
  if (!vehicleNumber) {
    showToast("Vehicle number is required", "warning");
    return false;
  }
  if (!isValidVehicleNo(vehicleNumber)) {
    showToast("Vehicle number must contain 6 to 12 letters or numbers", "warning");
    return false;
  }

  const vehicleModalFields = [
    {
      name: "vehicleNumber",
      label: "Vehicle Number",
      value: vehicleNumber,
      placeholder: "Enter vehicle number",
      required: true,
      errorMessage: "Vehicle number is required",
      onInput: (event, context) => {
        const input = event.target;
        const normalized = formatVehicleNo(input.value);
        if (input.value !== normalized) {
          input.value = normalized;
        }
        const vehicleTypeField = context.fieldElements[1];
        const tareWeightField = tareWeightEnabled ? context.fieldElements[2] : null;
        const rfiFieldIndex = 2 + Number(tareWeightEnabled);
        const rfiNumberField = rfidEnabled ? context.fieldElements[rfiFieldIndex] : null;
        if (!isValidVehicleNo(normalized)) return;
        const existingVehicle = findVehicleRecord(normalized);
        if (existingVehicle) {
          if (vehicleTypeField) vehicleTypeField.value = existingVehicle.vehicleTypeName || "";
          if (tareWeightField) tareWeightField.value = formatTareWeight(existingVehicle.tareWeight) || "0";
          if (rfiNumberField) rfiNumberField.value = existingVehicle.rfiNumber || "";
          return;
        }
        if (vehicleTypeField) vehicleTypeField.value = "";
        if (rfiNumberField) rfiNumberField.value = generatedRfiNumber;
        if (tareWeightField) tareWeightField.value = "0";
      }
    },
    {
      name: "vehicleTypeName",
      label: "Vehicle Type",
      value: params.vehicleType || "",
      placeholder: "Select or type vehicle type",
      allowTyping: true,
      options: vehicleTypeRecords.map(record => ({
        label: record.vehicleTypeName,
        value: record.vehicleTypeName
      })),
      required: true,
      errorMessage: "Vehicle type is required"
    }
  ];

  if (tareWeightEnabled) {
    vehicleModalFields.push({
      name: "tareWeight",
      label: "Tare Weight",
      suffix: "kg",
      value: params.tareWeight ?? "0",
      type: "number",
      placeholder: "0",
      required: true,
      errorMessage: "Tare weight is required"
    });
  }

  if (rfidEnabled) {
    vehicleModalFields.push({
      name: "rfiNumber",
      label: "RFID Number",
      value: generatedRfiNumber,
      readonly: true,
      required: false
    });
  }

  const modalValues = await openMasterModal({
    compact: true,
    title: "Add Vehicle",
    message: [
      "Choose a vehicle type.",
      rfidEnabled ? "RFID is generated automatically." : "",
      tareWeightEnabled ? "Vehicle tare weight is enabled." : ""
    ].filter(Boolean).join(" "),
    submitLabel: "Add Vehicle",
    fields: vehicleModalFields
  });

  if (!modalValues) return false;
  const cleanVehicleNumber = formatVehicleNo(modalValues.vehicleNumber);
  const cleanTareWeight = tareWeightEnabled && hasNumericValue(modalValues.tareWeight) ? Number(modalValues.tareWeight) : 0;
  const cleanRfiNumber = rfidEnabled ? ((modalValues.rfiNumber || "").trim().toUpperCase() || generatedRfiNumber) : generatedRfiNumber;
  const cleanVehicleTypeName = modalValues.vehicleTypeName.trim();

  const response = await fetch(masterUrls.vehicles, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      vehicleNumber: cleanVehicleNumber,
      rfiNumber: cleanRfiNumber || null,
      tareWeight: cleanTareWeight,
      vehicleTypeName: cleanVehicleTypeName
    })
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to save vehicle");
  }

  await loadMasterData();
  if (result.row) {
    applyVehicleRecord(result.row, false);
  } else {
    const createdVehicle = findVehicleRecord(vehicleNumber);
    if (createdVehicle) {
      applyVehicleRecord(createdVehicle, false);
    }
  }
  focusNextFormField(fields.vehicleNo);
  showToast(`${vehicleNumber} successfully added`);
  return true;
}

async function createCustomerMasterRecord(params = {}) {
  const customerModalFields = [
    {
      name: "customerName",
      label: "Customer Name",
      value: params.customer || fields.customer.value || "",
      required: true,
      errorMessage: "Customer name is required"
    }
  ];
  if (!fields.mobileNo.disabled) {
    customerModalFields.push({
      name: "mobileNumber",
      label: "Mobile Number",
      value: sanitizeMobileNumber(params.mobile || fields.mobileNo.value),
      required: false,
      type: "text",
      inputMode: "numeric",
      maxLength: 10,
      onInput: event => {
        event.target.value = sanitizeMobileNumber(event.target.value).slice(0, 10);
      }
    });
  }
  const modalValues = await openMasterModal({
    compact: true,
    title: "Add Customer",
    message: fields.mobileNo.disabled
      ? "Enter the customer name."
      : "Enter the customer name. Mobile number is optional.",
    submitLabel: "Add Customer",
    fields: customerModalFields
  });

  if (!modalValues) return;
  const customerName = modalValues.customerName.trim();
  const mobileNumber = fields.mobileNo.disabled ? "" : sanitizeMobileNumber(modalValues.mobileNumber);

  if (mobileNumber && mobileNumber.length !== 10) {
    showToast("Mobile number must be exactly 10 digits", "warning");
    return;
  }

  const response = await fetch(masterUrls.customers, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      customerName,
      mobileNumber: mobileNumber || null
    })
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to save customer");
  }

  await loadMasterData();
  if (result.row) {
    applyCustomerRecord(result.row);
  } else {
    const createdCustomer = findCustomerRecord(customerName, mobileNumber);
    if (createdCustomer) {
      applyCustomerRecord(createdCustomer);
    }
  }
  fields.customer.value = customerName;
  if (!fields.mobileNo.disabled) fields.mobileNo.value = mobileNumber;
  focusNextFormField(fields.customer);
  showToast(`${customerName} successfully added`);
}

async function createMaterialMasterRecord(params = {}) {
  const modalValues = await openMasterModal({
    compact: true,
    title: "Add Material",
    message: "Enter the material name.",
    submitLabel: "Add Material",
    fields: [
      {
        name: "materialName",
        label: "Material Name",
        value: params.material || fields.material.value || "",
        required: true,
        errorMessage: "Material is required"
      }
    ]
  });

  if (!modalValues) return;
  const materialName = modalValues.materialName.trim();

  const response = await fetch(masterUrls.materials, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ materialName })
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to save material");
  }

  await loadMasterData();
  const createdMaterial = findMaterialRecord(materialName);
  if (createdMaterial) {
    applyMaterialRecord(createdMaterial);
  } else {
    fields.material.value = materialName;
  }
  focusNextFormField(fields.material);
  showToast(`${materialName} successfully added`);
}

async function handleAddMasterRequest(label, url, params = {}) {
  hideAllFilters();

  if (label === "vehicle") {
    await createVehicleMasterRecord(params);
    return;
  }

  if (label === "material") {
    await createMaterialMasterRecord(params);
    return;
  }

  if (label === "customer") {
    await createCustomerMasterRecord(params);
    return;
  }

  const targetUrl = buildMasterUrl(url, params);
  if (typeof window.smoothNavigate === "function") {
    window.smoothNavigate(targetUrl);
    return;
  }
  window.location.href = targetUrl;
}

function addMasterButton(filter, label, url, params = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vehicle-option";
  button.textContent = `Add ${label} in master`;
  button.addEventListener("click", () => {
    handleAddMasterRequest(label, url, params).catch(error => {
      showToast(error.message || `Failed to add ${label}`, "warning");
    });
  });
  filter.appendChild(button);
}

function renderFilter(filter, rows, query, renderLabel, onSelect, sourceField, masterLabel, masterUrl, masterParams = {}, allowEmptyList = false, canAddMaster = true, alwaysShowAddMaster = false, advanceOnSelect = true, nextFieldAfterSelect = null) {
  filter.innerHTML = "";
  const cleanQuery = normalizeText(query);
  if (!cleanQuery && !allowEmptyList) {
    hideFilter(filter);
    return;
  }

  const matches = cleanQuery
    ? rows.filter(row => normalizeText(renderLabel(row)).includes(cleanQuery))
    : rows;
  matches.forEach(row => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vehicle-option";
    button.textContent = renderLabel(row);
    button.addEventListener("click", () => {
      onSelect(row);
      hideFilter(filter);
      if (nextFieldAfterSelect) {
        nextFieldAfterSelect.focus();
        if (typeof nextFieldAfterSelect.select === "function" && nextFieldAfterSelect.tagName !== "SELECT") {
          nextFieldAfterSelect.select();
        }
      } else if (advanceOnSelect) {
        focusNextFormField(sourceField);
      } else {
        sourceField.focus();
        sourceField.select?.();
      }
    });
    filter.appendChild(button);
  });

  if (canAddMaster && (alwaysShowAddMaster || !matches.length)) {
    addMasterButton(filter, masterLabel, masterUrl, masterParams);
  } else if (!matches.length) {
    hideFilter(filter);
    return;
  }
  filter.classList.add("show");
}

function renderMobileFilter(allowEmptyList = false) {
  const query = splitMobileNumberEntry(fields.mobileNo.value).primary;
  mobileFilter.innerHTML = "";
  if (!query && !allowEmptyList) {
    hideFilter(mobileFilter);
    return;
  }

  const matches = query
    ? customerRecords.filter(row => sanitizeMobileNumber(row.mobileNumber).includes(query))
    : customerRecords;

  matches.forEach(row => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vehicle-option";
    button.textContent = `${row.mobileNumber} - ${row.customerName}`;
    button.addEventListener("click", () => {
      applyCustomerRecord(row);
      hideFilter(mobileFilter);
      fields.paymentMode.focus();
    });
    mobileFilter.appendChild(button);
  });

  if (!matches.length) {
    addMasterButton(mobileFilter, "customer", masterPages.customer, { mobile: query });
  }
  mobileFilter.classList.add("show");
}

const suggestionSources = new Map([
  [fields.vehicleNo, { filter: vehicleFilter, render: renderVehicleFilter }],
  [fields.material, { filter: materialFilter, render: renderMaterialFilter }],
  [fields.customer, { filter: customerFilter, render: renderCustomerFilter }],
  [fields.mobileNo, { filter: mobileFilter, render: renderMobileFilter }]
]);

function getSuggestionButtons(filter) {
  return Array.from(filter.querySelectorAll(".vehicle-option"));
}

function focusSuggestionButton(filter, index) {
  const buttons = getSuggestionButtons(filter);
  if (!buttons.length) return false;
  const boundedIndex = Math.max(0, Math.min(index, buttons.length - 1));
  buttons[boundedIndex].focus();
  return true;
}

function openSuggestionFilter(field, allowEmptyList = false, preferLast = false) {
  const source = suggestionSources.get(field);
  if (!source) return false;

  source.render(allowEmptyList);
  const buttons = getSuggestionButtons(source.filter);
  if (!buttons.length) return false;

  buttons[preferLast ? buttons.length - 1 : 0].focus();
  return true;
}

function applyVehicleRecord(record, lookupVisit = true) {
  const previousVehicleNo = normalizeVehicleNo(fields.vehicleNo.value);
  const nextVehicleNo = normalizeVehicleNo(record.vehicleNumber);
  if (previousVehicleNo !== nextVehicleNo) {
    clearMasterTareDecision();
  }
  fields.vehicleNo.value = formatVehicleNo(record.vehicleNumber);
  fields.vehicleType.value = record.vehicleTypeName || "";
  vehicleTypeBadge.textContent = fields.vehicleType.value;
  vehicleTypeBadge.classList.toggle("show", Boolean(fields.vehicleType.value));
  vehicleStatus.classList.add("valid");
  hideFilter(vehicleFilter);
  setVehicleVisitEntry(null);
  applyWeighingTypeRules();
  syncPreview();
  if (lookupVisit) {
    lookupVehicleVisit().catch(error => showToast(error.message || "Failed to load vehicle visit"));
  }
}

function applyMaterialRecord(record) {
  fields.material.value = record.materialName;
  hideFilter(materialFilter);
  syncPreview();
}

function applyCustomerRecord(record) {
  fields.customer.value = record.customerName;
  if (!String(fields.mobileNo.value || "").trim()) {
    fields.mobileNo.value = record.mobileNumber || "";
  }
  hideFilter(customerFilter);
  hideFilter(mobileFilter);
  syncPreview();
}

function renderVehicleFilter(allowEmptyList = false) {
  const cleanQuery = normalizeVehicleNo(fields.vehicleNo.value);
  const existingVehicle = findVehicleRecord(fields.vehicleNo.value);
  renderFilter(
    vehicleFilter,
    vehicleRecords,
    fields.vehicleNo.value,
    row => formatVehicleNo(row.vehicleNumber),
    applyVehicleRecord,
    fields.vehicleNo,
    "vehicle",
    masterPages.vehicle,
    { vehicle: fields.vehicleNo.value },
    allowEmptyList,
    isValidVehicleNo(cleanQuery) && !existingVehicle,
    isValidVehicleNo(cleanQuery) && !existingVehicle
  );
}

async function ensureVehicleRegisteredBeforeProgress({ openAddDialog = true } = {}) {
  const cleanVehicleNo = normalizeVehicleNo(fields.vehicleNo.value);
  if (!cleanVehicleNo) return false;
  if (!isValidVehicleNo(cleanVehicleNo)) {
    fields.vehicleNo.focus();
    fields.vehicleNo.select?.();
    showToast("Vehicle number must contain 6 to 12 letters or numbers", "warning");
    return false;
  }
  const existingVehicle = findVehicleRecord(cleanVehicleNo);
  if (existingVehicle) {
    applyVehicleRecord(existingVehicle, false);
    return true;
  }
  fields.vehicleNo.focus();
  fields.vehicleNo.select?.();
  showToast("Vehicle number must be registered in master before continuing", "warning");
  renderVehicleFilter(true);
  if (!openAddDialog) return false;
  if (vehicleRegistrationPromptActive) return false;
  vehicleRegistrationPromptActive = true;
  try {
    return await createVehicleMasterRecord({ vehicle: cleanVehicleNo }) === true;
  } finally {
    vehicleRegistrationPromptActive = false;
  }
}

function vehicleNeedsRegistrationBlock() {
  const cleanVehicleNo = normalizeVehicleNo(fields.vehicleNo.value);
  if (!cleanVehicleNo || registeredReadOnly) return false;
  return isValidVehicleNo(cleanVehicleNo) && !findVehicleRecord(cleanVehicleNo);
}

function blockUntilVehicleRegistered(target = null) {
  if (!vehicleNeedsRegistrationBlock()) return false;
  const targetElement = target?.closest?.("input, select, textarea, button");
  if (targetElement === fields.vehicleNo || targetElement?.closest?.("#vehicleFilter") || targetElement?.closest?.(".master-modal")) {
    return false;
  }
  fields.vehicleNo.focus();
  fields.vehicleNo.select?.();
  renderVehicleFilter(true);
  showToast("Register this vehicle number in master before continuing", "warning");
  return true;
}

function renderMaterialFilter(allowEmptyList = false) {
  if (isEmptyLoadSelected()) {
    fields.material.value = EMPTY_MATERIAL;
    hideFilter(materialFilter);
    return;
  }

  renderFilter(
    materialFilter,
    materialRecords,
    fields.material.value,
    row => row.materialName,
    applyMaterialRecord,
    fields.material,
    "material",
    masterPages.material,
    { material: fields.material.value },
    allowEmptyList
  );
}

function renderCustomerFilter(allowEmptyList = false) {
  const customerName = String(fields.customer.value || "").trim();
  const existingCustomer = customerRecords.some(
    row => normalizeText(row.customerName) === normalizeText(customerName)
  );
  renderFilter(
    customerFilter,
    customerRecords,
    fields.customer.value,
    row => row.customerName,
    applyCustomerRecord,
    fields.customer,
    "customer",
    masterPages.customer,
    {
      customer: fields.customer.value,
      mobile: fields.mobileNo.value
    },
    allowEmptyList,
    true,
    Boolean(customerName) && !existingCustomer,
    false,
    fields.paymentMode
  );
}

function calculateNet() {
  const hasGross = hasNumericValue(fields.gross.value);
  const hasTare = hasNumericValue(fields.tare.value);
  const gross = hasGross ? Number(fields.gross.value) : null;
  const tare = hasTare ? Number(fields.tare.value) : null;
  const net = hasGross && hasTare ? Math.max(gross - tare, 0) : null;

  fields.net.value = net === null ? "" : net;
  fields.grossDisplay.textContent = formatWeightDisplay(fields.gross.value);
  fields.tareDisplay.textContent = formatWeightDisplay(fields.tare.value);
  fields.netDisplay.textContent = formatWeightDisplay(fields.net.value);
  syncEntryWeightWidth(fields.gross);
  syncEntryWeightWidth(fields.tare);
  return { gross, tare, net };
}

function syncPreview() {
  calculateNet();
  const record = findVehicleRecord(fields.vehicleNo.value);
  fields.vehicleType.value = record?.vehicleTypeName || fields.vehicleType.value || "";
  vehicleTypeBadge.textContent = fields.vehicleType.value;
  vehicleTypeBadge.classList.toggle("show", Boolean(fields.vehicleType.value));
  if (isFullLoadSelected()) {
    setWeightEntryVisualState("full");
  } else if (isEmptyLoadSelected()) {
    setWeightEntryVisualState("empty");
  } else if (normalizeText(fields.weighingType.value) === "PARTIAL LOAD") {
    setWeightEntryVisualState("partial");
  } else {
    setWeightEntryVisualState("neutral");
  }
}

function applyRuntimeBuiltinFieldSettings(rows = []) {
  const chargesConfig = rows.find(row => String(row.id || "").toLowerCase() === "builtin:charges");
  if (!chargesConfig) return;
  const chargesEnabled = chargesConfig.enabled !== false;
  if (chargeRow) {
    chargeRow.hidden = !chargesEnabled;
    chargeRow.style.setProperty("display", chargesEnabled ? "" : "none", chargesEnabled ? "" : "important");
    chargeRow.dataset.configDisabled = String(!chargesEnabled);
  }
  fields.charge1.disabled = !chargesEnabled;
  fields.charge1.toggleAttribute("data-config-disabled", !chargesEnabled);
  fields.charge1.required = chargesEnabled && chargesConfig.required === true;
  if (chargesEnabled && chargesConfig.required === true) {
    fields.charge1.dataset.builtInRequired = "true";
  } else {
    delete fields.charge1.dataset.builtInRequired;
  }
  if (!chargesEnabled) {
    fields.charge1.value = "";
    fields.charge2.value = "0";
  }
}

function applyScaleValue(value) {
  if (!liveWeightEnabled) return;
  if (registeredReadOnly) return;
  if (value === null || value === undefined || String(value).trim() === "") return;
  const numericValue = String(value).trim();
  const displayValue = formatWeightDisplay(numericValue);
  setLiveWeightDisplay(displayValue);

  if (isFullLoadSelected()) {
    fields.gross.value = numericValue;
    syncGrossTimestampFromForm();
  } else if (isEmptyLoadSelected()) {
    fields.tare.value = numericValue;
    syncTareTimestampFromForm();
  }

  calculateNet();
}

function warnMissingMaster(field, message) {
  field?.focus?.();
  showToast(message, "warning");
}

function renderCameraInView(view, cameraIndex) {
  if (!dashboardCameras.length) return;
  const normalizedIndex = (cameraIndex + dashboardCameras.length) % dashboardCameras.length;
  const camera = dashboardCameras[normalizedIndex];
  const image = view.querySelector("img");

  view.classList.remove("camera-network-error");
  view.dataset.cameraIndex = String(normalizedIndex);
  view.dataset.camera = String(camera.cameraNo);
  view.querySelector(".camera-name").textContent = `Camera ${camera.cameraNo}`;
  view.querySelector(".camera-label span").textContent = camera.ipAddress;
  image.src = `${camera.streamUrl}?slot=${view.dataset.slot}&t=${Date.now()}`;
  image.alt = `IP Camera ${camera.cameraNo} live stream`;
}

function switchCamera(view, direction) {
  if (!dashboardCameras.length) return;
  const currentIndex = Number(view.dataset.cameraIndex || 0);
  renderCameraInView(view, currentIndex + direction);
}

function createCameraPlaceholder(slotIndex) {
  const wrapper = document.createElement("div");
  wrapper.className = "ip-camera";
  wrapper.innerHTML = `
    <div class="camera-view camera-empty-view" aria-label="No camera found">
      <div class="camera-empty-message">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8h11a2 2 0 0 1 2 2v1l3-2v8l-3-2v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"></path>
          <path d="M3 3l18 18"></path>
        </svg>
        <strong class="camera-name">No camera found</strong>
      </div>
    </div>
  `;
  return wrapper;
}

function createCameraView(slotIndex, cameraIndex) {
  const wrapper = document.createElement("div");
  wrapper.className = "ip-camera";
  wrapper.innerHTML = `
    <div class="camera-view camera-live-view" data-slot="${slotIndex}" role="button" tabindex="0" aria-label="Open IP camera ${slotIndex} fullscreen">
      <button class="camera-nav camera-prev" type="button" aria-label="Previous camera">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
      </button>
      <img alt="">
      <div class="camera-label">
        <strong class="camera-name">Camera</strong>
        <span></span>
      </div>
      <button class="camera-nav camera-next" type="button" aria-label="Next camera">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
      </button>
    </div>
  `;

  const view = wrapper.querySelector(".camera-view");
  renderCameraInView(view, cameraIndex);

  view.addEventListener("click", event => {
    if (event.target.closest(".camera-nav")) return;
    if (document.fullscreenElement) return;
    view.requestFullscreen?.();
  });
  view.addEventListener("dblclick", event => {
    event.preventDefault();
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }
  });
  view.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      switchCamera(view, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      switchCamera(view, 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      view.click();
    }
  });
  view.querySelector(".camera-prev").addEventListener("click", event => {
    event.stopPropagation();
    switchCamera(view, -1);
  });
  view.querySelector(".camera-next").addEventListener("click", event => {
    event.stopPropagation();
    switchCamera(view, 1);
  });
  view.addEventListener("contextmenu", event => {
    event.preventDefault();
    switchCamera(view, 1);
  });
  view.querySelector("img").addEventListener("error", () => {
    view.classList.add("camera-network-error");
    view.querySelector(".camera-name").textContent = "Image Not Found";
    view.querySelector(".camera-label span").textContent = `Camera ${view.dataset.camera || ""}`;
    showToast(`Camera ${view.dataset.camera || ""} image not found`);
  });

  return wrapper;
}

async function loadDashboardCameras() {
  if (!cameraDuo || cameraDuo.hidden) return;

  try {
    const response = await fetch(cameraApiUrl);
    if (!response.ok) throw new Error("Failed to load camera settings");

    const result = await response.json();
    dashboardCameras = (result.cameras || [])
      .filter(camera => camera.isConnected && camera.streamUrl)
      .slice(0, 4);

    cameraDuo.innerHTML = "";
    if (!dashboardCameras.length) {
      cameraDuo.appendChild(createCameraPlaceholder(1));
      cameraDuo.appendChild(createCameraPlaceholder(2));
      return;
    }

    cameraDuo.appendChild(createCameraView(1, 0));
    cameraDuo.appendChild(createCameraView(2, dashboardCameras.length > 1 ? 1 : 0));
  } catch (error) {
    cameraDuo.innerHTML = '<div class="camera-empty-state">Unable to load camera streams.</div>';
  }
}

function validateRequiredFields() {
  for (const [fieldName, message] of requiredWeighmentFields) {
    const field = fields[fieldName];
    if (!String(field?.value ?? "").trim()) {
      field?.focus?.();
      showToast(field?.dataset?.fieldLabel ? `${field.dataset.fieldLabel} is required` : message);
      return false;
    }
  }

  for (const input of document.querySelectorAll('[data-built-in-required="true"]')) {
    if (input.disabled) continue;
    if (String(input.value || "").trim()) continue;
    input.focus();
    showToast(`${input.dataset.fieldLabel || "Field"} is required`);
    return false;
  }

  for (const input of document.querySelectorAll('[data-custom-required="true"]')) {
    if (String(input.value || "").trim()) continue;
    input.focus();
    showToast(`${input.dataset.fieldLabel || "Custom field"} is required`);
    return false;
  }

  if (isFullLoadSelected()) {
    const fullLoadFields = [
      ["gross", "Gross weight is required"],
      ["grossEntryDate", "Gross date is required"],
      ["grossEntryTime", "Gross time is required"]
    ];
    for (const [fieldName, message] of fullLoadFields) {
      const field = fields[fieldName];
      if (!String(field?.value ?? "").trim()) {
        field?.focus?.();
        showToast(message);
        return false;
      }
    }
  }

  if (isEmptyLoadSelected()) {
    const emptyLoadFields = [
      ["tare", "Tare weight is required"],
      ["tareEntryDate", "Tare date is required"],
      ["tareEntryTime", "Tare time is required"]
    ];
    for (const [fieldName, message] of emptyLoadFields) {
      const field = fields[fieldName];
      if (!String(field?.value ?? "").trim()) {
        field?.focus?.();
        showToast(message);
        return false;
      }
    }
  }

  return true;
}

function validateChargeValues() {
  const { charge1, charge2 } = calculateChargeTotal();

  if (charge1 < 0 || charge2 < 0) {
    showToast("Charges cannot be negative");
    fields.charge1.focus();
    return false;
  }

  return true;
}

function validateMasterSelection() {
  fields.vehicleNo.value = formatVehicleNo(fields.vehicleNo.value);
  fields.material.value = fields.material.value.trim();
  fields.customer.value = fields.customer.value.trim();
  fields.mobileNo.value = normalizeMobileNumberEntry(fields.mobileNo.value);
  const mobileNumbers = splitMobileNumberEntry(fields.mobileNo.value);
  const mobileNoPrimary = mobileNumbers.primary;

  const vehicle = findVehicleRecord(fields.vehicleNo.value);
  if (!vehicle) {
    warnMissingMaster(fields.vehicleNo, "Warning: Vehicle number is not registered in master");
    return false;
  }

  const materialValue = fields.material.value;
  const material = materialValue ? findMaterialRecord(materialValue) : null;
  const isEmptyMaterial = isEmptyLoadSelected() && normalizeText(materialValue) === EMPTY_MATERIAL;
  if (materialValue && !material && !isEmptyMaterial) {
    warnMissingMaster(fields.material, "Warning: Material is not registered in master");
    return false;
  }

  const customerProvided = Boolean(fields.customer.value || mobileNoPrimary);
  const customer = customerProvided ? findCustomerRecord(fields.customer.value, mobileNoPrimary) : null;
  if (customerProvided && !customer) {
    warnMissingMaster(
      fields.customer.value ? fields.customer : fields.mobileNo,
      "Warning: Customer or mobile number is not registered in master"
    );
    return false;
  }

  applyVehicleRecord(vehicle, false);
  if (material) {
    applyMaterialRecord(material);
  } else if (isEmptyMaterial) {
    fields.material.value = EMPTY_MATERIAL;
  }
  if (customer && !fields.customer.value) {
    fields.customer.value = customer.customerName;
  }
  return true;
}

function collectCustomFieldValues() {
  recalculateCustomFields();
  return Array.from(document.querySelectorAll(".extra-fields-body input[name]")).reduce((values, input) => {
    values[input.name] = input.value.trim();
    return values;
  }, {});
}

function customFieldInputByName(name) {
  if (!name) return null;
  return document.querySelector(`.extra-fields-body input[name="${CSS.escape(name)}"]`);
}

function recalculateCustomFields() {
  document.querySelectorAll(".extra-fields-body input[data-calculation-left][data-calculation-right]").forEach(input => {
    const leftInput = customFieldInputByName(input.dataset.calculationLeft);
    const rightInput = customFieldInputByName(input.dataset.calculationRight);
    const left = Number(leftInput?.value || 0);
    const right = Number(rightInput?.value || 0);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      input.value = "";
      return;
    }
    let total = left + right;
    switch (input.dataset.calculationOperator || "add") {
      case "subtract":
        total = left - right;
        break;
      case "multiply":
        total = left * right;
        break;
      case "divide":
        total = right === 0 ? NaN : left / right;
        break;
      default:
        total = left + right;
    }
    if (!Number.isFinite(total)) {
      input.value = "";
      return;
    }
    input.value = Number.isInteger(total) ? String(total) : String(Number(total.toFixed(3)));
  });
}

document.querySelectorAll(".extra-fields-body input[name]").forEach(input => {
  input.addEventListener("input", () => {
    recalculateCustomFields();
    syncPreview();
  });
  input.addEventListener("change", () => {
    recalculateCustomFields();
    syncPreview();
  });
});

function getEditableFormFields() {
  return Array.from(form.querySelectorAll("input, select, textarea")).filter(field => {
    if (field.disabled || field.readOnly) return false;
    if (field.type === "hidden") return false;
    return field.offsetParent !== null;
  });
}

function focusNextFormField(currentField) {
  const editableFields = getEditableFormFields();
  const currentIndex = editableFields.indexOf(currentField);
  const nextField = editableFields[currentIndex + 1];

  if (!nextField) {
    saveButton.focus();
    return;
  }

  nextField.focus();
  if (typeof nextField.select === "function" && nextField.tagName !== "SELECT") {
    nextField.select();
  }
}

function buildWeighmentPayload() {
  const isFullLoad = isFullLoadSelected();
  const isEmptyLoad = isEmptyLoadSelected();
  const includeMasterTare = isFullLoad && applyMasterTareForCycle && hasNumericValue(appliedMasterTareValue);
  const includeEditedFullTare = isFullLoad && hasNumericValue(fields.tare.value);
  const grossWeight = isFullLoad ? fields.gross.value.trim() : "";
  const grossDate = isFullLoad ? (fields.grossEntryDate.value.trim() || formatShortDate(fields.date.value)) : "";
  const grossTime = isFullLoad ? (fields.grossEntryTime.value.trim() || fields.time.value.trim()) : "";
  const fullLoadTare = includeEditedFullTare ? fields.tare.value.trim() : (includeMasterTare ? appliedMasterTareValue : "");
  const includeFullTare = includeMasterTare || includeEditedFullTare;
  const tareWeight = isEmptyLoad ? fields.tare.value.trim() : fullLoadTare;
  const tareDate = (isEmptyLoad || includeFullTare) ? (fields.tareEntryDate.value.trim() || formatShortDate(fields.date.value)) : "";
  const tareTime = (isEmptyLoad || includeFullTare) ? (fields.tareEntryTime.value.trim() || fields.time.value.trim()) : "";
  const netWeight = hasNumericValue(fields.gross.value) && hasNumericValue(tareWeight)
    ? String(Math.max(Number(fields.gross.value) - Number(tareWeight), 0))
    : "";
  const { primary: mobileNo1, secondary: mobileNo2 } = splitMobileNumberEntry(fields.mobileNo.value);
  const charge1 = String(fields.charge1.value || "").trim() || "0";
  const charge2 = selectedVisitStage === "second"
    ? "0"
    : (String(fields.charge2.value || "").trim() || "0");
  const totalCharges = Number(charge1 || 0) + Number(charge2 || 0);

  return {
    serialNo: fields.serialNo.value.trim(),
    refNo: fields.refNo.value.trim(),
    entryDate: normalizeDateForApi(fields.date.value),
    entryTime: fields.time.value.trim(),
    vehicleNo: fields.vehicleNo.value.trim(),
    vehicleType: fields.vehicleType.value.trim(),
    weighingType: fields.weighingType.value.trim(),
    material: fields.material.value.trim(),
    customer: fields.customer.value.trim(),
    mobileNo1,
    mobileNo: mobileNo1,
    mobileNo2,
    paymentMode: fields.paymentMode.value.trim(),
    charge1,
    charge2,
    charges: String(totalCharges),
    grossWeight,
    grossDate,
    grossTime,
    tareWeight,
    tareDate,
    tareTime,
    netWeight,
    visitStage: selectedVisitStage,
    previousEntryId: selectedVisitStage === "second"
      ? selectedPreviousVisitEntry?.id || currentVehicleVisitEntry?.id || null
      : null,
    applyMasterTare: includeMasterTare,
    tareOverride: includeEditedFullTare,
    customFields: collectCustomFieldValues()
  };
}

function buildPrinterPreviewEntry() {
  const payload = buildWeighmentPayload();
  return {
    id: Number(currentWeighmentEntry?.id || 0),
    serialNo: payload.serialNo,
    refNo: payload.refNo,
    entryDate: payload.entryDate,
    entryTime: payload.entryTime,
    vehicleNo: payload.vehicleNo,
    vehicleType: fields.vehicleType.value.trim(),
    weighingType: payload.weighingType,
    material: payload.material,
    customer: payload.customer,
    mobileNo1: payload.mobileNo1,
    mobileNo: payload.mobileNo,
    mobileNo2: payload.mobileNo2,
    paymentMode: payload.paymentMode,
    charges: payload.charges,
    charge1: payload.charge1,
    charge2: payload.charge2,
    grossWeight: payload.grossWeight,
    grossDate: payload.grossDate,
    grossTime: payload.grossTime,
    tareWeight: payload.tareWeight,
    tareDate: payload.tareDate,
    tareTime: payload.tareTime,
    netWeight: payload.netWeight,
    customFields: payload.customFields,
    cameraImages: currentWeighmentEntry?.cameraImages || [],
  };
}

function setCustomFieldValues(values = {}) {
  document.querySelectorAll(".extra-fields-body input[name]").forEach(input => {
    input.value = values[input.name] ?? "";
  });
  recalculateCustomFields();
}

function applyPreviousEntry(entry, isSecondCycle = false) {
  if (!entry) return;
  setWeighingTypeValue(entry.weighingType || fields.weighingType.value);
  fields.vehicleType.value = entry.vehicleType || fields.vehicleType.value || "";
  fields.material.value = entry.material || "";
  fields.customer.value = entry.customer || "";
  fields.mobileNo.value = normalizeMobileNumberEntry(
    entry.mobileNo2 ? `${entry.mobileNo1 || entry.mobileNo || ""},${entry.mobileNo2}` : (entry.mobileNo1 || entry.mobileNo || "")
  );
  fields.paymentMode.value = entry.paymentMode || fields.paymentMode.value;
  if (isSecondCycle) {
    fields.charge1.value = "";
    fields.charge2.value = "0";
  } else {
    fields.charge1.value = formatChargeInputValue(entry.charge1 ?? entry.charges);
    fields.charge2.value = entry.charge2 ?? entry.charges ?? entry.charge1 ?? "0";
  }
  fields.gross.value = entry.grossWeight ?? "";
  fields.grossEntryDate.value = formatShortDate(entry.grossDate || fields.grossEntryDate.value);
  fields.grossEntryTime.value = entry.grossTime || fields.grossEntryTime.value;
  fields.tare.value = "";
  fields.tareEntryDate.value = "";
  fields.tareEntryTime.value = "";
  setCustomFieldValues(entry.customFields || {});
  syncPreview();
}

function applyWeighmentEntry(entry, navigationState = null) {
  if (!entry) return;
  currentWeighmentEntry = entry;
  clearSelectedPreviousVisit();
  setVisitStage(hasNumericValue(entry.grossWeight) && hasNumericValue(entry.tareWeight) ? "second" : "first");
  setVehicleVisitEntry(null);
  fields.serialNo.value = entry.serialNo || "";
  fields.refNo.value = entry.refNo || "";
  fields.date.value = entry.entryDate || fields.date.value;
  fields.time.value = entry.entryTime || fields.time.value;
  fields.vehicleNo.value = formatVehicleNo(entry.vehicleNo || "");
  setWeighingTypeValue(entry.weighingType || fields.weighingType.value);
  fields.vehicleType.value = entry.vehicleType || fields.vehicleType.value || "";
  fields.material.value = entry.material || "";
  fields.customer.value = entry.customer || "";
  fields.mobileNo.value = normalizeMobileNumberEntry(
    entry.mobileNo2 ? `${entry.mobileNo1 || entry.mobileNo || ""},${entry.mobileNo2}` : (entry.mobileNo1 || entry.mobileNo || "")
  );
  fields.paymentMode.value = entry.paymentMode || fields.paymentMode.value;
  fields.charge1.value = formatChargeInputValue(entry.charge1 ?? entry.charges);
  fields.charge2.value = entry.charge2 ?? entry.charges ?? entry.charge1 ?? "0";
  fields.gross.value = entry.grossWeight ?? "";
  fields.grossEntryDate.value = formatShortDate(entry.grossDate || "");
  fields.grossEntryTime.value = entry.grossTime || "";
  fields.tare.value = entry.tareWeight ?? "";
  fields.tareEntryDate.value = formatShortDate(entry.tareDate || "");
  fields.tareEntryTime.value = entry.tareTime || "";
  fields.net.value = entry.netWeight ?? "";
  setCustomFieldValues(entry.customFields || {});
  setChargeFieldState();

  const vehicle = findVehicleRecord(fields.vehicleNo.value);
  if (vehicle) {
    fields.vehicleType.value = vehicle.vehicleTypeName || "";
    vehicleStatus.classList.add("valid");
  }
  hideAllFilters();
  currentLiveWeightValue = fields.gross.value || fields.tare.value || "";
  setLiveWeightDisplay(currentLiveWeightValue);
  syncPreview();
  setRegisteredReadOnly(true);
  if (navigationState) {
    setWeighmentNavigationState(navigationState);
  }
}

async function loadNextTicket() {
  const query = new URLSearchParams({ entryDate: normalizeDateForApi(fields.date.value) });
  const response = await fetch(`/api/weighments/next-ticket?${query}`);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to load next ticket");
  }

  fields.serialNo.value = result.serialNo;
  fields.refNo.value = result.refNo;
  setWeighmentNavigationState({
    hasPrevious: result.hasPrevious,
    hasNext: result.hasNext
  });
}

function startNewWeighment({ showToastMessage = true } = {}) {
  dismissPreviousWeighmentPrompt();
  vehicleVisitLookupToken += 1;
  currentWeighmentEntry = null;
  clearSelectedPreviousVisit();
  currentVehicleVisitMode = "";
  setVisitStage("first");
  setVehicleVisitEntry(null);
  setWeighmentNavigationState();
  clearVehicleTareSyncCache();
  setRegisteredReadOnly(false);
  fields.vehicleNo.value = "";
  fields.vehicleType.value = "";
  fields.mobileNo.value = "";
  fields.customer.value = "";
  fields.material.value = "";
  setWeighingTypeValue("");
  fields.paymentMode.value = "Cash";
  fields.charge1.value = "";
  fields.charge2.value = "0";
  calculateChargeTotal();
  fields.gross.value = "";
  fields.tare.value = "";
  fields.tare.readOnly = true;
  clearLiveWeightDisplay();
  setCustomFieldValues();
  setDateTime();
  setChargeFieldState();
  loadNextTicket().catch(error => showToast(error.message || "Failed to load next ticket"));
  hideAllFilters();
  applyWeighingTypeRules();
  syncPreview();
  visitStageButtons[0]?.focus();
  if (showToastMessage) {
    showToast("New weighment entry started");
  }
}

async function loadWeighmentBySerial(serialNo, direction = "current") {
  const query = new URLSearchParams({
    entryDate: normalizeDateForApi(fields.date.value),
    serialNo,
    direction
  });
  const response = await fetch(`/api/weighments/lookup?${query}`);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to load weighment");
  }

  applyWeighmentEntry(result.entry, {
    hasPrevious: result.hasPrevious,
    hasNext: result.hasNext
  });
  showToast(`${fields.serialNo.value} loaded`);
}

function configureFirstVehicleVisit(result = {}, vehicle = null) {
  clearSelectedPreviousVisit();
  setVisitStage("first");
  currentVehicleVisitMode = "new";
  setVehicleVisitEntry(null);
  clearWeightEntryValues();
  fields.serialNo.value = result.serialNo || fields.serialNo.value;
  fields.refNo.value = result.newRefNo || result.refNo || fields.refNo.value;
  if (!normalizeText(fields.weighingType.value)) {
    setWeighingTypeValue("Full load");
  }
  fields.material.value = "";
  applyTareFieldState(vehicle || findVehicleRecord(fields.vehicleNo.value));
  applyWeighingTypeRules();
  syncManualWeightInputState();
  applyMasterTareForFirstFullLoad();
  calculateNet();
}

function configureSecondVehicleVisit(result, vehicle = null) {
  const requestedType = normalizeText(fields.weighingType.value);
  const secondType = ["FULL LOAD", "EMPTY"].includes(requestedType)
    ? fields.weighingType.value
    : getOppositeVisitWeighingType(result.entry?.weighingType);
  selectPreviousVisit(result.entry);
  setVisitStage("second");
  currentVehicleVisitMode = "second";
  fields.serialNo.value = result.serialNo;
  fields.refNo.value = result.refNo;
  applyPreviousEntry(result.entry, true);
  setVehicleVisitEntry(result.entry);
  setWeighingTypeValue(secondType);
  fields.material.value = normalizeText(secondType) === "EMPTY" ? EMPTY_MATERIAL : (result.entry?.material || "");
  clearWeightEntryValues();
  const selectedWeight = previousEntryWeight(result.entry);
  if (normalizeText(secondType) === "FULL LOAD" && hasNumericValue(selectedWeight.value)) {
    fields.tare.value = formatTareWeight(selectedWeight.value);
    fields.tareEntryDate.value = formatShortDate(selectedWeight.date);
    fields.tareEntryTime.value = selectedWeight.time || "";
  } else if (normalizeText(secondType) === "EMPTY" && hasNumericValue(selectedWeight.value)) {
    fields.gross.value = formatTareWeight(selectedWeight.value);
    fields.grossEntryDate.value = formatShortDate(selectedWeight.date);
    fields.grossEntryTime.value = selectedWeight.time || "";
  }
  applyWeighingTypeRules();
  applyTareFieldState(vehicle || findVehicleRecord(fields.vehicleNo.value));
  syncManualWeightInputState();
  fields.weighingType.focus();
  calculateNet();
}

async function lookupVehicleVisit() {
  const cleanVehicleNo = normalizeVehicleNo(fields.vehicleNo.value);
  if (!isValidVehicleNo(cleanVehicleNo)) return;
  const lookupToken = ++vehicleVisitLookupToken;

  const query = new URLSearchParams({
    entryDate: normalizeDateForApi(fields.date.value),
    vehicleNo: cleanVehicleNo,
    includeHistory: selectedVisitStage === "second" ? "1" : "0"
  });
  const response = await fetch(`/api/weighments/vehicle-visit?${query}`);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to load vehicle visit");
  }
  if (lookupToken !== vehicleVisitLookupToken) return;

  fields.serialNo.value = result.serialNo;

  const vehicle = findVehicleRecord(fields.vehicleNo.value);
  if (result.mode === "second") {
    if (selectedVisitStage !== "second") {
      configureFirstVehicleVisit(result, vehicle);
      return;
    }
    const selectedEntry = await showPreviousWeighmentPrompt(result.entries || result.entry);
    if (lookupToken !== vehicleVisitLookupToken) return;
    if (selectedEntry) {
      configureSecondVehicleVisit({
        ...result,
        refNo: selectedEntry.refNo,
        entry: selectedEntry
      }, vehicle);
    } else {
      configureFirstVehicleVisit(result, vehicle);
    }
    return;
  }

  if (selectedVisitStage === "second") {
    showToast("No unfinished first weighment was found for this vehicle", "warning");
  }
  configureFirstVehicleVisit(result, vehicle);
}

async function loadMasterData() {
  const [adminResponse, fieldSettingsResponse, vehiclesResponse, vehicleTypesResponse, materialsResponse, customersResponse] = await Promise.all([
    fetch(adminSettingsApiUrl),
    fetch(customFieldSettingsApiUrl),
    fetch(masterUrls.vehicles),
    fetch(masterUrls.vehicleTypes),
    fetch(masterUrls.materials),
    fetch(masterUrls.customers)
  ]);

  if (!adminResponse.ok) throw new Error("Failed to load admin settings");
  if (!fieldSettingsResponse.ok) throw new Error("Failed to load field settings");
  if (!vehiclesResponse.ok) throw new Error("Failed to load vehicle master");
  if (!vehicleTypesResponse.ok) throw new Error("Failed to load vehicle types");
  if (!materialsResponse.ok) throw new Error("Failed to load material master");
  if (!customersResponse.ok) throw new Error("Failed to load customer master");

  const [adminSettings, fieldSettings, vehicles, vehicleTypes, materials, customers] = await Promise.all([
    adminResponse.json(),
    fieldSettingsResponse.json(),
    vehiclesResponse.json(),
    vehicleTypesResponse.json(),
    materialsResponse.json(),
    customersResponse.json()
  ]);

  rfidEnabled = adminSettings.settings?.rfidEnabled !== false;
  tareWeightEnabled = adminSettings.settings?.tareWeightEnabled !== false;
  liveWeightEnabled = adminSettings.settings?.liveWeightEnabled !== false;
  if (liveWeightCard) liveWeightCard.dataset.liveWeightEnabled = String(liveWeightEnabled);
  vehicleRecords.splice(0, vehicleRecords.length, ...vehicles);
  vehicleTypeRecords.splice(0, vehicleTypeRecords.length, ...vehicleTypes);
  materialRecords.splice(0, materialRecords.length, ...materials);
  customerRecords.splice(0, customerRecords.length, ...customers);
  applyRuntimeBuiltinFieldSettings(fieldSettings);
  applyWeightCaptureMode();
  syncPreview();
}

fields.vehicleNo.addEventListener("input", () => {
  clearSelectedPreviousVisit();
  dismissPreviousWeighmentPrompt();
  vehicleVisitLookupToken += 1;
  fields.vehicleNo.value = formatVehicleNo(fields.vehicleNo.value);
  renderVehicleFilter();
});
fields.vehicleNo.addEventListener("focus", () => hideFilter(vehicleFilter));
fields.vehicleNo.addEventListener("blur", () => {
  if (previousWeighmentModal?.classList.contains("show")) return;
  const record = findVehicleRecord(fields.vehicleNo.value);
  if (record) applyVehicleRecord(record);
  else if (vehicleNeedsRegistrationBlock() && !vehicleRegistrationPromptActive) {
    window.setTimeout(() => {
      if (document.activeElement !== fields.vehicleNo && blockUntilVehicleRegistered(document.activeElement)) {
        fields.vehicleNo.focus();
      }
    }, 0);
  }
});

document.addEventListener("focusin", event => {
  if (blockUntilVehicleRegistered(event.target)) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

document.addEventListener("mousedown", event => {
  if (blockUntilVehicleRegistered(event.target)) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

visitStageButtons.forEach(button => {
  button.addEventListener("keydown", event => {
    if (event.key === "Tab") {
      event.preventDefault();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter" || event.key === " ") {
      button.click();
      return;
    }
    const currentIndex = visitStageButtons.indexOf(button);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(currentIndex + offset, visitStageButtons.length - 1));
    const nextButton = visitStageButtons[nextIndex];
    visitStageButtons.forEach(option => {
      option.tabIndex = option === nextButton ? 0 : -1;
    });
    nextButton?.focus();
  });
  button.addEventListener("click", () => {
    if (registeredReadOnly) return;
    clearSelectedPreviousVisit();
    dismissPreviousWeighmentPrompt();
    const stage = button.dataset.visitStage === "second" ? "second" : "first";
    setVisitStage(stage);
    fields.vehicleNo.focus();

    const cleanVehicleNo = normalizeVehicleNo(fields.vehicleNo.value);
    if (stage === "second") {
      if (!isValidVehicleNo(cleanVehicleNo)) {
        return;
      }
      ensureVehicleRegisteredBeforeProgress({ openAddDialog: true })
        .then(isRegistered => {
          if (isRegistered) {
            lookupVehicleVisit().catch(error => showToast(error.message || "Failed to load previous weighment"));
          }
        })
        .catch(error => showToast(error.message || "Failed to register vehicle", "warning"));
      return;
    }

    vehicleVisitLookupToken += 1;
    if (cleanVehicleNo && !findVehicleRecord(cleanVehicleNo)) {
      ensureVehicleRegisteredBeforeProgress({ openAddDialog: true })
        .then(isRegistered => {
          if (!isRegistered) return;
          configureFirstVehicleVisit({}, findVehicleRecord(fields.vehicleNo.value));
          loadNextTicket().catch(error => showToast(error.message || "Failed to load next ticket"));
        })
        .catch(error => showToast(error.message || "Failed to register vehicle", "warning"));
      return;
    }
    configureFirstVehicleVisit({}, findVehicleRecord(fields.vehicleNo.value));
    loadNextTicket().catch(error => showToast(error.message || "Failed to load next ticket"));
  });
});

fields.material.addEventListener("input", renderMaterialFilter);
fields.material.addEventListener("focus", renderMaterialFilter);
fields.material.addEventListener("blur", () => {
  const record = findMaterialRecord(fields.material.value);
  if (record) applyMaterialRecord(record);
  else if (isEmptyLoadSelected()) fields.material.value = EMPTY_MATERIAL;
});

fields.weighingType.addEventListener("input", applyWeighingTypeRules);
fields.weighingType.addEventListener("change", () => {
  applyWeighingTypeRules();
  applyMasterTareForFirstFullLoad();
});

fields.customer.addEventListener("input", renderCustomerFilter);
fields.customer.addEventListener("focus", renderCustomerFilter);
fields.customer.addEventListener("blur", () => {
  const record = findCustomerRecord(fields.customer.value, splitMobileNumberEntry(fields.mobileNo.value).primary);
  if (record) applyCustomerRecord(record);
});

fields.mobileNo.addEventListener("input", () => {
  fields.mobileNo.value = normalizeMobileNumberEntry(fields.mobileNo.value);
  renderMobileFilter();
});
fields.mobileNo.addEventListener("focus", renderMobileFilter);
fields.mobileNo.addEventListener("blur", () => {
  fields.mobileNo.value = normalizeMobileNumberEntry(fields.mobileNo.value).replace(/,+$/, "");
});
fields.charge1.addEventListener("input", syncPreview);
fields.charge2.addEventListener("input", syncPreview);
fields.gross.addEventListener("input", () => {
  if (isManualWeightMode() && isFullLoadSelected() && hasNumericValue(fields.gross.value)) {
    syncGrossTimestampFromForm();
  }
  calculateNet();
  updateManualWeightDisplay();
  syncPreview();
});
fields.tare.addEventListener("input", () => {
  if (applyMasterTareForCycle && isFullLoadSelected()) {
    appliedMasterTareValue = fields.tare.value.trim();
  }
  if (isManualWeightMode() && hasNumericValue(fields.tare.value) && (isEmptyLoadSelected() || isFullLoadSelected())) {
    syncTareTimestampFromForm();
  }
  calculateNet();
  updateManualWeightDisplay();
  syncPreview();
});

document.addEventListener("click", event => {
  if (!event.target.closest(".float-field") && !event.target.closest(".vehicle-focus")) {
    hideAllFilters();
  }
});

document.addEventListener("keydown", event => {
  if (event.altKey && normalizeText(event.key) === "T") {
    if (tareWeightEnabled && isFullLoadSelected() && hasNumericValue(fields.tare.value)) {
      event.preventDefault();
      tareEditEnabled = true;
      appliedMasterTareValue = fields.tare.value.trim();
      fields.tare.readOnly = false;
      setTareEditMode(true);
      fields.tare.focus();
      fields.tare.select?.();
    }
    return;
  }

  const activeField = document.activeElement;
  const activeFilter = activeField?.closest?.(".vehicle-filter");

  if (activeFilter) {
    const buttons = getSuggestionButtons(activeFilter);
    const currentIndex = buttons.indexOf(activeField);

    if (event.key === "Enter") {
      event.preventDefault();
      (activeField?.click || buttons[0]?.click)?.call(activeField ?? buttons[0]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusSuggestionButton(activeFilter, currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusSuggestionButton(activeFilter, currentIndex > 0 ? currentIndex - 1 : 0);
    } else if (event.key === "Escape") {
      event.preventDefault();
      hideFilter(activeFilter);
      const sourceField = [...suggestionSources.entries()].find(([, value]) => value.filter === activeFilter)?.[0];
      sourceField?.focus?.();
    }
    return;
  }

  const field = event.target.closest("input, select");
  if (!field) return;

  if (event.key === "ArrowDown" && suggestionSources.has(field)) {
    event.preventDefault();
    openSuggestionFilter(field, true);
  }
});

form.addEventListener("input", syncPreview);
form.addEventListener("change", syncPreview);
form.addEventListener("keydown", event => {
  const field = event.target.closest("input, select");
  if (event.key !== "Enter" || !field) return;

  if (field === fields.customer) {
    event.preventDefault();
    hideFilter(customerFilter);
    const customerName = String(fields.customer.value || "").trim();
    const existingCustomer = customerRecords.find(
      row => normalizeText(row.customerName) === normalizeText(customerName)
    );
    if (existingCustomer) {
      applyCustomerRecord(existingCustomer);
      fields.paymentMode.focus();
      return;
    }
    if (!customerName) {
      if (!fields.mobileNo.disabled) fields.mobileNo.focus();
      else focusNextFormField(fields.customer);
      return;
    }
    handleAddMasterRequest("customer", masterPages.customer, {
      customer: customerName,
      mobile: fields.mobileNo.value
    }).catch(error => showToast(error.message || "Failed to add customer", "warning"));
    return;
  }

  const suggestionSource = suggestionSources.get(field);
  if (suggestionSource) {
    const sourceFilter = suggestionSource.filter;
    if (sourceFilter.classList.contains("show")) {
      const fieldValue = String(field.value || "").trim();
      event.preventDefault();
      if (!fieldValue) {
        hideFilter(sourceFilter);
        focusNextFormField(field);
        return;
      }

      const activeSuggestion = sourceFilter.querySelector(".vehicle-option:focus") || sourceFilter.querySelector(".vehicle-option");
      if (activeSuggestion) {
        activeSuggestion.click();
        return;
      }
    }
  }

  if (field === fields.vehicleNo) {
    event.preventDefault();
    ensureVehicleRegisteredBeforeProgress({ openAddDialog: true }).catch(error => {
      showToast(error.message || "Failed to register vehicle", "warning");
    });
    return;
  }

  if (field === fields.weighingType) {
    event.preventDefault();
    applyMasterTareForFirstFullLoad();
    focusNextFormField(field);
    return;
  }

  if (field === fields.tare && normalizeText(fields.weighingType.value) === "FULL LOAD") {
    event.preventDefault();
    fields.material.focus();
    fields.material.select?.();
    return;
  }

  if (field === fields.material && normalizeText(fields.weighingType.value) === "FULL LOAD") {
    event.preventDefault();
    saveButton.click();
    return;
  }

  event.preventDefault();
  focusNextFormField(field);
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (selectedVisitStage === "second" && !selectedPreviousVisitEntry && !currentVehicleVisitEntry) {
    if (previousWeighmentModal?.classList.contains("show")) return;
    try {
      await lookupVehicleVisit();
    } catch (error) {
      showToast(error.message || "Failed to load previous weighment");
      return;
    }
    if (selectedVisitStage !== "second" || (!selectedPreviousVisitEntry && !currentVehicleVisitEntry)) return;
  }
  if (selectedVisitStage === "second" && selectedPreviousVisitEntry) {
    setVehicleVisitEntry(selectedPreviousVisitEntry);
  }
  await syncActiveWeightFieldFromLive();
  if (applyMasterTareForCycle && hasNumericValue(appliedMasterTareValue)) {
    fields.tare.value = appliedMasterTareValue;
    if (!fields.tareEntryDate.value || !fields.tareEntryTime.value) {
      syncTareTimestampFromForm();
    }
  }
  calculateNet();
  if (!validateRequiredFields()) return;
  if (!validateMasterSelection()) return;
  if (!validateChargeValues()) return;

  setSaveButtonSavingState(true);
  let saveSucceeded = false;
  try {
    const response = await fetch("/api/weighments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildWeighmentPayload())
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to save weighment");
    }

    if (tareWeightEnabled && result.entry && normalizeText(result.entry.weighingType) === "EMPTY" && hasNumericValue(result.entry.tareWeight)) {
      updateLocalVehicleMasterTare(result.entry.vehicleNo, result.entry.tareWeight);
    }
    if (tareWeightEnabled && result.entry && applyMasterTareForCycle && hasNumericValue(result.entry.tareWeight)) {
      updateLocalVehicleMasterTare(result.entry.vehicleNo, result.entry.tareWeight);
    }

    if (result.entry) {
      applyWeighmentEntry(result.entry);
    } else {
      if (result.serialNo) fields.serialNo.value = result.serialNo;
      if (result.refNo) fields.refNo.value = result.refNo;
      setRegisteredReadOnly(true);
    }
    setSaveButtonSavingState(false);
    showToast("Weight entry saved successfully");
    if (result.whatsapp?.queued) {
      window.setTimeout(() => showToast(result.whatsapp.message || "WhatsApp message queued"), 350);
    }
    window.setTimeout(() => {
      setSaveButtonSavingState(false);
      startNewWeighment({ showToastMessage: false });
    }, 2000);
    saveSucceeded = true;
  } catch (error) {
    showToast(error.message || "Failed to save weighment");
  } finally {
    if (!saveSucceeded) {
      setSaveButtonSavingState(false);
    }
  }
});

document.querySelector("#newBtn").addEventListener("click", () => {
  startNewWeighment();
});

function buildWeighmentPrintData() {
  if (currentWeighmentEntry) {
    return currentWeighmentEntry;
  }
  const customValues = typeof getCustomFieldValues === "function" ? getCustomFieldValues() : {};
  return {
    id: 0,
    serialNo: fields.serialNo.value || "WB-2026-0042",
    refNo: fields.refNo.value || "",
    entryDate: fields.date.value || "",
    entryTime: fields.time.value || "",
    vehicleNo: fields.vehicleNo.value || "",
    customer: fields.customer.value || "",
    material: fields.material.value || "",
    weighingType: fields.weighingType.value || "",
    paymentMode: fields.paymentMode.value || "",
    charges: fields.charge1.value || "0.00",
    grossWeight: fields.gross.value || "",
    grossTime: fields.grossEntryTime.value || "",
    grossDate: fields.grossEntryDate.value || "",
    tareWeight: fields.tare.value || "",
    tareTime: fields.tareEntryTime.value || "",
    tareDate: fields.tareEntryDate.value || "",
    netWeight: fields.net.value || "",
    customFields: customValues,
  };
}

document.querySelector("#printBtn").addEventListener("click", () => {
  const isPdfPrinter = activePrinterType === "pdf" || /pdf/i.test(activePrinterName || "");
  const isDotMatrix = activePrinterType === "dot_matrix";
  const shouldSkipPreview = directPrintEnabled || isDotMatrix || isPdfPrinter;

  if (isPdfPrinter) {
    showToast("Saving ticket as PDF...", "success");
  } else if (activePrinterName || activePrinterType) {
    const printerLabels = {
      dot_matrix: "Dot Matrix Printer",
      a4: "A4 Printer",
      a5: "A5 Printer",
      thermal: "Thermal Printer",
      pdf: "PDF Printer"
    };
    const printerLabel = activePrinterName || printerLabels[activePrinterType] || (activePrinterType.toUpperCase() + " Printer");
    showToast("Printing ticket using " + printerLabel + "...", "success");
  } else {
    showToast("No printer configured", "warning");
    return;
  }

  const entryId = Number(currentWeighmentEntry?.id || 0);

  // 1. Direct RAW Line Spooling for Dot Matrix (No preview popup!)
  if (isDotMatrix) {
    const rawPayload = {
      entryId: (entryId && registeredReadOnly) ? entryId : null,
      entry: buildWeighmentPrintData(),
      printerName: activePrinterName || "",
      feedMode: "auto_40",
      lineWidth: 80,
      sendEscpInit: true,
    };
    fetch("/settings/api/printer/direct-raw-print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rawPayload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showToast(`Direct RAW print job sent to ${data.printerName} (${data.totalLines} lines)`, "success");
        } else {
          showToast(data.message || "Direct RAW print failed", "warning");
        }
      })
      .catch(err => {
        showToast("Direct print connection error: " + (err.message || "Failed to reach print spooler"), "error");
      });
    return;
  }

  // 2. Standard Preview Window for other printers (A4 / A5 / Thermal)
  let printWindow = null;
  if (entryId && registeredReadOnly) {
    printWindow = window.open(buildPrintPreviewUrl(entryId, false, shouldSkipPreview), "_blank");
  } else {
    try {
      window.sessionStorage.setItem(
        PRINTER_DRAFT_STORAGE_KEY,
        JSON.stringify(buildWeighmentPrintData())
      );
    } catch (error) {
      showToast("Unable to prepare print ticket");
      return;
    }
    printWindow = window.open(buildPrintPreviewUrl(0, true, shouldSkipPreview), "_blank");
  }

  if (!printWindow) {
    showToast("Please allow popups to print ticket", "warning");
  }
});
prevButton?.addEventListener("click", () => {
  if (!hasPreviousWeighmentRecord) return;
  loadWeighmentBySerial(fields.serialNo.value, "prev").catch(error => showToast(error.message || "Failed to load previous entry"));
});
nextButton?.addEventListener("click", () => {
  if (!hasNextWeighmentRecord) return;
  loadWeighmentBySerial(fields.serialNo.value, "next").catch(error => showToast(error.message || "Failed to load next entry"));
});
document.querySelector("#searchBtn").addEventListener("click", () => {
  const serialNo = window.prompt("Enter S.No", fields.serialNo.value);
  if (serialNo === null) return;
  loadWeighmentBySerial(serialNo, "current").catch(error => showToast(error.message || "Failed to search S.No"));
});
document.querySelector("#resendBtn")?.addEventListener("click", async () => {
  const entryId = Number(currentWeighmentEntry?.id || 0);
  if (!entryId || !registeredReadOnly) {
    showToast("Save or load a weighment before resend", "warning");
    return;
  }

  try {
    const response = await fetch(`/api/weighments/${entryId}/whatsapp/resend`, {
      method: "POST"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Failed to resend WhatsApp message");
    }
    showToast(result.message || "WhatsApp message queued");
  } catch (error) {
    showToast(error.message || "Failed to resend WhatsApp message");
  }
});

setDateTime();
fields.charge1.value = "";
fields.charge2.value = "0";
calculateChargeTotal();
setWeighmentNavigationState();
startClock();
syncPreview();
loadDashboardCameras();
applyWeightCaptureMode();
Promise.all([loadMasterData(), loadNextTicket()])
  .catch(error => {
    showToast(error.message || "Failed to load page data");
  })
  .finally(() => {
    if (openNewEntryOnLoad) {
      startNewWeighment({ showToastMessage: false });
      return;
    }
    window.setTimeout(() => visitStageButtons[0]?.focus(), 0);
  });

window.addEventListener("beforeunload", stopLiveWeightUpdates);
