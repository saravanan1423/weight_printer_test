const customerApiUrl = "/master/api/customers";
const creditApiUrl = "/master/api/customer-credits";

const customerRows = [];
const creditRows = [];

const creditTableBody = document.querySelector("#creditTableBody");
const creditForm = document.querySelector("#creditEntryForm");
const creditCustomerInput = document.querySelector("#creditCustomerInput");
const creditCustomerFilter = document.querySelector("#creditCustomerFilter");
const totalCreditInput = document.querySelector("#totalCreditInput");
const creditSearchInput = document.querySelector("#creditSearchInput");
const clearCreditFormButton = document.querySelector("#clearCreditForm");
const deleteCreditRowButton = document.querySelector("#deleteCreditRow");
const saveCreditButton = document.querySelector("#saveCreditButton");
const addCreditButton = document.querySelector("#addCreditButton");
const creditHistoryInfoButton = document.querySelector("#creditHistoryInfo");
const creditHistoryModal = document.querySelector("#creditHistoryModal");
const creditHistoryCloseButton = document.querySelector("#creditHistoryClose");
const creditHistoryCustomer = document.querySelector("#creditHistoryCustomer");
const creditHistoryBody = document.querySelector("#creditHistoryBody");
const creditPager = window.createFrontendPagination({
  mount: document.querySelector(".credit-table-wrap"),
  pageSize: 10,
  onPageChange: renderCreditTable
});
const creditHistoryApiUrl = id => `${creditApiUrl}/${id}/history`;

let selectedCreditId = null;

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) return "";
  const parts = String(value).split("-");
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : String(value);
}

function formatCreditStatus(row) {
  return row.creditAvailable <= 0 ? "No credits left recharge it" : "";
}

function setCreditMode() {
  const isEditing = selectedCreditId !== null;
  saveCreditButton.textContent = isEditing ? "Edit" : "Save";
  creditCustomerInput.disabled = isEditing;
  creditCustomerFilter.classList.remove("show");
  deleteCreditRowButton.hidden = !isEditing;
  addCreditButton.hidden = !isEditing;
}

function renderCustomerOptions() {
  const query = creditCustomerInput.value.trim().toUpperCase();

  creditCustomerFilter.innerHTML = "";

  if (!query || creditCustomerInput.disabled) {
    creditCustomerFilter.classList.remove("show");
    return;
  }

  const matches = customerRows.filter(row => (
    row.customerName.toUpperCase().includes(query)
  )).slice(0, 8);

  if (!matches.length) {
    creditCustomerFilter.classList.remove("show");
    return;
  }

  matches.forEach(row => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vehicle-option";
    button.textContent = row.customerName;
    button.addEventListener("click", () => {
      creditCustomerInput.value = row.customerName;
      creditCustomerFilter.classList.remove("show");
    });
    creditCustomerFilter.appendChild(button);
  });

  creditCustomerFilter.classList.add("show");
}

function getCustomerByName(customerName) {
  return customerRows.find(
    row => row.customerName.trim().toUpperCase() === customerName.trim().toUpperCase()
  );
}

function fillCreditForm(id) {
  const row = creditRows.find(credit => credit.id === id);
  if (!row) return;

  selectedCreditId = row.id;
  creditCustomerInput.value = row.customerName;
  totalCreditInput.value = row.totalCredit;
  closeCreditHistoryModal();
  setCreditMode();
  renderCreditTable();
}

function renderCreditTable() {
  creditTableBody.innerHTML = "";
  const query = creditSearchInput.value.trim().toUpperCase();
  const rows = creditRows.filter(row => {
    if (!query) return true;
    return [
      row.serialNo,
      row.customerName,
      String(row.totalCredit),
      String(row.creditUsed),
      String(row.creditAvailable)
    ].some(value => value.toUpperCase().includes(query));
  });
  const selectedIndex = rows.findIndex(row => row.id === selectedCreditId);
  const visibleRows = creditPager ? creditPager.slice(rows, selectedIndex) : rows;

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="4">No record found</td>';
    creditTableBody.appendChild(tr);
    return;
  }

  visibleRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.classList.toggle("active", row.id === selectedCreditId);
    tr.innerHTML = `
      <td>${row.customerName}</td>
      <td>${formatMoney(row.totalCredit)}</td>
      <td>${formatMoney(row.creditUsed)}</td>
      <td>
        <div>${formatMoney(row.creditAvailable)}</div>
        ${formatCreditStatus(row) ? `<small>${formatCreditStatus(row)}</small>` : ""}
      </td>
    `;
    tr.addEventListener("click", () => fillCreditForm(row.id));
    creditTableBody.appendChild(tr);
  });
}

function setCreditHistoryModalOpen(isOpen) {
  if (!creditHistoryModal) return;
  creditHistoryModal.hidden = !isOpen;
  creditHistoryModal.style.display = isOpen ? "grid" : "none";
}

function closeCreditHistoryModal() {
  setCreditHistoryModalOpen(false);
}

setCreditHistoryModalOpen(false);

