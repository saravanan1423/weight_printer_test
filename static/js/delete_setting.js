const deleteSettingApiUrl = "/settings/api/delete-setting/weighments";
const deleteTableBody = document.querySelector("#deleteTableBody");
const deleteSearch = document.querySelector("#deleteSearch");
const deleteFromDate = document.querySelector("#deleteFromDate");
const deleteToDate = document.querySelector("#deleteToDate");
const applyDeleteDateFilter = document.querySelector("#applyDeleteDateFilter");
const clearDeleteDateFilter = document.querySelector("#clearDeleteDateFilter");
const deleteSelectedWeighments = document.querySelector("#deleteSelectedWeighments");
const selectAllDeleteRows = document.querySelector("#selectAllDeleteRows");
const deleteSettingForm = document.querySelector("#deleteSettingForm");
const customEditFields = document.querySelector("#customEditFields");
const editStatus = document.querySelector("#editStatus");
const updateWeighmentButton = document.querySelector("#updateWeighmentButton");
const deleteWeighmentButton = document.querySelector("#deleteWeighmentButton");
const clearDeleteForm = document.querySelector("#clearDeleteForm");

const editFields = {
  serialNo: document.querySelector("#editSerialNo"),
  refNo: document.querySelector("#editRefNo"),
  entryDate: document.querySelector("#editEntryDate"),
  entryTime: document.querySelector("#editEntryTime"),
  vehicleNo: document.querySelector("#editVehicleNo"),
  weighingType: document.querySelector("#editWeighingType"),
  material: document.querySelector("#editMaterial"),
  customer: document.querySelector("#editCustomer"),
  mobileNo: document.querySelector("#editMobileNo"),
  paymentMode: document.querySelector("#editPaymentMode"),
  charges: document.querySelector("#editCharges"),
  grossWeight: document.querySelector("#editGrossWeight"),
  grossDate: document.querySelector("#editGrossDate"),
  grossTime: document.querySelector("#editGrossTime"),
  tareWeight: document.querySelector("#editTareWeight"),
  tareDate: document.querySelector("#editTareDate"),
  tareTime: document.querySelector("#editTareTime"),
  netWeight: document.querySelector("#editNetWeight")
};

let weighmentRows = [];
let customFieldColumns = [];
let selectedWeighmentId = null;
const selectedDeleteIds = new Set();

function normalizeVehicleNumber(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
}

