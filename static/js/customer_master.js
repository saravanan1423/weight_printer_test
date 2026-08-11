const customerApiUrl = "/master/api/customers";
const customerRows = [];

const customerTableBody = document.querySelector("#customerTableBody");
const customerForm = document.querySelector("#customerEntryForm");
const customerNameInput = document.querySelector("#customerNameInput");
const mobileNumberInput = document.querySelector("#mobileNumberInput");
const mobileNumber2Input = document.querySelector("#mobileNumber2Input");
const customerSearchInput = document.querySelector("#customerSearchInput");
const clearCustomerFormButton = document.querySelector("#clearCustomerForm");
const deleteCustomerRowButton = document.querySelector("#deleteCustomerRow");
const customerPager = window.createFrontendPagination({
  mount: document.querySelector(".customer-table-wrap"),
  pageSize: 10,
  onPageChange: renderCustomerTable
});

let selectedCustomerId = null;

function getMasterPrefill() {
  const params = new URLSearchParams(window.location.search);
  return {
    fromWeighment: params.get("from") === "weighment",
    customer: (params.get("customer") || params.get("prefill") || "").trim(),
    mobile: sanitizeMobileNumber(params.get("mobile") || "")
  };
}

function applyMasterPrefill() {
  const prefill = getMasterPrefill();
  if (selectedCustomerId !== null) return;
  if (prefill.customer) customerNameInput.value = prefill.customer;
  if (prefill.mobile) mobileNumberInput.value = prefill.mobile;
  if (prefill.customer || prefill.mobile) {
    (prefill.customer ? customerNameInput : mobileNumberInput).focus();
  }
}

function sanitizeMobileNumber(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function isValidMobileNumber(value) {
  return /^\d{10}$/.test(value);
}

function setCustomerMode() {
  const isEditing = selectedCustomerId !== null;
  customerForm.querySelector('button[type="submit"]').textContent = isEditing ? "Update" : "Save";
  deleteCustomerRowButton.hidden = !isEditing;
}

function fillCustomerForm(id) {
  const row = customerRows.find(customer => customer.id === id);
  if (!row) return;

  selectedCustomerId = row.id;
  customerNameInput.value = row.customerName;
  mobileNumberInput.value = row.mobileNumber || "";
  mobileNumber2Input.value = row.mobileNumber2 || "";
  setCustomerMode();
  renderCustomerTable();
}

function renderCustomerTable() {
  customerTableBody.innerHTML = "";
  const query = customerSearchInput.value.trim().toUpperCase();
  const rows = customerRows.filter(row => {
    if (!query) return true;
    return [row.serialNo, row.customerName, row.mobileNumber || "", row.mobileNumber2 || ""]
      .some(value => value.toUpperCase().includes(query));
  });
  const selectedIndex = rows.findIndex(row => row.id === selectedCustomerId);
  const visibleRows = customerPager ? customerPager.slice(rows, selectedIndex) : rows;

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="4">No record found</td>';
    customerTableBody.appendChild(tr);
    return;
  }

  const pageOffset = customerPager ? (customerPager.getCurrentPage() - 1) * customerPager.pageSize : 0;

  visibleRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("active", row.id === selectedCustomerId);
    tr.innerHTML = `
      <td>${pageOffset + index + 1}</td>
      <td>${row.customerName}</td>
      <td>${row.mobileNumber || ""}</td>
      <td>${row.mobileNumber2 || ""}</td>
    `;
    tr.addEventListener("click", () => fillCustomerForm(row.id));
    customerTableBody.appendChild(tr);
  });
}

function resetCustomerForm() {
  customerForm.reset();
  selectedCustomerId = null;
  setCustomerMode();
  renderCustomerTable();
  customerNameInput.focus();
}

async function loadCustomers(selectId = null) {
  const response = await fetch(customerApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load customers");
  }

  const rows = (await response.json()).sort((left, right) => right.id - left.id);
  customerRows.splice(0, customerRows.length, ...rows);

  if (!customerRows.length) {
    resetCustomerForm();
    return;
  }

  if (selectId !== null) {
    const selectedRow = customerRows.find(row => row.id === selectId);
    if (selectedRow) {
      fillCustomerForm(selectedRow.id);
      return;
    }
  }

  if (selectedCustomerId !== null) {
    const selectedRow = customerRows.find(row => row.id === selectedCustomerId);
    if (selectedRow) {
      fillCustomerForm(selectedRow.id);
      return;
    }
  }

  selectedCustomerId = null;
  setCustomerMode();
  renderCustomerTable();
}

mobileNumberInput.addEventListener("input", () => {
  mobileNumberInput.value = sanitizeMobileNumber(mobileNumberInput.value);
});
mobileNumber2Input.addEventListener("input", () => {
  mobileNumber2Input.value = sanitizeMobileNumber(mobileNumber2Input.value);
});

customerForm.addEventListener("submit", async event => {
  event.preventDefault();
  const customerName = customerNameInput.value.trim();
  const mobileNumber = sanitizeMobileNumber(mobileNumberInput.value.trim());
  const mobileNumber2 = sanitizeMobileNumber(mobileNumber2Input.value.trim());

  customerNameInput.value = customerName;
  mobileNumberInput.value = mobileNumber;
  mobileNumber2Input.value = mobileNumber2;

  if (!customerName) {
    showToast("Customer name is required");
    return;
  }

  if (mobileNumber && !isValidMobileNumber(mobileNumber)) {
    showToast("Mobile number must be exactly 10 digits");
    return;
  }
  if (mobileNumber2 && !isValidMobileNumber(mobileNumber2)) {
    showToast("Mobile number 2 must be exactly 10 digits");
    return;
  }

  const isEditing = selectedCustomerId !== null;

  try {
    const response = await fetch(
      isEditing ? `${customerApiUrl}/${selectedCustomerId}` : customerApiUrl,
      {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ customerName, mobileNumber, mobileNumber2 })
      }
    );
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || `Failed to ${isEditing ? "update" : "save"} customer`);
    }

    const toastVariant = getMasterPrefill().fromWeighment ? "warning" : null;
    showToast(result.message || `${customerName} saved`, toastVariant);
    customerPager?.reset();
    selectedCustomerId = null;
    await loadCustomers();
    resetCustomerForm();
  } catch (error) {
    showToast(error.message || `Failed to ${isEditing ? "update" : "save"} customer`);
  }
});

clearCustomerFormButton.addEventListener("click", () => {
  resetCustomerForm();
});

deleteCustomerRowButton.addEventListener("click", async () => {
  const selectedRow = customerRows.find(row => row.id === selectedCustomerId);
  if (!selectedRow) {
    showToast("Select a customer to delete");
    return;
  }

  if (!window.confirm(`Delete ${selectedRow.customerName}?`)) return;

  try {
    const response = await fetch(`${customerApiUrl}/${selectedRow.id}`, {
      method: "DELETE"
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete customer");
    }

    showToast(result.message || `${selectedRow.customerName} deleted`);
    selectedCustomerId = null;
    await loadCustomers();
  } catch (error) {
    showToast(error.message || "Failed to delete customer");
  }
});

customerSearchInput.addEventListener("input", () => {
  customerPager?.reset();
  renderCustomerTable();
});

loadCustomers()
  .then(applyMasterPrefill)
  .catch(error => {
    resetCustomerForm();
    renderCustomerTable();
    applyMasterPrefill();
    showToast(error.message || "Failed to load customers");
  });
