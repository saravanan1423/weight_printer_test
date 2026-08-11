const customFieldForm = document.querySelector("#customFieldForm");
const customFieldInput = document.querySelector("#customFieldInput");
const customFieldEnabled = document.querySelector("#customFieldEnabled");
const customFieldRequired = document.querySelector("#customFieldRequired");
const customFieldType = document.querySelector("#customFieldType");
const customFieldCalculation = document.querySelector("#customFieldCalculation");
const customFieldCalcLeft = document.querySelector("#customFieldCalcLeft");
const customFieldCalcRight = document.querySelector("#customFieldCalcRight");
const customFieldCalcOperator = document.querySelector("#customFieldCalcOperator");
const customFieldTableBody = document.querySelector("#customFieldTableBody");
const customFieldEntryMode = document.querySelector("#customFieldEntryMode");
const addCustomFieldButton = document.querySelector("#addCustomFieldButton");
const editCustomFieldButton = document.querySelector("#editCustomFieldButton");
const deleteCustomFieldButton = document.querySelector("#deleteCustomFieldButton");
const customFieldCount = document.querySelector("#customFieldCount");
const customFieldLimitCard = document.querySelector("#customFieldLimitCard");

const customFieldApiUrl = "/settings/api/custom-fields";
const customFieldMaxColumns = 5;
const requestedFieldScope = new URLSearchParams(window.location.search).get("scope");
const requestedMasterSection = new URLSearchParams(window.location.search).get("section");
const masterSectionFields = {
  vehicle_number: new Set(["master:vehicleNumber", "master:vehicleType", "master:tareWeight", "master:rfid"]),
  vehicle_type: new Set(["master:vehicleTypeName"]),
  material: new Set(["master:materialName"]),
  customer: new Set(["master:customerName", "master:mobileNumber", "master:mobileNumber2"])
};

let customFieldRows = [];
let selectedCustomFieldId = null;

function typeLabel(fieldType) {
  switch (fieldType) {
    case "numeric":
      return "Numeric";
    case "date":
      return "Date";
    default:
      return "Text";
  }
}

function operatorSymbol(operator) {
  switch (operator) {
    case "subtract":
      return "-";
    case "multiply":
      return "*";
    case "divide":
      return "/";
    default:
      return "+";
  }
}

function numericCustomRows(excludedId = null) {
  return customFieldRows.filter(row =>
    !row.isBuiltIn &&
    row.id !== excludedId &&
    row.fieldType === "numeric"
  );
}

function populateCalculationSelects(row = null) {
  const options = numericCustomRows(row?.id || null);
  const html = [
    '<option value="">No calculation</option>',
    ...options.map(option => `<option value="${option.id}">${option.columnName}</option>`)
  ].join("");
  customFieldCalcLeft.innerHTML = html;
  customFieldCalcRight.innerHTML = html;
  customFieldCalcLeft.value = row?.calculationLeft || "";
  customFieldCalcRight.value = row?.calculationRight || "";
  customFieldCalcOperator.value = row?.calculationOperator || "add";
}

function syncFieldTypeControls(row = null) {
  const isNumeric = customFieldType.value === "numeric";
  customFieldCalculation.hidden = !isNumeric;
  populateCalculationSelects(row);
  if (!isNumeric) {
    customFieldCalcLeft.value = "";
    customFieldCalcRight.value = "";
    customFieldCalcOperator.value = "add";
  }
}

function syncRequiredOption() {
  const isLocked = customFieldRequired.dataset.locked === "true";
  customFieldRequired.disabled = isLocked || !customFieldEnabled.checked;
  if (!customFieldEnabled.checked) customFieldRequired.checked = false;
}

function populateCustomFieldForm(row = null) {
  customFieldInput.value = row?.columnName || "";
  customFieldType.value = row?.fieldType || "text";
  customFieldEnabled.checked = row ? row.enabled !== false : true;
  customFieldRequired.checked = Boolean(row?.required);
  customFieldEnabled.disabled = Boolean(row && row.canDisable === false);
  customFieldRequired.dataset.locked = String(Boolean(row && row.canChangeRequired === false));
  customFieldType.disabled = Boolean(row?.isBuiltIn) || requestedFieldScope === "master";
  syncRequiredOption();
  syncFieldTypeControls(row);
}

function getCustomRows() {
  return customFieldRows.filter(row => !row.isBuiltIn);
}

function setCustomFieldMode() {
  const isEditing = selectedCustomFieldId !== null;
  customFieldEntryMode.textContent = isEditing ? "Edit" : "Add";
  editCustomFieldButton.disabled = !isEditing;
  const selectedRow = customFieldRows.find(row => row.id === selectedCustomFieldId);
  deleteCustomFieldButton.disabled = !isEditing || Boolean(selectedRow?.isBuiltIn);
  addCustomFieldButton.disabled = requestedFieldScope === "master" || isEditing || getCustomRows().length >= customFieldMaxColumns;
  customFieldCount.textContent = `${getCustomRows().length} / ${customFieldMaxColumns}`;
}

