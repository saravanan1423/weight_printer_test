const whatsappApiUrl = "/settings/api/whatsapp";
const whatsappForm = document.querySelector("#whatsappForm");
const whatsappEnabledInput = document.querySelector("#whatsappEnabled");
const whatsappSendOnSaveInput = document.querySelector("#whatsappSendOnSave");
const whatsappTemplateInput = document.querySelector("#whatsappTemplate");
const whatsappSavedState = document.querySelector("#whatsappSavedState");
const whatsappTestMobileNoInput = document.querySelector("#whatsappTestMobileNo");
const testWhatsappConnectionBtn = document.querySelector("#testWhatsappConnectionBtn");
const whatsappLastStatus = document.querySelector("#whatsappLastStatus");
let whatsappStatusTimer = null;

function setWhatsappSavedState(isSaved) {
  whatsappSavedState.textContent = isSaved ? "Saved" : "Not Saved";
  whatsappSavedState.classList.toggle("error", !isSaved);
}

function applyWhatsappSettings(settings = {}) {
  whatsappEnabledInput.checked = settings.whatsappEnabled === true;
  whatsappSendOnSaveInput.checked = settings.whatsappSendOnSave === true;
  whatsappTemplateInput.value = settings.whatsappTemplate || "";
  renderWhatsappStatus(settings.lastStatus);
  setWhatsappSavedState(true);
}

function renderWhatsappStatus(status = {}) {
  const message = status.message || "No WhatsApp test yet.";
  const updatedAt = status.updatedAt ? ` (${status.updatedAt})` : "";
  whatsappLastStatus.textContent = `${message}${updatedAt}`;
  whatsappLastStatus.classList.toggle("error", status.ok === false);
  whatsappLastStatus.classList.toggle("success", status.ok === true);
}

function stopWhatsappStatusPolling() {
  if (whatsappStatusTimer) {
    window.clearInterval(whatsappStatusTimer);
    whatsappStatusTimer = null;
  }
}

async function refreshWhatsappStatus() {
  const response = await fetch(`${whatsappApiUrl}/status`, { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return;
  renderWhatsappStatus(result.lastStatus || {});
}

function startWhatsappStatusPolling() {
  stopWhatsappStatusPolling();
  let checks = 0;
  whatsappStatusTimer = window.setInterval(() => {
    checks += 1;
    refreshWhatsappStatus().catch(() => {});
    if (checks >= 40) {
      stopWhatsappStatusPolling();
    }
  }, 1000);
}

async function loadWhatsappSettings() {
  const response = await fetch(whatsappApiUrl);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to load WhatsApp settings");
  }

  applyWhatsappSettings(result.settings || {});
}

whatsappForm.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const response = await fetch(whatsappApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        whatsappEnabled: whatsappEnabledInput.checked,
        whatsappSendOnSave: whatsappSendOnSaveInput.checked,
        whatsappTemplate: whatsappTemplateInput.value
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to save WhatsApp settings");
    }

    applyWhatsappSettings(result.settings || {});
    showToast(result.message || "WhatsApp settings saved");
  } catch (error) {
    setWhatsappSavedState(false);
    showToast(error.message || "Failed to save WhatsApp settings");
  }
});

testWhatsappConnectionBtn.addEventListener("click", async () => {
  testWhatsappConnectionBtn.disabled = true;
  testWhatsappConnectionBtn.textContent = "Testing...";
  renderWhatsappStatus({ ok: null, message: "Opening WhatsApp Web for test message..." });

  try {
    const response = await fetch(`${whatsappApiUrl}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        testMobileNo: whatsappTestMobileNoInput.value.trim(),
        whatsappTemplate: whatsappTemplateInput.value
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "WhatsApp test failed");
    }

    renderWhatsappStatus(result.lastStatus || {});
    startWhatsappStatusPolling();
    showToast(result.message || "WhatsApp test queued");
  } catch (error) {
    renderWhatsappStatus({ ok: false, message: error.message || "WhatsApp test failed" });
    showToast(error.message || "WhatsApp test failed");
  } finally {
    testWhatsappConnectionBtn.disabled = false;
    testWhatsappConnectionBtn.textContent = "Test Connection";
  }
});

setWhatsappSavedState(false);
loadWhatsappSettings().catch(error => {
  setWhatsappSavedState(false);
  showToast(error.message || "Failed to load WhatsApp settings");
});
