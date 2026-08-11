const materialApiUrl = "/master/api/materials";
const materialRows = [];

const itemTableBody = document.querySelector("#itemTableBody");
const itemForm = document.querySelector("#itemEntryForm");
const itemNameInput = document.querySelector("#itemNameInput");
const itemSearchInput = document.querySelector("#itemSearchInput");
const clearItemFormButton = document.querySelector("#clearItemForm");
const deleteItemRowButton = document.querySelector("#deleteItemRow");
const materialPager = window.createFrontendPagination({
  mount: document.querySelector(".item-table-wrap"),
  pageSize: 10,
  onPageChange: renderMaterialTable
});

let selectedMaterialId = null;

function getMasterPrefill() {
  const params = new URLSearchParams(window.location.search);
  return {
    fromWeighment: params.get("from") === "weighment",
    material: (params.get("material") || params.get("prefill") || "").trim()
  };
}

function applyMasterPrefill() {
  const prefill = getMasterPrefill();
  if (prefill.material && selectedMaterialId === null) {
    itemNameInput.value = prefill.material;
    itemNameInput.focus();
  }
}

function setMaterialMode() {
  const isEditing = selectedMaterialId !== null;
  itemForm.querySelector('button[type="submit"]').textContent = isEditing ? "Update" : "Save";
  deleteItemRowButton.hidden = !isEditing;
}

function fillMaterialForm(id) {
  const row = materialRows.find(material => material.id === id);
  if (!row) return;

  selectedMaterialId = row.id;
  itemNameInput.value = row.materialName;
  setMaterialMode();
  renderMaterialTable();
}

function renderMaterialTable() {
  itemTableBody.innerHTML = "";
  const query = itemSearchInput.value.trim().toUpperCase();
  const rows = materialRows.filter(row => {
    if (!query) return true;
    return [row.serialNo, row.materialName].some(value => value.toUpperCase().includes(query));
  });
  const selectedIndex = rows.findIndex(row => row.id === selectedMaterialId);
  const visibleRows = materialPager ? materialPager.slice(rows, selectedIndex) : rows;

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="2">No record found</td>';
    itemTableBody.appendChild(tr);
    return;
  }

  const pageOffset = materialPager ? (materialPager.getCurrentPage() - 1) * materialPager.pageSize : 0;

  visibleRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("active", row.id === selectedMaterialId);
    tr.innerHTML = `
      <td>${pageOffset + index + 1}</td>
      <td>${row.materialName}</td>
    `;
    tr.addEventListener("click", () => fillMaterialForm(row.id));
    itemTableBody.appendChild(tr);
  });

}

function resetMaterialForm() {
  itemForm.reset();
  selectedMaterialId = null;
  setMaterialMode();
  renderMaterialTable();
  itemNameInput.focus();
}

async function loadMaterials(selectId = null) {
  const response = await fetch(materialApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load materials");
  }

  const rows = (await response.json()).sort((left, right) => right.id - left.id);
  materialRows.splice(0, materialRows.length, ...rows);

  if (!materialRows.length) {
    resetMaterialForm();
    return;
  }

  if (selectId !== null) {
    const selectedRow = materialRows.find(row => row.id === selectId);
    if (selectedRow) {
      fillMaterialForm(selectedRow.id);
      return;
    }
  }

  if (selectedMaterialId !== null) {
    const selectedRow = materialRows.find(row => row.id === selectedMaterialId);
    if (selectedRow) {
      fillMaterialForm(selectedRow.id);
      return;
    }
  }

  selectedMaterialId = null;
  setMaterialMode();
  renderMaterialTable();
}

itemForm.addEventListener("submit", async event => {
  event.preventDefault();
  const materialName = itemNameInput.value.trim();
  if (!materialName) {
    showToast("Material is required");
    return;
  }

  const isEditing = selectedMaterialId !== null;
  const response = await fetch(
    isEditing ? `${materialApiUrl}/${selectedMaterialId}` : materialApiUrl,
    {
      method: isEditing ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ materialName })
    }
  );

  const result = await response.json().catch(() => ({}));

  try {
    if (!response.ok) {
      throw new Error(result.message || `Failed to ${isEditing ? "update" : "save"} material`);
    }

    const toastVariant = getMasterPrefill().fromWeighment ? "warning" : null;
    showToast(result.message || `${materialName} saved`, toastVariant);
    materialPager?.reset();
    selectedMaterialId = null;
    await loadMaterials();
    resetMaterialForm();
  } catch (error) {
    showToast(error.message || `Failed to ${isEditing ? "update" : "save"} material`);
  }
});

clearItemFormButton.addEventListener("click", () => {
  resetMaterialForm();
});

deleteItemRowButton.addEventListener("click", async () => {
  const selectedRow = materialRows.find(row => row.id === selectedMaterialId);
  if (!selectedRow) {
    showToast("Select a material to delete");
    return;
  }

  if (!window.confirm(`Delete ${selectedRow.materialName}?`)) return;

  try {
    const response = await fetch(`${materialApiUrl}/${selectedRow.id}`, {
      method: "DELETE"
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete material");
    }

    showToast(result.message || `${selectedRow.materialName} deleted`);
    selectedMaterialId = null;
    await loadMaterials();
  } catch (error) {
    showToast(error.message || "Failed to delete material");
  }
});

itemSearchInput.addEventListener("input", () => {
  materialPager?.reset();
  renderMaterialTable();
});

loadMaterials()
  .then(applyMasterPrefill)
  .catch(error => {
    resetMaterialForm();
    renderMaterialTable();
    applyMasterPrefill();
    showToast(error.message || "Failed to load materials");
  });