function renderCustomFieldTable() {
  customFieldTableBody.innerHTML = "";

  if (!customFieldRows.length) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = '<td colspan="6">No fields added</td>';
    customFieldTableBody.appendChild(emptyRow);
    setCustomFieldMode();
    return;
  }

  customFieldRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("active", row.id === selectedCustomFieldId);
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${row.columnName}</td>
      <td>${typeLabel(row.fieldType)}</td>
      <td>${row.calculationLeft && row.calculationRight ? `${row.calculationLeft} ${operatorSymbol(row.calculationOperator)} ${row.calculationRight}` : "-"}</td>
      <td>${row.enabled ? "Yes" : "No"}</td>
      <td>${row.required ? "Yes" : "No"}</td>
    `;
    tr.addEventListener("click", () => {
      selectedCustomFieldId = row.id;
      populateCustomFieldForm(row);
      setCustomFieldMode();
      renderCustomFieldTable();
    });
    customFieldTableBody.appendChild(tr);
  });

  setCustomFieldMode();
}

function resetCustomFieldSelection() {
  selectedCustomFieldId = null;
  customFieldForm.reset();
  populateCustomFieldForm();
  setCustomFieldMode();
  renderCustomFieldTable();
  customFieldInput.focus();
}

function getCustomFieldName() {
  return customFieldInput.value.trim();
}

function hasDuplicateCustomField(name, excludedId = null) {
  const normalizedName = name.toLowerCase();
  return customFieldRows.some(row => row.id !== excludedId && row.columnName.toLowerCase() === normalizedName);
}

async function loadCustomFieldRows(selectId = null) {
  const response = await fetch(customFieldApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load custom fields");
  }

  customFieldRows = await response.json();
  if (requestedFieldScope === "master") {
    customFieldRows = customFieldRows.filter(row => row.scope === "Master");
    const allowedFields = masterSectionFields[requestedMasterSection] || masterSectionFields.vehicle_number;
    customFieldRows = customFieldRows.filter(row => allowedFields.has(row.id));
  } else {
    customFieldRows = customFieldRows.filter(row => row.scope === "Weighment" || row.scope === "Custom");
  }

  if (selectId !== null) {
    const selectedRow = customFieldRows.find(row => row.id === selectId);
    if (selectedRow) {
      selectedCustomFieldId = selectedRow.id;
      populateCustomFieldForm(selectedRow);
    } else {
      selectedCustomFieldId = null;
      customFieldForm.reset();
      populateCustomFieldForm();
    }
  } else if (selectedCustomFieldId !== null) {
    const selectedRow = customFieldRows.find(row => row.id === selectedCustomFieldId);
    if (selectedRow) {
      populateCustomFieldForm(selectedRow);
    } else {
      selectedCustomFieldId = null;
      customFieldForm.reset();
      populateCustomFieldForm();
    }
  }

  renderCustomFieldTable();
}

customFieldForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (selectedCustomFieldId !== null) {
    editCustomFieldButton.click();
    return;
  }
  if (requestedFieldScope === "master") {
    showToast("Select a master field and click Save");
    return;
  }
  const name = getCustomFieldName();

  if (!name) {
    showToast("Column name is required");
    return;
  }

  if (getCustomRows().length >= customFieldMaxColumns) {
    showToast("Maximum 5 columns allowed");
    return;
  }

  if (hasDuplicateCustomField(name)) {
    showToast("Column name already exists");
    return;
  }

  try {
    const response = await fetch(customFieldApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        columnName: name,
        enabled: customFieldEnabled.checked,
        required: customFieldRequired.checked,
        fieldType: customFieldType.value,
        calculationLeft: customFieldCalcLeft.value,
        calculationRight: customFieldCalcRight.value,
        calculationOperator: customFieldCalcOperator.value
      })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to create column");
    }

    selectedCustomFieldId = null;
    customFieldForm.reset();
    populateCustomFieldForm();
    await loadCustomFieldRows();
    customFieldInput.focus();
    showToast(result.message);
  } catch (error) {
    showToast(error.message || "Failed to create column");
  }
});

editCustomFieldButton.addEventListener("click", async () => {
  const name = getCustomFieldName();
  const row = customFieldRows.find(item => item.id === selectedCustomFieldId);

  if (!row) {
    showToast("Select a column to edit");
    return;
  }

  if (!name) {
    showToast("Column name is required");
    return;
  }

  if (hasDuplicateCustomField(name, row.id)) {
    showToast("Column name already exists");
    return;
  }

  try {
    const response = await fetch(`${customFieldApiUrl}/${encodeURIComponent(row.id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        columnName: name,
        enabled: customFieldEnabled.checked,
        required: customFieldRequired.checked,
        fieldType: customFieldType.value,
        calculationLeft: customFieldCalcLeft.value,
        calculationRight: customFieldCalcRight.value,
        calculationOperator: customFieldCalcOperator.value
      })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to update column");
    }

    await loadCustomFieldRows(result.row?.id || row.id);
    showToast(result.message);
  } catch (error) {
    showToast(error.message || "Failed to update column");
  }
});

deleteCustomFieldButton.addEventListener("click", async () => {
  const row = customFieldRows.find(item => item.id === selectedCustomFieldId);

  if (!row) {
    showToast("Select a column to delete");
    return;
  }

  if (!window.confirm(`Delete ${row.columnName}?`)) return;

  try {
    const response = await fetch(`${customFieldApiUrl}/${encodeURIComponent(row.id)}`, {
      method: "DELETE"
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete column");
    }

    await loadCustomFieldRows();
    resetCustomFieldSelection();
    showToast(result.message);
  } catch (error) {
    showToast(error.message || "Failed to delete column");
  }
});

customFieldEnabled.addEventListener("change", syncRequiredOption);
customFieldType.addEventListener("change", () => syncFieldTypeControls(customFieldRows.find(row => row.id === selectedCustomFieldId) || null));

if (requestedFieldScope === "master") {
  addCustomFieldButton.hidden = true;
  customFieldLimitCard.hidden = true;
}

loadCustomFieldRows().catch(error => {
  customFieldRows = [];
  resetCustomFieldSelection();
  showToast(error.message || "Failed to load custom fields");
});
