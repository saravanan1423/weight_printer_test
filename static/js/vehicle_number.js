const vehicleApiUrl = "/master/api/vehicles";
const vehicleNextRfiApiUrl = "/master/api/vehicles/next-rfi";
const vehicleTypeApiUrl = "/master/api/vehicle-types";
const adminSettingsApiUrl = "/settings/api/admin";
const vehicleRows = [];
const vehicleTypeRows = [];

const tableBody = document.querySelector("#vehicleTableBody");
const form = document.querySelector("#vehicleEntryForm");
const vehicleNumberInput = document.querySelector("#vehicleNumberInput");
const refNumberInput = document.querySelector("#refNumberInput");
const vehicleTypeInput = document.querySelector("#vehicleTypeInput");
const vehicleSearchInput = document.querySelector("#vehicleSearchInput");
const tareWeightInput = document.querySelector("#tareWeight");
const clearVehicleFormButton = document.querySelector("#clearVehicleForm");
const deleteVehicleRowButton = document.querySelector("#deleteVehicleRow");
const vehiclePager = window.createFrontendPagination({
  mount: document.querySelector(".vehicle-table-wrap"),
  pageSize: 10,
  onPageChange: renderTable
});

let selectedVehicleId = null;
let nextRfiNumber = "1";
let rfidEnabled = true;
let tareWeightEnabled = true;

function applyFeatureVisibility() {
  document.querySelectorAll(".rfid-field, .rfid-column").forEach(element => {
    element.hidden = !rfidEnabled;
  });
  document.querySelectorAll(".tare-weight-field, .tare-weight-column").forEach(element => {
    element.hidden = !tareWeightEnabled;
  });
  tareWeightInput.required = tareWeightEnabled;
}

function getMasterPrefill() {
  const params = new URLSearchParams(window.location.search);
  return {
    fromWeighment: params.get("from") === "weighment",
    vehicle: (params.get("vehicle") || params.get("prefill") || "").trim()
  };
}

function applyMasterPrefill() {
  const prefill = getMasterPrefill();
  if (prefill.vehicle && selectedVehicleId === null) {
    vehicleNumberInput.value = formatVehicleNumber(prefill.vehicle);
    vehicleNumberInput.focus();
  }
}

function normalizeVehicleNumber(value) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
}

function formatVehicleNumber(value) {
  return normalizeVehicleNumber(value);
}

function isValidVehicleNumber(value) {
  return /^[A-Z0-9]{6,12}$/.test(normalizeVehicleNumber(value));
}

function formatTareWeight(value) {
  const tareWeight = Number(value);
  return Number.isInteger(tareWeight) ? String(tareWeight) : tareWeight.toFixed(2);
}

function calculateNextRfiFromRows() {
  const maxRfi = vehicleRows.reduce((highest, row) => {
    const value = String(row.rfiNumber || "").trim();
    return /^\d+$/.test(value) ? Math.max(highest, Number(value)) : highest;
  }, 0);
  return String(maxRfi + 1);
}

function setGeneratedFormDefaults() {
  if (selectedVehicleId !== null) return;
  refNumberInput.value = nextRfiNumber || calculateNextRfiFromRows();
  tareWeightInput.value = "0";
}

function renderVehicleTypeOptions() {
  const currentValue = vehicleTypeInput.value;
  vehicleTypeInput.innerHTML = '<option value="">Select vehicle type</option>';

  vehicleTypeRows.forEach(row => {
    const option = document.createElement("option");
    option.value = String(row.id);
    option.textContent = row.vehicleTypeName;
    vehicleTypeInput.appendChild(option);
  });

  if (currentValue && vehicleTypeRows.some(row => String(row.id) === currentValue)) {
    vehicleTypeInput.value = currentValue;
  }
}

function setVehicleMode() {
  const isEditing = selectedVehicleId !== null;
  form.querySelector('button[type="submit"]').textContent = isEditing ? "Update" : "Save";
  deleteVehicleRowButton.hidden = !isEditing;
}

function fillForm(id) {
  const row = vehicleRows.find(vehicle => vehicle.id === id);
  if (!row) return;

  selectedVehicleId = row.id;
  vehicleNumberInput.value = formatVehicleNumber(row.vehicleNumber);
  refNumberInput.value = row.rfiNumber || "";
  tareWeightInput.value = row.tareWeight;
  vehicleTypeInput.value = String(row.vehicleTypeId);
  setVehicleMode();
  renderTable();
}

function renderTable() {
  tableBody.innerHTML = "";
  const query = vehicleSearchInput.value.trim().toUpperCase();
  const rows = vehicleRows.filter(row => {
    if (!query) return true;
    return [
      row.serialNo,
      formatVehicleNumber(row.vehicleNumber),
      rfidEnabled ? (row.rfiNumber || "") : "",
      tareWeightEnabled ? String(row.tareWeight) : "",
      row.vehicleTypeName
    ].some(value => value.toUpperCase().includes(query));
  });
  const selectedIndex = rows.findIndex(row => row.id === selectedVehicleId);
  const visibleRows = vehiclePager ? vehiclePager.slice(rows, selectedIndex) : rows;

  if (!rows.length) {
    const tr = document.createElement("tr");
    const columnCount = 3 + Number(rfidEnabled) + Number(tareWeightEnabled);
    tr.innerHTML = `<td colspan="${columnCount}">No record found</td>`;
    tableBody.appendChild(tr);
    return;
  }

  const pageOffset = vehiclePager ? (vehiclePager.getCurrentPage() - 1) * vehiclePager.pageSize : 0;

  visibleRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("active", row.id === selectedVehicleId);
    tr.innerHTML = `
      <td>${pageOffset + index + 1}</td>
      <td>${formatVehicleNumber(row.vehicleNumber)}</td>
      <td>${row.vehicleTypeName}</td>
      ${tareWeightEnabled ? `<td>${formatTareWeight(row.tareWeight)} kg</td>` : ""}
      ${rfidEnabled ? `<td>${row.rfiNumber || ""}</td>` : ""}
    `;
    tr.addEventListener("click", () => fillForm(row.id));
    tableBody.appendChild(tr);
  });
}