editFields.vehicleNo.addEventListener("input", () => {
  editFields.vehicleNo.value = normalizeVehicleNumber(editFields.vehicleNo.value);
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDisplayDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatFieldLabel(value) {
  return String(value || "").replace(/_/g, " ");
}

function activeRows() {
  const query = deleteSearch.value.trim().toUpperCase();
  if (!query) return weighmentRows;

  return weighmentRows.filter(row => [
    row.serialNo,
    row.refNo,
    row.entryDate,
    row.vehicleNo,
    row.customer,
    row.material,
    row.mobileNo
  ].some(value => String(value ?? "").toUpperCase().includes(query)));
}

function syncBulkDeleteState() {
  deleteSelectedWeighments.disabled = selectedDeleteIds.size === 0;
  if (!selectAllDeleteRows) return;

  const rows = activeRows();
  const selectableIds = rows.map(row => row.id);
  const selectedVisibleCount = selectableIds.filter(id => selectedDeleteIds.has(id)).length;
  selectAllDeleteRows.checked = selectableIds.length > 0 && selectedVisibleCount === selectableIds.length;
  selectAllDeleteRows.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < selectableIds.length;
}

function renderTable() {
  const rows = activeRows();
  deleteTableBody.innerHTML = "";

  if (!rows.length) {
    deleteTableBody.innerHTML = '<tr><td colspan="5">No registered weighments found.</td></tr>';
    syncBulkDeleteState();
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.classList.toggle("active", row.id === selectedWeighmentId);
    tr.innerHTML = `
      <td><input class="delete-row-check" type="checkbox" data-id="${escapeHtml(row.id)}" aria-label="Select S.No ${escapeHtml(row.serialNo)}" ${selectedDeleteIds.has(row.id) ? "checked" : ""}></td>
      <td>${escapeHtml(row.serialNo)}</td>
      <td>${escapeHtml(row.vehicleNo)}</td>
      <td class="customer-cell" title="${escapeHtml(row.customer)}">${escapeHtml(row.customer)}</td>
      <td>
        <div class="row-action-buttons">
          <button class="icon-action edit-action" type="button" data-action="edit" data-id="${escapeHtml(row.id)}" title="Edit" aria-label="Edit S.No ${escapeHtml(row.serialNo)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
          </button>
          <button class="icon-action delete-action" type="button" data-action="delete" data-id="${escapeHtml(row.id)}" title="Delete" aria-label="Delete S.No ${escapeHtml(row.serialNo)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 15h10l1-15"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
          </button>
        </div>
      </td>
    `;
    tr.addEventListener("click", () => selectRow(row.id));
    deleteTableBody.appendChild(tr);
  });
  syncBulkDeleteState();
}

function renderCustomFields(row = {}) {
  customEditFields.innerHTML = customFieldColumns.map(column => `
    <div class="float-field">
      <input id="editCustom${escapeHtml(column)}" name="${escapeHtml(column)}" value="${escapeHtml((row.customFields || {})[column] || "")}">
      <label for="editCustom${escapeHtml(column)}">${escapeHtml(formatFieldLabel(column))}</label>
    </div>
  `).join("");
}

function setActionsEnabled(enabled) {
  updateWeighmentButton.disabled = !enabled;
  deleteWeighmentButton.disabled = !enabled;
}

function resetForm() {
  selectedWeighmentId = null;
  deleteSettingForm.reset();
  renderCustomFields();
  editStatus.textContent = "Select a row to edit or delete it.";
  setActionsEnabled(false);
  renderTable();
}

function selectRow(id) {
  const row = weighmentRows.find(item => item.id === id);
  if (!row) return;

  selectedWeighmentId = row.id;
  Object.entries(editFields).forEach(([key, field]) => {
    field.value = row[key] ?? "";
  });
  renderCustomFields(row);
  editStatus.textContent = `Editing S.No ${row.serialNo}`;
  setActionsEnabled(true);
  renderTable();
}

function collectCustomFields() {
  return Array.from(customEditFields.querySelectorAll("input[name]")).reduce((values, input) => {
    values[input.name] = input.value.trim();
    return values;
  }, {});
}

function buildPayload() {
  return {
    serialNo: editFields.serialNo.value.trim(),
    refNo: editFields.refNo.value.trim(),
    entryDate: editFields.entryDate.value.trim(),
    entryTime: editFields.entryTime.value.trim(),
    vehicleNo: normalizeVehicleNumber(editFields.vehicleNo.value),
    weighingType: editFields.weighingType.value.trim(),
    material: editFields.material.value.trim(),
    customer: editFields.customer.value.trim(),
    mobileNo: editFields.mobileNo.value.trim(),
    paymentMode: editFields.paymentMode.value.trim(),
    charges: editFields.charges.value.trim(),
    grossWeight: editFields.grossWeight.value.trim(),
    grossDate: editFields.grossDate.value.trim(),
    grossTime: editFields.grossTime.value.trim(),
    tareWeight: editFields.tareWeight.value.trim(),
    tareDate: editFields.tareDate.value.trim(),
    tareTime: editFields.tareTime.value.trim(),
    netWeight: editFields.netWeight.value.trim(),
    customFields: collectCustomFields()
  };
}

async function loadRows(selectId = null) {
  const params = new URLSearchParams();
  if (deleteFromDate.value) params.set("fromDate", deleteFromDate.value);
  if (deleteToDate.value) params.set("toDate", deleteToDate.value);
  const response = await fetch(`${deleteSettingApiUrl}${params.toString() ? `?${params}` : ""}`);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to load registered weighments");
  }

  weighmentRows = result.rows || [];
  selectedDeleteIds.forEach(id => {
    if (!weighmentRows.some(row => row.id === id)) {
      selectedDeleteIds.delete(id);
    }
  });
  customFieldColumns = result.customFieldColumns || [];
  renderCustomFields();
  renderTable();

  if (selectId) {
    selectRow(selectId);
  }
}

