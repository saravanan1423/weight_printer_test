const cameraForm = document.querySelector("#cameraForm");
const cameraRows = Array.from(document.querySelectorAll("[data-camera-row]"));
const cameraLog = document.querySelector("#cameraLog");
const cameraConnectionState = document.querySelector("#cameraConnectionState");
const cameraLogStartDate = document.querySelector("#cameraLogStartDate");
const cameraLogEndDate = document.querySelector("#cameraLogEndDate");
const cameraSelector = document.querySelector("#cameraSelector");
const addCameraBtn = document.querySelector("#addCameraBtn");
const cameraApiUrl = "/settings/api/cameras";

let cameraLogEntries = [];
const activeCameraTests = new Map();
const openCameraPreviews = new Set();
const savedCameraNumbers = new Set();
const enabledCameraNumbers = new Set(["1"]);
let activeCameraCardIndex = 0;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function rowField(row, fieldName) {
  return row.querySelector(`[data-field="${fieldName}"]`);
}

function getCameraPayload(row) {
  return {
    cameraNo: rowField(row, "cameraNo").value,
    ipAddress: rowField(row, "ipAddress").value.trim(),
    username: rowField(row, "username").value.trim(),
    password: rowField(row, "password").value.trim(),
    port: rowField(row, "port").value,
    streamPath: rowField(row, "streamPath").value.trim()
  };
}

function cameraNumberForRow(row) {
  return String(rowField(row, "cameraNo").value);
}

