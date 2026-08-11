let reportRows = [];
let customFieldColumns = [];
let visibleColumnKeys = [];
let currentReportPage = 1;

const MAX_VISIBLE_COLUMNS = 10;
const COMPACT_REPORT_PAGE_SIZE = 4;
const EXPANDED_REPORT_PAGE_SIZE = 10;
const defaultColumnKeys = ["billNo", "date", "customer", "vehicleNo", "vehicleType", "material", "netWt", "payment", "paidAmt", "status"];
const reportAlignmentStorageKey = "weighman:report-alignment";

const reportTableHead = document.querySelector("#reportTableHead");
const reportTableBody = document.querySelector("#reportTableBody");
const tableSearch = document.querySelector("#tableSearch");
const totalRecords = document.querySelector("#totalRecords");
const netWeight = document.querySelector("#netWeight");
const totalAmount = document.querySelector("#totalAmount");
const reportStatus = document.querySelector("#reportStatus");
const reportsCard = document.querySelector(".reports-card");
const viewOptionsToggle = document.querySelector("#viewOptionsToggle");
const tableExpand = document.querySelector("#tableExpand");
const reportControlsModal = document.querySelector("#reportControlsModal");
const closeReportControls = document.querySelector("#closeReportControls");
const additionalFieldsModal = document.querySelector("#additionalFieldsModal");
const additionalFieldsTitle = document.querySelector("#additionalFieldsTitle");
const additionalFieldsBody = document.querySelector("#additionalFieldsBody");
const closeAdditionalFields = document.querySelector("#closeAdditionalFields");
const fromDate = document.querySelector("#fromDate");
const toDate = document.querySelector("#toDate");
const customerFilter = document.querySelector("#customerFilter");
const vehicleFilter = document.querySelector("#vehicleFilter");
const materialFilter = document.querySelector("#materialFilter");
const vehicleTypeFilter = document.querySelector("#vehicleTypeFilter");
const columnConfig = document.querySelector("#columnConfig");
const reportTextAlign = document.querySelector("#reportTextAlign");
const selectedColumns = document.querySelector("#selectedColumns");
const availableColumns = document.querySelector("#availableColumns");
const columnConfigCount = document.querySelector("#columnConfigCount");
const resetColumns = document.querySelector("#resetColumns");
const emailReportButton = document.querySelector("#emailReport");
const emailReportLabel = document.querySelector("#emailReportLabel");
const reportPageInput = document.querySelector("#reportPageInput");
const reportPageTotal = document.querySelector("#reportPageTotal");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDisplayDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function setDateRange(startDate, endDate) {
  fromDate.value = formatDateInput(startDate);
  toDate.value = formatDateInput(endDate);
}

function setDefaultDateRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 6);
  setDateRange(start, today);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatAmount(value) {
  return Number(value || 0).toFixed(2);
}

function formatFieldLabel(value) {
  return String(value || "").replace(/_/g, " ");
}

function getReportAlignment() {
  const saved = window.localStorage.getItem(reportAlignmentStorageKey);
  return ["left", "center", "right"].includes(saved) ? saved : "left";
}

function setReportAlignment(alignment) {
  const normalized = ["left", "center", "right"].includes(alignment) ? alignment : "left";
  window.localStorage.setItem(reportAlignmentStorageKey, normalized);
  reportsCard?.setAttribute("data-report-align", normalized);
  if (reportTextAlign) {
    reportTextAlign.value = normalized;
  }
  return normalized;
}