async function deleteRow(row) {
  if (!row) {
    showToast("Select a weighment entry to delete");
    return;
  }

  const enteredPassword = window.prompt(
    `Enter common password to delete S.No ${row.serialNo}`,
    ""
  );

  if (enteredPassword === null) return;

  try {
    const response = await fetch(`${deleteSettingApiUrl}/${row.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: enteredPassword.trim() })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete weighment");
    }

    showToast(result.message || "Weighment deleted");
    selectedDeleteIds.delete(row.id);
    resetForm();
    await loadRows();
  } catch (error) {
    showToast(error.message || "Failed to delete weighment");
  }
}

async function deleteSelectedRows() {
  const ids = Array.from(selectedDeleteIds);
  if (!ids.length) {
    showToast("Select at least one weighment entry");
    return;
  }

  const enteredPassword = window.prompt(
    `Enter common password to delete ${ids.length} selected entries`,
    ""
  );
  if (enteredPassword === null) return;

  try {
    const response = await fetch(`${deleteSettingApiUrl}/bulk-delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ids,
        password: enteredPassword.trim()
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete selected weighments");
    }

    showToast(result.message || "Selected weighments deleted");
    selectedDeleteIds.clear();
    resetForm();
    await loadRows();
  } catch (error) {
    showToast(error.message || "Failed to delete selected weighments");
  }
}

deleteTableBody.addEventListener("click", event => {
  const checkbox = event.target.closest(".delete-row-check");
  if (checkbox) {
    event.stopPropagation();
    const rowId = Number(checkbox.dataset.id);
    if (checkbox.checked) {
      selectedDeleteIds.add(rowId);
    } else {
      selectedDeleteIds.delete(rowId);
    }
    syncBulkDeleteState();
    return;
  }

  const button = event.target.closest("button[data-id]");
  if (!button) return;
  event.stopPropagation();

  const row = weighmentRows.find(item => item.id === Number(button.dataset.id));
  if (button.dataset.action === "delete") {
    deleteRow(row);
    return;
  }

  selectRow(Number(button.dataset.id));
});

deleteSearch.addEventListener("input", renderTable);
applyDeleteDateFilter.addEventListener("click", () => loadRows().catch(error => showToast(error.message || "Failed to load registered weighments")));
clearDeleteDateFilter.addEventListener("click", () => {
  deleteFromDate.value = "";
  deleteToDate.value = "";
  loadRows().catch(error => showToast(error.message || "Failed to load registered weighments"));
});
deleteSelectedWeighments.addEventListener("click", deleteSelectedRows);
selectAllDeleteRows.addEventListener("change", () => {
  activeRows().forEach(row => {
    if (selectAllDeleteRows.checked) {
      selectedDeleteIds.add(row.id);
    } else {
      selectedDeleteIds.delete(row.id);
    }
  });
  renderTable();
});

deleteSettingForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!selectedWeighmentId) {
    showToast("Select a weighment entry to update");
    return;
  }

  try {
    const response = await fetch(`${deleteSettingApiUrl}/${selectedWeighmentId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildPayload())
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to update weighment");
    }

    showToast(result.message || "Weighment updated");
    await loadRows(selectedWeighmentId);
  } catch (error) {
    showToast(error.message || "Failed to update weighment");
  }
});

deleteWeighmentButton.addEventListener("click", async () => {
  const row = weighmentRows.find(item => item.id === selectedWeighmentId);
  await deleteRow(row);
});

clearDeleteForm.addEventListener("click", resetForm);

loadRows().catch(error => {
  resetForm();
  showToast(error.message || "Failed to load registered weighments");
});