function renderCameraSelector() {
  if (!cameraSelector) return;
  cameraSelector.innerHTML = "";
  cameraRows.forEach((row, rowIndex) => {
    const cameraNo = cameraNumberForRow(row);
    if (!enabledCameraNumbers.has(cameraNo) && !savedCameraNumbers.has(cameraNo)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Camera ${cameraNo}`;
    button.className = "camera-selector__item";
    button.classList.toggle("active", rowIndex === activeCameraCardIndex);
    button.classList.toggle("connected", row.classList.contains("connected"));
    button.addEventListener("click", () => showCameraCard(rowIndex));
    cameraSelector.appendChild(button);
  });

  if (addCameraBtn) {
    addCameraBtn.disabled = enabledCameraNumbers.size >= cameraRows.length;
  }
}

function showCameraCard(index) {
  activeCameraCardIndex = (index + cameraRows.length) % cameraRows.length;
  cameraRows.forEach((row, rowIndex) => {
    const cameraNo = cameraNumberForRow(row);
    row.hidden = rowIndex !== activeCameraCardIndex || (!enabledCameraNumbers.has(cameraNo) && !savedCameraNumbers.has(cameraNo));
    if (rowIndex === activeCameraCardIndex) {
      row.classList.remove("camera-card-animate");
      window.requestAnimationFrame(() => row.classList.add("camera-card-animate"));
    }
  });
  renderCameraSelector();
}

function showCameraByNumber(cameraNo) {
  const rowIndex = cameraRows.findIndex(row => cameraNumberForRow(row) === String(cameraNo));
  if (rowIndex >= 0) showCameraCard(rowIndex);
}

function addNextCameraCard() {
  const nextRow = cameraRows.find(row => !enabledCameraNumbers.has(cameraNumberForRow(row)));
  if (!nextRow) {
    showToast("Maximum camera slots reached", "warning");
    return;
  }

  const cameraNo = cameraNumberForRow(nextRow);
  enabledCameraNumbers.add(cameraNo);
  showCameraByNumber(cameraNo);
  rowField(nextRow, "ipAddress")?.focus();
}

function isCameraComplete(camera) {
  return camera.ipAddress && camera.username && camera.password;
}

function validateCameraPayload(camera) {
  if (!camera.ipAddress) return "Camera IP number is required";
  if (!camera.username) return "Camera username is required";
  if (!camera.password) return "Camera password is required";
  if (!camera.port || Number(camera.port) < 1 || Number(camera.port) > 65535) {
    return "Camera port must be between 1 and 65535";
  }
  if (!camera.streamPath) return "Camera stream path is required";
  return "";
}

function getCompleteCameraPayloads() {
  return cameraRows.map(getCameraPayload);
}

function setRowStatus(row, isConnected) {
  const status = rowField(row, "status");
  status.textContent = isConnected ? "Connected" : "Not Connected";
  status.classList.toggle("connected", isConnected);
  status.classList.remove("network-error");
  row.classList.toggle("connected", isConnected);
  row.classList.remove("network-error");
}

function setRowNetworkError(row, message = "Network Error") {
  const status = rowField(row, "status");
  status.textContent = message;
  status.classList.remove("connected");
  status.classList.add("network-error");
  row.classList.remove("connected");
  row.classList.add("network-error");
}

function setRowPreview(row, camera) {
  const preview = rowField(row, "preview");
  const previewImage = rowField(row, "previewImage");
  const hasPreview = Boolean(camera.snapshotUrl);
  const cameraNo = String(rowField(row, "cameraNo").value);

  if (!preview || !previewImage) return;
  previewImage.dataset.loadingPreview = hasPreview ? "true" : "false";
  preview.hidden = !hasPreview;
  if (hasPreview) {
    openCameraPreviews.add(cameraNo);
    previewImage.src = `${camera.snapshotUrl}?preview=${Date.now()}`;
  } else {
    openCameraPreviews.delete(cameraNo);
    previewImage.removeAttribute("src");
  }
  row.classList.toggle("preview-open", hasPreview);
  updateTestButton(row);
}

function updateTestButton(row) {
  const cameraNo = String(rowField(row, "cameraNo").value);
  const button = row.querySelector('[data-action="test-camera"]');
  button.textContent = activeCameraTests.has(cameraNo) || openCameraPreviews.has(cameraNo)
    ? "Close Connection"
    : "Test Connection";
}

async function closeCameraPreview(row, { showMessage = true } = {}) {
  const cameraNo = String(rowField(row, "cameraNo").value);
  const activeTest = activeCameraTests.get(cameraNo);

  if (activeTest) {
    activeTest.userClosed = true;
    activeTest.controller.abort();
    window.clearTimeout(activeTest.timeoutId);
    activeCameraTests.delete(cameraNo);
  }

  openCameraPreviews.delete(cameraNo);
  setRowPreview(row, { isConnected: false, snapshotUrl: "" });
  if (savedCameraNumbers.has(cameraNo)) {
    setRowStatus(row, true);
  } else {
    setRowStatus(row, false);
  }

  updateTestButton(row);
  if (showMessage) {
    showToast(`Camera ${cameraNo} preview closed`, "warning");
  }
}

function updateOverallStatus(cameras = []) {
  const connectedCount = cameras.filter(camera => camera.isConnected).length;
  cameraConnectionState.textContent = connectedCount
    ? `${connectedCount} Connected`
    : "Not Connected";
  cameraConnectionState.classList.toggle("error", connectedCount === 0);
  document.dispatchEvent(new CustomEvent("camera-status-update", {
    detail: {
      status: connectedCount ? "success" : "not_connected",
      connectedCount
    }
  }));
}

function applyCamera(camera) {
  const row = document.querySelector(`[data-camera-row="${camera.cameraNo}"]`);
  if (!row) return;
  const cameraNo = String(camera.cameraNo);

  rowField(row, "ipAddress").value = camera.ipAddress || "";
  rowField(row, "username").value = camera.username || "";
  rowField(row, "password").value = camera.password || "";
  rowField(row, "port").value = camera.port || "554";
  rowField(row, "streamPath").value = camera.streamPath || "Streaming/Channels/102";
  if (camera.id) {
    savedCameraNumbers.add(cameraNo);
    enabledCameraNumbers.add(cameraNo);
  } else {
    savedCameraNumbers.delete(cameraNo);
  }
  setRowStatus(row, Boolean(camera.isConnected));
  if (!openCameraPreviews.has(cameraNo)) {
    setRowPreview(row, { snapshotUrl: "" });
  }
  updateTestButton(row);
  renderCameraSelector();
}

function mapLogs(logs) {
  return logs.map(log => {
    const date = log.timestamp ? new Date(log.timestamp) : new Date();
    return {
      id: log.id,
      date: date.toISOString().slice(0, 10),
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      message: log.message,
      type: log.type === "info" ? "info" : "warning"
    };
  });
}

function renderLogs() {
  cameraLog.innerHTML = "";
  const start = cameraLogStartDate.value;
  const end = cameraLogEndDate.value;
  const rows = cameraLogEntries.filter(entry => {
    if (start && entry.date < start) return false;
    if (end && entry.date > end) return false;
    return true;
  });

  if (!rows.length) {
    cameraLog.innerHTML = '<div class="log-row warning"><span>--</span><p>No logs found for selected date range.</p></div>';
    return;
  }

  rows.forEach(entry => {
    const row = document.createElement("div");
    row.className = `log-row ${entry.type}`.trim();
    row.innerHTML = `
      <span>${entry.date} ${entry.time}</span>
      <p>${entry.message}</p>
    `;
    cameraLog.appendChild(row);
  });
}

async function loadCameraDetails() {
  const response = await fetch(cameraApiUrl);
  if (!response.ok) throw new Error("Failed to load camera details");

  const result = await response.json();
  (result.cameras || []).forEach(applyCamera);
  cameraLogEntries = mapLogs(result.logs || []);
  renderLogs();
  updateOverallStatus(result.cameras || []);
}

cameraForm.addEventListener("submit", async event => {
  event.preventDefault();
  const cameras = getCompleteCameraPayloads();
  const completedCameras = cameras.filter(isCameraComplete);

  if (!completedCameras.length) {
    showToast("Enter at least one complete camera setting", "warning");
    return;
  }

  try {
    const response = await fetch(cameraApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ cameras })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Failed to save camera settings");

    (result.cameras || []).forEach(camera => {
      savedCameraNumbers.add(String(camera.cameraNo));
    });
    await loadCameraDetails();
    showToast(result.message || "Camera settings saved successfully");
  } catch (error) {
    showToast(error.message || "Failed to save camera settings");
  }
});

cameraRows.forEach(row => {
  rowField(row, "previewImage")?.addEventListener("load", () => {
    rowField(row, "previewImage").dataset.loadingPreview = "false";
  });

  rowField(row, "previewImage")?.addEventListener("error", () => {
    const previewImage = rowField(row, "previewImage");
    if (previewImage.dataset.loadingPreview !== "true") return;

    previewImage.dataset.loadingPreview = "false";
    setRowNetworkError(row);
    rowField(row, "preview").hidden = true;
    showToast(`Camera ${rowField(row, "cameraNo").value} preview failed`);
  });

  row.querySelector('[data-action="test-camera"]').addEventListener("click", async () => {
    const camera = getCameraPayload(row);
    const button = row.querySelector('[data-action="test-camera"]');
    const cameraNo = String(camera.cameraNo);
    const activeTest = activeCameraTests.get(cameraNo);

    if (activeTest || openCameraPreviews.has(cameraNo)) {
      await closeCameraPreview(row);
      return;
    }

    const validationMessage = validateCameraPayload(camera);

    if (validationMessage) {
      showToast(validationMessage, "warning");
      return;
    }

    const controller = new AbortController();
    const testState = {
      controller,
      timeoutId: null,
      timedOut: false,
      userClosed: false
    };
    testState.timeoutId = window.setTimeout(() => {
      testState.timedOut = true;
      controller.abort();
    }, 6000);
    activeCameraTests.set(cameraNo, testState);

    updateTestButton(row);
    showToast(`Testing camera ${camera.cameraNo} connection`, "warning");

    try {
      const response = await fetch(`${cameraApiUrl}/${camera.cameraNo}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(camera),
        signal: controller.signal
      });
      const result = await response.json().catch(() => ({}));
      if (result.status === "network_error") {
        setRowNetworkError(row);
        throw new Error(result.message || "Network error");
      }
      if (!response.ok) throw new Error(result.message || "Camera connection failed");

      setRowStatus(row, true);
      setRowPreview(row, result.camera);
      showToast(result.message || "Camera connected");
    } catch (error) {
      if (error.name === "AbortError" && testState.userClosed) return;
      const message = error.name === "AbortError" && testState.timedOut
        ? "Camera test timed out"
        : error.message || "Camera connection failed";
      const isNetworkError = error.name === "AbortError"
        || message.toLowerCase().includes("network")
        || message.toLowerCase().includes("timeout")
        || message.toLowerCase().includes("timed out");
      if (isNetworkError) {
        setRowNetworkError(row);
      } else {
        setRowStatus(row, false);
      }
      showToast(message);
    } finally {
      window.clearTimeout(testState.timeoutId);
      activeCameraTests.delete(cameraNo);
      updateTestButton(row);
    }
  });

  row.querySelector('[data-action="delete-camera"]').addEventListener("click", async () => {
    const cameraNo = String(rowField(row, "cameraNo").value);
    await closeCameraPreview(row, { showMessage: false });

    if (!savedCameraNumbers.has(cameraNo)) {
      rowField(row, "ipAddress").value = "";
      rowField(row, "username").value = "";
      rowField(row, "password").value = "";
      rowField(row, "port").value = "554";
      rowField(row, "streamPath").value = "Streaming/Channels/102";
      if (cameraNo !== "1") {
        enabledCameraNumbers.delete(cameraNo);
      }
      showCameraByNumber(Array.from(enabledCameraNumbers)[0] || "1");
      renderCameraSelector();
      showToast(`Camera ${cameraNo} cleared`, "warning");
      return;
    }

    try {
      const response = await fetch(`${cameraApiUrl}/${cameraNo}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Failed to delete camera setting");

      savedCameraNumbers.delete(cameraNo);
      if (cameraNo !== "1") {
        enabledCameraNumbers.delete(cameraNo);
      }
      applyCamera(result.camera);
      showCameraByNumber(Array.from(enabledCameraNumbers)[0] || "1");
      await loadCameraDetails();
      showToast(result.message || `Camera ${cameraNo} deleted`);
    } catch (error) {
      showToast(error.message || "Failed to delete camera setting");
    }
  });
});

cameraLogStartDate.addEventListener("change", renderLogs);
cameraLogEndDate.addEventListener("change", renderLogs);
addCameraBtn?.addEventListener("click", addNextCameraCard);

cameraLogStartDate.value = todayISO();
cameraLogEndDate.value = todayISO();
showCameraCard(0);
updateOverallStatus([]);
loadCameraDetails().catch(error => {
  cameraLogEntries = [];
  renderLogs();
  updateOverallStatus([]);
  showToast(error.message || "Failed to load camera details");
});
