const adminSettingsApiUrl = "/settings/api/admin";
const adminSettingsForm = document.querySelector("#adminSettingsForm");
const resetSerialDailyInput = document.querySelector("#resetSerialDaily");
const resendButtonEnabledInput = document.querySelector("#resendButtonEnabled");
const liveWeightEnabledInput = document.querySelector("#liveWeightEnabled");
const appVersionLabel = document.querySelector("#appVersion");
const checkUpdateButton = document.querySelector("#checkUpdateButton");
const applyUpdateButton = document.querySelector("#applyUpdateButton");
const updateStatus = document.querySelector("#updateStatus");
const updateProgress = document.querySelector("#updateProgress");
const updateProgressBar = document.querySelector("#updateProgressBar");
const adminSectionButtons = Array.from(document.querySelectorAll("[data-admin-section]"));
const adminPanels = Array.from(document.querySelectorAll("[data-admin-panel]"));
const adminLinkButtons = Array.from(document.querySelectorAll("[data-admin-link]"));
let updateStatusTimer = null;

adminSectionButtons.forEach(button => {
  button.addEventListener("click", () => {
    const section = button.dataset.adminSection;
    adminSectionButtons.forEach(item => item.classList.toggle("active", item === button));
    adminPanels.forEach(panel => {
      panel.hidden = panel.dataset.adminPanel !== section;
    });
  });
});

adminLinkButtons.forEach(button => {
  button.addEventListener("click", () => {
    const targetUrl = button.dataset.adminLink;
    if (targetUrl) {
      window.location.href = targetUrl;
    }
  });
});


function applyAdminSettings(settings = {}) {
  resetSerialDailyInput.checked = Boolean(settings.resetSerialDaily);
  resendButtonEnabledInput.checked = settings.resendButtonEnabled !== false;
  liveWeightEnabledInput.checked = settings.liveWeightEnabled !== false;
  appVersionLabel.textContent = settings.appVersion || "--";
}


function setUpdateStatus(message, isError = false) {
  updateStatus.textContent = message || "";
  updateStatus.classList.toggle("error", Boolean(isError));
}

function setUpdateProgress(percent = 0, visible = false) {
  const cleanPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  if (updateProgress) updateProgress.hidden = !visible;
  if (updateProgressBar) updateProgressBar.style.width = `${cleanPercent}%`;
}

function stopUpdateStatusPolling() {
  if (updateStatusTimer) {
    window.clearInterval(updateStatusTimer);
    updateStatusTimer = null;
  }
}

async function refreshUpdateStatus() {
  const response = await fetch("/settings/api/admin/update/status", { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Failed to read update status");
  }
  const percent = Number(result.percent || 0);
  setUpdateProgress(percent, result.running || percent > 0);
  setUpdateStatus(result.message || (result.running ? `Updating ${percent}%` : "No update running."), Boolean(result.error));
  if (!result.running && result.stage !== "starting" && result.stage !== "download") {
    stopUpdateStatusPolling();
    if (result.error) {
      applyUpdateButton.disabled = false;
    }
  }
}

function startUpdateStatusPolling() {
  stopUpdateStatusPolling();
  refreshUpdateStatus().catch(error => setUpdateStatus(error.message || "Failed to read update status", true));
  updateStatusTimer = window.setInterval(() => {
    refreshUpdateStatus().catch(error => {
      stopUpdateStatusPolling();
      setUpdateStatus(error.message || "Failed to read update status", true);
    });
  }, 500);
}


async function loadAdminSettings() {
  const response = await fetch(adminSettingsApiUrl);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to load admin settings");
  }

  applyAdminSettings(result.settings || {});
}


adminSettingsForm.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const response = await fetch(adminSettingsApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        resetSerialDaily: resetSerialDailyInput.checked,
        resendButtonEnabled: resendButtonEnabledInput.checked,
        liveWeightEnabled: liveWeightEnabledInput.checked
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to save admin settings");
    }

    applyAdminSettings(result.settings || {});
    showToast(result.message || "Admin settings saved");
  } catch (error) {
    showToast(error.message || "Failed to save admin settings");
  }
});

checkUpdateButton.addEventListener("click", async () => {
  applyUpdateButton.disabled = true;
  stopUpdateStatusPolling();
  setUpdateProgress(0, false);
  setUpdateStatus("Checking for update...");

  try {
    const response = await fetch("/settings/api/admin/update/check", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Failed to check update");
    }
    const latest = result.latestVersion || result.currentVersion || "--";
    setUpdateStatus(result.updateAvailable
      ? `Update available: ${result.currentVersion} -> ${latest}`
      : (result.message || "Already up to date."));
    applyUpdateButton.disabled = !result.updateAvailable;
  } catch (error) {
    setUpdateStatus(error.message || "Failed to check update", true);
  }
});


applyUpdateButton.addEventListener("click", async () => {
  applyUpdateButton.disabled = true;
  checkUpdateButton.disabled = true;
  setUpdateProgress(0, true);
  setUpdateStatus("Starting update 0%");

  try {
    const response = await fetch("/settings/api/admin/update/apply", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Failed to apply update");
    }
    setUpdateStatus(result.message || "Update started.");
    startUpdateStatusPolling();
  } catch (error) {
    setUpdateStatus(error.message || "Failed to apply update", true);
    setUpdateProgress(0, false);
    applyUpdateButton.disabled = false;
    checkUpdateButton.disabled = false;
  }
});


loadAdminSettings().catch(error => {
  showToast(error.message || "Failed to load admin settings");
});