function resetForm() {
  form.reset();
  selectedVehicleId = null;
  setVehicleMode();
  renderVehicleTypeOptions();
  setGeneratedFormDefaults();
  renderTable();
  vehicleNumberInput.focus();
}

async function loadNextRfiNumber() {
  try {
    const response = await fetch(vehicleNextRfiApiUrl);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Failed to load next RFID");
    }
    nextRfiNumber = result.rfiNumber || calculateNextRfiFromRows();
  } catch (error) {
    nextRfiNumber = calculateNextRfiFromRows();
  }
  setGeneratedFormDefaults();
}

async function loadAdminSettings() {
  try {
    const response = await fetch(adminSettingsApiUrl);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Failed to load admin settings");
    }
    rfidEnabled = result.settings?.rfidEnabled !== false;
    tareWeightEnabled = result.settings?.tareWeightEnabled !== false;
  } catch (error) {
    rfidEnabled = true;
    tareWeightEnabled = true;
  }
  applyFeatureVisibility();
}

async function loadVehicleTypes() {
  const response = await fetch(vehicleTypeApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load vehicle types");
  }

  const rows = (await response.json()).sort((left, right) => right.id - left.id);
  vehicleTypeRows.splice(0, vehicleTypeRows.length, ...rows);
  renderVehicleTypeOptions();
}

async function loadVehicles(selectId = null) {
  const response = await fetch(vehicleApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load vehicles");
  }

  const rows = (await response.json()).sort((left, right) => right.id - left.id);
  vehicleRows.splice(0, vehicleRows.length, ...rows);

  if (!vehicleRows.length) {
    resetForm();
    return;
  }

  if (selectId !== null) {
    const selectedRow = vehicleRows.find(row => row.id === selectId);
    if (selectedRow) {
      fillForm(selectedRow.id);
      return;
    }
  }

  if (selectedVehicleId !== null) {
    const selectedRow = vehicleRows.find(row => row.id === selectedVehicleId);
    if (selectedRow) {
      fillForm(selectedRow.id);
      return;
    }
  }

  selectedVehicleId = null;
  setVehicleMode();
  setGeneratedFormDefaults();
  renderTable();
}

vehicleNumberInput.addEventListener("input", () => {
  vehicleNumberInput.value = formatVehicleNumber(vehicleNumberInput.value);
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  const vehicleNumber = normalizeVehicleNumber(vehicleNumberInput.value);
  const rfiNumber = refNumberInput.value.trim().toUpperCase();
  const tareWeight = tareWeightInput.value.trim();
  const vehicleTypeId = vehicleTypeInput.value;

  vehicleNumberInput.value = formatVehicleNumber(vehicleNumber);
  refNumberInput.value = rfiNumber;

  if (!isValidVehicleNumber(vehicleNumber)) {
    showToast("Vehicle number must contain 6 to 12 letters or numbers");
    return;
  }

  if (tareWeightEnabled && !tareWeight) {
    showToast("Tare weight is required");
    return;
  }

  if (!vehicleTypeId) {
    showToast("Vehicle type is required");
    return;
  }

  const isEditing = selectedVehicleId !== null;

  try {
    const response = await fetch(
      isEditing ? `${vehicleApiUrl}/${selectedVehicleId}` : vehicleApiUrl,
      {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          vehicleNumber,
          rfiNumber,
          tareWeight: tareWeightEnabled ? tareWeight : null,
          vehicleTypeId
        })
      }
    );
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || `Failed to ${isEditing ? "update" : "save"} vehicle`);
    }

    const toastVariant = getMasterPrefill().fromWeighment ? "warning" : null;
    showToast(result.message || `${formatVehicleNumber(vehicleNumber)} saved`, toastVariant);
    vehiclePager?.reset();
    selectedVehicleId = null;
    await Promise.all([loadVehicleTypes(), loadVehicles()]);
    await loadNextRfiNumber();
    resetForm();
  } catch (error) {
    showToast(error.message || `Failed to ${isEditing ? "update" : "save"} vehicle`);
  }
});

clearVehicleFormButton.addEventListener("click", () => {
  resetForm();
});

deleteVehicleRowButton.addEventListener("click", async () => {
  const selectedRow = vehicleRows.find(row => row.id === selectedVehicleId);
  if (!selectedRow) {
    showToast("Select a vehicle to delete");
    return;
  }

  if (!window.confirm(`Delete ${formatVehicleNumber(selectedRow.vehicleNumber)}?`)) return;

  try {
    const response = await fetch(`${vehicleApiUrl}/${selectedRow.id}`, {
      method: "DELETE"
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete vehicle");
    }

    showToast(result.message || `${formatVehicleNumber(selectedRow.vehicleNumber)} deleted`);
    selectedVehicleId = null;
    await loadVehicles();
    await loadNextRfiNumber();
  } catch (error) {
    showToast(error.message || "Failed to delete vehicle");
  }
});

vehicleSearchInput.addEventListener("input", () => {
  vehiclePager?.reset();
  renderTable();
});

loadAdminSettings()
  .then(() => Promise.all([loadVehicleTypes(), loadVehicles()]))
  .then(loadNextRfiNumber)
  .then(() => {
    applyFeatureVisibility();
    renderTable();
    applyMasterPrefill();
  })
  .catch(error => {
    resetForm();
    renderTable();
    applyMasterPrefill();
    showToast(error.message || "Failed to load vehicle data");
  });