function baseColumns() {
  return [
    { key: "billNo", label: "Bill No", value: row => row.billNo },
    { key: "refNo", label: "Ref No", value: row => row.refNo },
    { key: "date", label: "Date", value: row => formatDisplayDate(row.date) },
    { key: "time", label: "Time", value: row => row.time },
    { key: "vehicleNo", label: "Vehicle No", value: row => row.vehicleNo },
    { key: "vehicleType", label: "Vehicle Type", value: row => row.vehicleType },
    { key: "weighingType", label: "Weighing Type", value: row => row.weighingType },
    { key: "material", label: "Material", value: row => row.material },
    { key: "customer", label: "Customer", value: row => row.customer },
    { key: "mobileNo", label: "Mobile No", value: row => row.mobileNo },
    { key: "payment", label: "Payment", value: row => row.payment },
    { key: "paidAmt", label: "Paid Amt", value: row => formatAmount(row.paidAmt) },
    { key: "grossWt", label: "Gross Weight", value: row => formatNumber(row.grossWt) },
    { key: "grossDate", label: "Gross Date", value: row => formatDisplayDate(row.grossDate) },
    { key: "grossTime", label: "Gross Time", value: row => row.grossTime },
    { key: "tareWt", label: "Tare Weight", value: row => formatNumber(row.tareWt) },
    { key: "tareDate", label: "Tare Date", value: row => formatDisplayDate(row.tareDate) },
    { key: "tareTime", label: "Tare Time", value: row => row.tareTime },
    { key: "netWt", label: "Net Weight", value: row => formatNumber(row.netWt) },
    { key: "status", label: "Status", value: row => row.status }
  ];
}

function allColumns() {
  return [
    ...baseColumns(),
    ...customFieldColumns.map(column => ({
      key: `custom:${column}`,
      label: formatFieldLabel(column),
      value: row => (row.customFields || {})[column] || "-"
    }))
  ];
}

function validColumnKeys() {
  return allColumns().map(column => column.key);
}

function defaultVisibleColumnKeys() {
  return validColumnKeys().slice(0, MAX_VISIBLE_COLUMNS);
}

function saveVisibleColumns() {
  return fetch("/reports/api/column-layout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ columnKeys: visibleColumnKeys })
  })
    .then(response => response.json().then(result => ({ response, result })))
    .then(({ response, result }) => {
      if (!response.ok) {
        throw new Error(result.message || "Failed to save column layout");
      }
      visibleColumnKeys = result.columnLayout || visibleColumnKeys;
      return result;
    })
    .catch(error => {
      showToast(error.message || "Failed to save column layout");
    });
}

function syncVisibleColumns(savedColumnKeys = []) {
  const validKeys = validColumnKeys();
  const selected = visibleColumnKeys.length ? visibleColumnKeys : savedColumnKeys;
  visibleColumnKeys = selected
    .filter(key => validKeys.includes(key))
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .slice(0, MAX_VISIBLE_COLUMNS);

  if (!visibleColumnKeys.length) {
    visibleColumnKeys = defaultVisibleColumnKeys();
  }
}

function selectedColumnDefinitions() {
  const columns = allColumns();
  return visibleColumnKeys
    .map(key => columns.find(column => column.key === key))
    .filter(Boolean);
}

function reportColumnsWithSerialNumber(columns) {
  return [
    { key: "sNo", label: "S.No", value: (_, index) => String(index + 1) },
    ...columns
  ];
}

function exportTimestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("-");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportVisibleColumnsCsv() {
  const rows = activeRows();
  const columns = selectedColumnDefinitions();

  if (!rows.length) {
    showToast("No report rows to export");
    return;
  }

  if (!columns.length) {
    showToast("No report columns selected");
    return;
  }

  const printableColumns = reportColumnsWithSerialNumber(columns);
  const csv = [
    printableColumns.map(column => csvCell(column.label)).join(","),
    ...rows.map((row, index) => [String(index + 1), ...columns.map(column => column.value(row))].map(csvCell).join(","))
  ].join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = `weighment-report-${exportTimestamp()}.csv`;
  document.body.appendChild(link);
  showToast("Downloading started");
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function currentReportEmailPayload() {
  return {
    fromDate: fromDate.value,
    toDate: toDate.value,
    search: tableSearch.value.trim(),
    filters: {
      customer: customerFilter.value,
      vehicleNo: vehicleFilter.value,
      material: materialFilter.value,
      vehicleType: vehicleTypeFilter.value
    },
    columnKeys: visibleColumnKeys,
    alignment: getReportAlignment()
  };
}

function setEmailReportButtonState(isSending) {
  emailReportButton.disabled = isSending;
  emailReportLabel.textContent = isSending ? "Sending..." : "Email Report";
}

async function sendReportEmail() {
  const rows = activeRows();

  if (!rows.length) {
    showToast("No report rows to email");
    return;
  }

  setEmailReportButtonState(true);
  try {
    const response = await fetch("/reports/api/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(currentReportEmailPayload())
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to send report email");
    }

    showToast(result.message || "Report email sent successfully");
  } catch (error) {
    showToast(error.message || "Failed to send report email");
  } finally {
    setEmailReportButtonState(false);
  }
}

function buildReportTableHtml(rows, columns, alignment = "left") {
  const printableColumns = reportColumnsWithSerialNumber(columns);
  return `
    <table>
      <thead>
        <tr>${printableColumns.map(column => `<th style="text-align:${alignment}">${escapeHtml(column.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td style="text-align:${alignment}">${escapeHtml(String(index + 1))}</td>
            ${columns.map(column => `<td style="text-align:${alignment}">${escapeHtml(column.value(row))}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function fixedWidthCell(value, width) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length > width) {
    return `${text.slice(0, Math.max(0, width - 1))}.`;
  }
  return text.padEnd(width, " ");
}

function buildDotMatrixReportText(rows, columns) {
  const columnWidth = columns.length > 7 ? 14 : 18;
  const title = "WEIGHMENT REPORT";
  const dateRange = `${fromDate.value || "All dates"} to ${toDate.value || "All dates"}`;
  const printedAt = new Date().toLocaleString("en-IN");
  const printableColumns = reportColumnsWithSerialNumber(columns);
  const header = printableColumns.map(column => fixedWidthCell(column.label.toUpperCase(), columnWidth)).join(" ");
  const separator = printableColumns.map(() => "-".repeat(columnWidth)).join(" ");
  const body = rows.map((row, index) => [
    fixedWidthCell(String(index + 1), columnWidth),
    ...columns.map(column => fixedWidthCell(column.value(row), columnWidth))
  ].join(" ")).join("\n");

  return [
    title,
    `DATE: ${dateRange}`,
    `PRINTED: ${printedAt}`,
    `RECORDS: ${rows.length}`,
    "",
    header,
    separator,
    body
  ].join("\n");
}

function printVisibleColumnsReport() {
  const rows = activeRows();
  const columns = selectedColumnDefinitions();
  const alignment = getReportAlignment();

  if (!rows.length) {
    showToast("No report rows to print");
    return;
  }

  if (!columns.length) {
    showToast("No report columns selected");
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Please allow popups to print report");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Weighment Report</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { font-size: 18pt; margin: 0 0 6px; }
          .report-meta { font-size: 11pt; margin: 0 0 14px; }
          table { width: 100%; border-collapse: collapse; font-size: 13pt; }
          th { font-weight: 700; font-size: 15pt; white-space: nowrap; background: #e8eefc; }
          th, td { border: 1px solid #9aa6bd; padding: 8px 12px; text-align: left; }
          td { white-space: nowrap; }
        </style>
      </head>
      <body>
        <h1>Weighment Report</h1>
        <p class="report-meta">${escapeHtml(fromDate.value || "All dates")} to ${escapeHtml(toDate.value || "All dates")} · ${rows.length} records</p>
        ${buildReportTableHtml(rows, columns, alignment)}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function printDotMatrixReport() {
  const rows = activeRows();
  const columns = selectedColumnDefinitions();

  if (!rows.length) {
    showToast("No report rows to print");
    return;
  }

  if (!columns.length) {
    showToast("No report columns selected");
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Please allow popups to print report");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Dot Matrix Weighment Report</title>
        <style>
          @page { size: landscape; margin: 8mm; }
          body { margin: 0; color: #000; }
          pre {
            font-family: "Courier New", monospace;
            font-size: 10pt;
            line-height: 1.25;
            white-space: pre;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(buildDotMatrixReportText(rows, columns))}</pre>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function searchableFields(row) {
  return [
    row.id,
    row.billNo,
    row.refNo,
    row.date,
    row.time,
    row.customer,
    row.vehicleNo,
    row.vehicleType,
    row.material,
    row.netWt,
    row.payment,
    row.paidAmt,
    row.status,
    row.grossWt,
    row.tareWt,
    row.weighingType,
    row.mobileNo,
    ...Object.values(row.customFields || {})
  ];
}

function activeRows() {
  const query = tableSearch.value.trim().toUpperCase();
  const filters = {
    customer: customerFilter.value,
    vehicleNo: vehicleFilter.value,
    material: materialFilter.value,
    vehicleType: vehicleTypeFilter.value
  };

  return reportRows.filter(row => {
    const matchesQuery = !query || searchableFields(row).some(value => String(value ?? "").toUpperCase().includes(query));
    const matchesFilters = Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      return String(row[key] ?? "").toUpperCase() === value.toUpperCase();
    });
    return matchesQuery && matchesFilters;
  });
}

function isTableExpanded() {
  return reportsCard.classList.contains("table-fullscreen");
}

function getReportPageSize() {
  return isTableExpanded() ? EXPANDED_REPORT_PAGE_SIZE : COMPACT_REPORT_PAGE_SIZE;
}

function getPagedRows(rows) {
  const pageSize = getReportPageSize();
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  currentReportPage = Math.min(Math.max(1, currentReportPage), totalPages);
  const start = (currentReportPage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    start,
    pageSize,
    totalPages
  };
}

function setSelectOptions(select, rows, key) {
  const currentValue = select.value;
  const options = [...new Set(rows.map(row => row[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));

  select.innerHTML = '<option value="">All</option>';
  options.forEach(optionValue => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  });

  if (options.includes(currentValue)) {
    select.value = currentValue;
  }
}

function refreshFilterOptions() {
  setSelectOptions(customerFilter, reportRows, "customer");
  setSelectOptions(vehicleFilter, reportRows, "vehicleNo");
  setSelectOptions(materialFilter, reportRows, "material");
  setSelectOptions(vehicleTypeFilter, reportRows, "vehicleType");
}

function renderTableHead() {
  reportTableHead.innerHTML = `
    <th>S.No</th>
    ${selectedColumnDefinitions().map(column => `<th>${escapeHtml(column.label)}</th>`).join("")}
    <th>More</th>
  `;
}

function renderReports() {
  const rows = activeRows();
  const { rows: visibleRows, start, totalPages } = getPagedRows(rows);
  const columns = selectedColumnDefinitions();
  reportTableBody.innerHTML = "";
  renderTableHead();
  renderColumnConfig();
  reportPageInput.value = String(currentReportPage);
  reportPageTotal.textContent = String(totalPages);
  reportsCard?.setAttribute("data-report-align", getReportAlignment());

  if (!rows.length) {
    reportTableBody.innerHTML = `<tr><td colspan="${columns.length + 2}">No weighment records found.</td></tr>`;
  }

  visibleRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(String(start + index + 1))}</td>
      ${columns.map(column => `<td>${escapeHtml(column.value(row))}</td>`).join("")}
      <td>
        <button class="row-details" type="button" data-id="${escapeHtml(row.id)}" title="Show additional fields" aria-label="Show additional fields for bill ${escapeHtml(row.billNo)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
        </button>
      </td>
    `;
    reportTableBody.appendChild(tr);
  });

  totalRecords.textContent = rows.length;
  netWeight.textContent = formatNumber(rows.reduce((sum, row) => sum + Number(row.netWt || 0), 0));
  totalAmount.textContent = formatAmount(rows.reduce((sum, row) => sum + Number(row.paidAmt || 0), 0));
  if (!rows.length) {
    reportStatus.textContent = "No weighment records found.";
    return;
  }

  reportStatus.textContent = totalPages > 1
    ? `Success! Showing page ${currentReportPage} of ${totalPages} with ${visibleRows.length} records.`
    : `Success! Found ${rows.length} records.`;
}

function renderColumnConfig() {
  const columns = allColumns();
  const hiddenFromAddList = new Set(["vehicleNo", "material"]);
  const available = columns.filter(column => !visibleColumnKeys.includes(column.key) && !hiddenFromAddList.has(column.key));
  columnConfigCount.textContent = `${visibleColumnKeys.length}/${MAX_VISIBLE_COLUMNS} selected`;

  selectedColumns.innerHTML = selectedColumnDefinitions().map(column => `
    <div class="column-config-row selected-column-row" draggable="true" data-column="${escapeHtml(column.key)}">
      <span class="column-drag-handle" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M9 5h.01"></path><path d="M15 5h.01"></path><path d="M9 12h.01"></path><path d="M15 12h.01"></path><path d="M9 19h.01"></path><path d="M15 19h.01"></path></svg>
      </span>
      <span>${escapeHtml(column.label)}</span>
      <div class="column-row-actions">
        <button type="button" class="column-remove" data-column="${escapeHtml(column.key)}" title="Hide ${escapeHtml(column.label)}" aria-label="Hide ${escapeHtml(column.label)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg>
        </button>
      </div>
    </div>
  `).join("");

  availableColumns.innerHTML = available.length ? available.map(column => `
    <div class="column-config-row">
      <span>${escapeHtml(column.label)}</span>
      <button type="button" class="column-add" data-column="${escapeHtml(column.key)}" title="Add ${escapeHtml(column.label)}" aria-label="Add ${escapeHtml(column.label)}" ${visibleColumnKeys.length >= MAX_VISIBLE_COLUMNS ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
      </button>
    </div>
  `).join("") : `<p class="column-empty">All columns are shown.</p>`;
}

function updateColumnOrderFromDom() {
  visibleColumnKeys = [...selectedColumns.querySelectorAll(".selected-column-row")]
    .map(row => row.dataset.column)
    .filter(Boolean);
  saveVisibleColumns();
  renderReports();
}

function rowAfterPointer(container, y) {
  const rows = [...container.querySelectorAll(".selected-column-row:not(.dragging)")];

  return rows.reduce((closest, row) => {
    const rect = row.getBoundingClientRect();
    const offset = y - rect.top - rect.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, row };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, row: null }).row;
}

async function loadReports() {
  const query = new URLSearchParams({
    fromDate: fromDate.value,
    toDate: toDate.value
  });
  const response = await fetch(`/reports/api/weighments?${query}`);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to load report details");
  }

  reportRows = result.rows || [];
  customFieldColumns = result.customFieldColumns || [];
  syncVisibleColumns(result.columnLayout || []);
  refreshFilterOptions();
  currentReportPage = 1;
  renderReports();
}

function buildAdditionalFields(row) {
  const fields = [
    ["Bill No", row.billNo],
    ["Date", formatDisplayDate(row.date)],
    ["Time", row.time],
    ["Ref No", row.refNo],
    ["Vehicle No", row.vehicleNo],
    ["Gross Weight", formatNumber(row.grossWt)],
    ["Gross Date", row.grossDate],
    ["Gross Time", row.grossTime],
    ["Tare Weight", formatNumber(row.tareWt)],
    ["Tare Date", row.tareDate],
    ["Tare Time", row.tareTime],
    ["Net Weight", formatNumber(row.netWt)],
    ["Weighing Type", row.weighingType],
    ["Customer", row.customer],
    ["Mobile No", row.mobileNo],
    ["Mobile No 2", row.mobileNo2],
    ["Vehicle Type", row.vehicleType],
    ["Material", row.material],
    ["Payment", row.payment],
    ["Paid Amount", formatAmount(row.paidAmt)],
    ["Charge 1", formatAmount(row.charge1)],
    ["Charge 2", formatAmount(row.charge2)],
    ["Status", row.status]
  ];

  customFieldColumns.forEach(column => {
    fields.push([formatFieldLabel(column), (row.customFields || {})[column] || "-"]);
  });

  return fields;
}

function buildCameraImageCards(row) {
  const cameraImages = Array.isArray(row.cameraImages) ? row.cameraImages : [];
  if (!cameraImages.length) return "";

  return cameraImages.map(image => `
    <div class="modal-field modal-image-field">
      <span>Camera ${escapeHtml(image.cameraNo)}</span>
      <div class="modal-image-frame">
        <img src="${escapeHtml(image.url)}" alt="Camera ${escapeHtml(image.cameraNo)} saved snapshot" loading="lazy">
      </div>
    </div>
  `).join("");
}

function buildAdditionalFieldsMarkup(row) {
  const fieldMarkup = buildAdditionalFields(row).map(([label, value]) => `
    <div class="modal-field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  return `${fieldMarkup}${buildCameraImageCards(row)}`;
}

function openReportControls() {
  reportControlsModal.classList.add("open");
  reportControlsModal.setAttribute("aria-hidden", "false");
  viewOptionsToggle?.setAttribute("aria-expanded", "true");
}

function closeReportControlsPanel() {
  reportControlsModal.classList.remove("open");
  reportControlsModal.setAttribute("aria-hidden", "true");
  viewOptionsToggle?.setAttribute("aria-expanded", "false");
}

function openAdditionalFields(id) {
  const row = reportRows.find(item => String(item.id) === String(id));
  if (!row) return;

  additionalFieldsTitle.textContent = `Bill ${row.billNo} - ${row.vehicleNo}`;
  additionalFieldsBody.innerHTML = buildAdditionalFieldsMarkup(row);
  additionalFieldsModal.classList.add("open");
  additionalFieldsModal.setAttribute("aria-hidden", "false");
}

function closeAdditionalModal() {
  additionalFieldsModal.classList.remove("open");
  additionalFieldsModal.setAttribute("aria-hidden", "true");
}

reportTableBody.addEventListener("click", event => {
  const button = event.target.closest(".row-details");
  if (!button) return;
  openAdditionalFields(button.dataset.id);
});

viewOptionsToggle.addEventListener("click", () => {
  if (reportControlsModal.classList.contains("open")) {
    closeReportControlsPanel();
    return;
  }
  openReportControls();
});

closeReportControls.addEventListener("click", closeReportControlsPanel);
reportControlsModal.addEventListener("click", event => {
  if (event.target === reportControlsModal) closeReportControlsPanel();
});

reportTextAlign?.addEventListener("change", () => {
  setReportAlignment(reportTextAlign.value);
  renderReports();
});

document.querySelector("#applyFilters").addEventListener("click", () => {
  currentReportPage = 1;
  renderReports();
});
document.querySelector("#clearFilters").addEventListener("click", () => {
  document.querySelectorAll(".filters select").forEach(select => {
    select.value = "";
  });
  tableSearch.value = "";
  currentReportPage = 1;
  renderReports();
});

tableSearch.addEventListener("input", () => {
  currentReportPage = 1;
  renderReports();
});
document.querySelector("#refreshReport").addEventListener("click", () => {
  loadReports()
    .then(() => showToast("Report refreshed"))
    .catch(error => showToast(error.message || "Failed to refresh report"));
});

document.querySelectorAll("[data-range]").forEach(button => {
  button.addEventListener("click", () => {
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);

    if (button.dataset.range === "yesterday") {
      start.setDate(today.getDate() - 1);
      end.setDate(today.getDate() - 1);
    } else if (button.dataset.range === "week") {
      start.setDate(today.getDate() - 6);
    }

    setDateRange(start, end);
    currentReportPage = 1;
    loadReports()
      .then(() => showToast(`${button.textContent.trim()} range selected`))
      .catch(error => showToast(error.message || "Failed to load report range"));
  });
});

document.querySelector("#smsSummary").addEventListener("click", () => showToast("SMS summary queued"));
emailReportButton.addEventListener("click", sendReportEmail);
document.querySelector("#exportCsv").addEventListener("click", exportVisibleColumnsCsv);
document.querySelector("#printReport").addEventListener("click", printVisibleColumnsReport);
document.querySelector("#dotMatrixPrint").addEventListener("click", printDotMatrixReport);

selectedColumns.addEventListener("click", event => {
  const button = event.target.closest(".column-remove");
  if (!button) return;

  if (visibleColumnKeys.length <= 1) {
    showToast("At least one column must be shown");
    return;
  }

  visibleColumnKeys = visibleColumnKeys.filter(key => key !== button.dataset.column);
  saveVisibleColumns();
  currentReportPage = 1;
  renderReports();
});

selectedColumns.addEventListener("dragstart", event => {
  const row = event.target.closest(".selected-column-row");
  if (!row) return;
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", row.dataset.column);
});

selectedColumns.addEventListener("dragover", event => {
  const draggingRow = selectedColumns.querySelector(".dragging");
  if (!draggingRow) return;

  event.preventDefault();
  const nextRow = rowAfterPointer(selectedColumns, event.clientY);
  if (nextRow) {
    selectedColumns.insertBefore(draggingRow, nextRow);
  } else {
    selectedColumns.appendChild(draggingRow);
  }
});

selectedColumns.addEventListener("dragend", event => {
  const row = event.target.closest(".selected-column-row");
  if (!row) return;
  row.classList.remove("dragging");
  updateColumnOrderFromDom();
});

availableColumns.addEventListener("click", event => {
  const button = event.target.closest(".column-add");
  if (!button) return;

  if (visibleColumnKeys.length >= MAX_VISIBLE_COLUMNS) {
    showToast("Maximum 10 columns can be shown");
    return;
  }

  visibleColumnKeys.push(button.dataset.column);
  saveVisibleColumns();
  currentReportPage = 1;
  renderReports();
});

resetColumns.addEventListener("click", () => {
  visibleColumnKeys = defaultColumnKeys.filter(key => validColumnKeys().includes(key)).slice(0, MAX_VISIBLE_COLUMNS);
  saveVisibleColumns();
  currentReportPage = 1;
  renderReports();
  showToast("Report columns reset");
});

closeAdditionalFields.addEventListener("click", closeAdditionalModal);
additionalFieldsModal.addEventListener("click", event => {
  if (event.target === additionalFieldsModal) closeAdditionalModal();
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  closeAdditionalModal();
  closeReportControlsPanel();
});

tableExpand.addEventListener("click", () => {
  const expanded = reportsCard.classList.toggle("table-fullscreen");
  document.body.classList.toggle("report-table-open", expanded);
  tableExpand.title = expanded ? "Show compact table" : "Show full table";
  tableExpand.setAttribute("aria-label", tableExpand.title);
  currentReportPage = 1;
  renderReports();
});

reportPageInput?.addEventListener("change", () => {
  const totalPages = Math.max(1, Math.ceil(activeRows().length / getReportPageSize()));
  const requestedPage = Number(reportPageInput.value || 1);
  currentReportPage = Math.min(Math.max(1, requestedPage), totalPages);
  renderReports();
});

document.querySelector(".pagination button:nth-of-type(1)")?.addEventListener("click", () => {
  currentReportPage = 1;
  renderReports();
});

document.querySelector(".pagination button:nth-of-type(2)")?.addEventListener("click", () => {
  currentReportPage = Math.max(1, currentReportPage - 1);
  renderReports();
});

document.querySelector(".pagination button:nth-of-type(3)")?.addEventListener("click", () => {
  currentReportPage += 1;
  renderReports();
});

document.querySelector(".pagination button:nth-of-type(4)")?.addEventListener("click", () => {
  currentReportPage = Math.max(1, Math.ceil(activeRows().length / getReportPageSize()));
  renderReports();
});

setReportAlignment(getReportAlignment());
setDefaultDateRange();
loadReports().catch(error => {
  reportRows = [];
  customFieldColumns = [];
  syncVisibleColumns();
  refreshFilterOptions();
  setReportAlignment(getReportAlignment());
  renderReports();
  showToast(error.message || "Failed to load report details");
});
