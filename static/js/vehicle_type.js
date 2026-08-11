const vehicleTypeTableBody = document.querySelector("#vehicleTypeTableBody");
const vehicleTypeForm = document.querySelector("#vehicleTypeForm");
const vehicleTypeNameInput = document.querySelector("#vehicleTypeNameInput");
const vehicleTypeSearchInput = document.querySelector("#vehicleTypeSearchInput");
const vehicleTypeEntryMode = document.querySelector("#vehicleTypeEntryMode");
const vehicleTypeSubmitButton = document.querySelector("#vehicleTypeSubmitButton");
const vehicleTypePager = window.createFrontendPagination({
  mount: document.querySelector(".vehicle-type-table-wrap"),
  pageSize: 10,
  onPageChange: renderVehicleTypeTable
});

const vehicleTypeApiUrl = "/master/api/vehicle-types";
let vehicleTypeRows = [];
let selectedVehicleTypeId = null;

function setVehicleTypeMode() {
  const isEditing = selectedVehicleTypeId !== null;
  vehicleTypeEntryMode.textContent = isEditing ? "Edit" : "New";
  vehicleTypeSubmitButton.textContent = isEditing ? "Update" : "Save";
}

function fillVehicleTypeForm(id) {
  const row = vehicleTypeRows.find(item => item.id === id);
  if (!row) return;
  selectedVehicleTypeId = row.id;
  vehicleTypeNameInput.value = row.vehicleTypeName;
  setVehicleTypeMode();
  renderVehicleTypeTable();
}

function renderVehicleTypeTable() {
  vehicleTypeTableBody.innerHTML = "";
  const query = vehicleTypeSearchInput.value.trim().toUpperCase();
  const rows = vehicleTypeRows.filter(row => {
    if (!query) return true;
    return [row.serialNo, row.vehicleTypeName].some(value => value.toUpperCase().includes(query));
  });
  const selectedIndex = rows.findIndex(row => row.id === selectedVehicleTypeId);
  const visibleRows = vehicleTypePager ? vehicleTypePager.slice(rows, selectedIndex) : rows;

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="2">No record found</td>';
    vehicleTypeTableBody.appendChild(tr);
    return;
  }

  const pageOffset = vehicleTypePager ? (vehicleTypePager.getCurrentPage() - 1) * vehicleTypePager.pageSize : 0;

  visibleRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("active", row.id === selectedVehicleTypeId);
    tr.innerHTML = `
      <td>${pageOffset + index + 1}</td>
      <td>${row.vehicleTypeName}</td>
    `;
    tr.addEventListener("click", () => fillVehicleTypeForm(row.id));
    vehicleTypeTableBody.appendChild(tr);
  });
}

function resetVehicleTypeForm() {
  vehicleTypeForm.reset();
  selectedVehicleTypeId = null;
  setVehicleTypeMode();
  renderVehicleTypeTable();
  vehicleTypeNameInput.focus();
}

async function loadVehicleTypes(selectId = null) {
  const response = await fetch(vehicleTypeApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load vehicle types");
  }

  vehicleTypeRows = (await response.json()).sort((left, right) => right.id - left.id);

  if (!vehicleTypeRows.length) {
    resetVehicleTypeForm();
    return;
  }

  if (selectId !== null) {
    const selectedRow = vehicleTypeRows.find(row => row.id === selectId);
    if (selectedRow) {
      fillVehicleTypeForm(selectedRow.id);
      return;
    }
  }

  if (selectedVehicleTypeId !== null) {
    const selectedRow = vehicleTypeRows.find(row => row.id === selectedVehicleTypeId);
    if (selectedRow) {
      fillVehicleTypeForm(selectedRow.id);
      return;
    }
  }

  selectedVehicleTypeId = null;
  setVehicleTypeMode();
  renderVehicleTypeTable();
}

vehicleTypeForm.addEventListener("submit", async event => {
  event.preventDefault();
  const vehicleTypeName = vehicleTypeNameInput.value.trim();
  if (!vehicleTypeName) return;
  const isEditing = selectedVehicleTypeId !== null;
  const requestUrl = isEditing
    ? `${vehicleTypeApiUrl}/${selectedVehicleTypeId}`
    : vehicleTypeApiUrl;
  const requestMethod = isEditing ? "PUT" : "POST";

  try {
    const response = await fetch(requestUrl, {
      method: requestMethod,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        vehicleTypeName
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `Failed to ${isEditing ? "update" : "save"} vehicle type`);
    }

    showToast(result.message || (isEditing ? `${vehicleTypeName} updated` : `${vehicleTypeName} saved`));
    vehicleTypePager?.reset();
    selectedVehicleTypeId = null;
    await loadVehicleTypes();
    resetVehicleTypeForm();
  } catch (error) {
    showToast(error.message || `Failed to ${isEditing ? "update" : "save"} vehicle type`);
  }
});

document.querySelector("#clearVehicleTypeForm").addEventListener("click", () => {
  resetVehicleTypeForm();
});

document.querySelector("#deleteVehicleTypeRow").addEventListener("click", async () => {
  const selectedRow = vehicleTypeRows.find(row => row.id === selectedVehicleTypeId);
  if (!selectedRow) {
    showToast("Select a vehicle type to delete");
    return;
  }

  if (!window.confirm(`Delete ${selectedRow.vehicleTypeName}?`)) return;

  try {
    const response = await fetch(`${vehicleTypeApiUrl}/${selectedRow.id}`, {
      method: "DELETE"
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete vehicle type");
    }

    selectedVehicleTypeId = null;
    await loadVehicleTypes();
    showToast(result.message);
  } catch (error) {
    showToast(error.message || "Failed to delete vehicle type");
  }
});

vehicleTypeSearchInput.addEventListener("input", () => {
  vehicleTypePager?.reset();
  renderVehicleTypeTable();
});

loadVehicleTypes().catch(error => {
  resetVehicleTypeForm();
  renderVehicleTypeTable();
  showToast(error.message || "Failed to load vehicle types");
});