async function openCreditHistory(creditId) {
  const row = creditRows.find(credit => credit.id === creditId);
  if (!row) return;

  creditHistoryCustomer.textContent = row.customerName;
  creditHistoryBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
  setCreditHistoryModalOpen(true);

  try {
    const response = await fetch(creditHistoryApiUrl(creditId));
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to load credit history");
    }

    const historyRows = result.history || [];
    if (!historyRows.length) {
      creditHistoryBody.innerHTML = '<tr><td colspan="4">No credit usage history found</td></tr>';
      return;
    }

    creditHistoryBody.innerHTML = "";
    historyRows.forEach(entry => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${entry.vehicleNo || ""}</td>
        <td>${formatDate(entry.entryDate)}</td>
        <td>${entry.entryTime || ""}</td>
        <td>${formatMoney(entry.amount)}</td>
      `;
      creditHistoryBody.appendChild(tr);
    });
  } catch (error) {
    creditHistoryBody.innerHTML = `<tr><td colspan="4">${error.message || "Failed to load credit history"}</td></tr>`;
  }
}

function resetCreditForm() {
  creditForm.reset();
  selectedCreditId = null;
  closeCreditHistoryModal();
  setCreditMode();
  renderCreditTable();
  creditCustomerInput.focus();
}

async function loadCustomers() {
  const response = await fetch(customerApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load customers");
  }

  const rows = (await response.json()).sort((left, right) => right.id - left.id);
  customerRows.splice(0, customerRows.length, ...rows);
  renderCustomerOptions();
}

async function loadCredits(selectId = null) {
  const response = await fetch(creditApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load credit entries");
  }

  const rows = (await response.json()).sort((left, right) => right.id - left.id);
  creditRows.splice(0, creditRows.length, ...rows);

  if (!creditRows.length) {
    resetCreditForm();
    return;
  }

  if (selectId !== null) {
    const selectedRow = creditRows.find(row => row.id === selectId);
    if (selectedRow) {
      fillCreditForm(selectedRow.id);
      return;
    }
  }

  if (selectedCreditId !== null) {
    const selectedRow = creditRows.find(row => row.id === selectedCreditId);
    if (selectedRow) {
      fillCreditForm(selectedRow.id);
      return;
    }
  }

  selectedCreditId = null;
  setCreditMode();
  renderCreditTable();
}

creditForm.addEventListener("submit", async event => {
  event.preventDefault();
  await submitCreditForm("update");
});

addCreditButton.addEventListener("click", async () => {
  await submitCreditForm("add");
});

async function submitCreditForm(action) {
  const isAdding = action === "add";

  const customerName = creditCustomerInput.value.trim();
  const creditAmount = Number(totalCreditInput.value || 0);
  const isEditing = selectedCreditId !== null;
  const selectedRow = isEditing
    ? creditRows.find(row => row.id === selectedCreditId)
    : null;
  const customer = isEditing
    ? customerRows.find(row => row.id === selectedRow?.customerId)
    : getCustomerByName(customerName);

  creditCustomerInput.value = customerName;

  if (!customer) {
    showToast("Select a valid customer");
    return;
  }

  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    showToast("Credit amount must be greater than zero");
    return;
  }

  if (isAdding && !isEditing) {
    showToast("Select a credit entry to add credit");
    return;
  }

  try {
    const response = await fetch(
      isAdding || !isEditing ? creditApiUrl : `${creditApiUrl}/${selectedCreditId}`,
      {
        method: isAdding || !isEditing ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customerId: customer.id,
          creditAmount
        })
      }
    );
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.message || `Failed to ${isAdding ? "add" : isEditing ? "update" : "save"} credit`
      );
    }

    showToast(
      result.message || `${customerName} credit ${isAdding ? "added" : isEditing ? "updated" : "saved"}`
    );
    creditPager?.reset();
    selectedCreditId = null;
    await Promise.all([loadCustomers(), loadCredits()]);
    resetCreditForm();
  } catch (error) {
    showToast(
      error.message || `Failed to ${isAdding ? "add" : isEditing ? "update" : "save"} credit`
    );
  }
}

clearCreditFormButton.addEventListener("click", () => {
  resetCreditForm();
});

deleteCreditRowButton.addEventListener("click", async () => {
  const selectedRow = creditRows.find(row => row.id === selectedCreditId);
  if (!selectedRow) {
    showToast("Select a credit entry to delete");
    return;
  }

  if (!window.confirm(`Delete credit entry for ${selectedRow.customerName}?`)) return;

  try {
    const response = await fetch(`${creditApiUrl}/${selectedRow.id}`, {
      method: "DELETE"
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete credit entry");
    }

    showToast(result.message || `${selectedRow.customerName} credit deleted`);
    selectedCreditId = null;
    await loadCredits();
  } catch (error) {
    showToast(error.message || "Failed to delete credit entry");
  }
});

creditHistoryInfoButton?.addEventListener("click", async () => {
  if (selectedCreditId === null) {
    showToast("Select a credit entry to view history");
    return;
  }
  await openCreditHistory(selectedCreditId);
});

creditHistoryCloseButton?.addEventListener("click", closeCreditHistoryModal);

creditHistoryModal?.addEventListener("click", event => {
  if (event.target === creditHistoryModal) {
    closeCreditHistoryModal();
  }
});

creditSearchInput.addEventListener("input", () => {
  creditPager?.reset();
  renderCreditTable();
});

creditCustomerInput.addEventListener("input", renderCustomerOptions);
creditCustomerInput.addEventListener("focus", renderCustomerOptions);

document.addEventListener("click", event => {
  if (!event.target.closest(".credit-picker")) {
    creditCustomerFilter.classList.remove("show");
  }
});

Promise.all([loadCustomers(), loadCredits()]).catch(error => {
  resetCreditForm();
  renderCreditTable();
  showToast(error.message || "Failed to load credit management data");
});
