const backupApiUrl = "/settings/api/backup";
const backupRunApiUrl = "/settings/api/backup/run";
const backupSettingsForm = document.querySelector("#backupSettingsForm");
const backupEnabledInput = document.querySelector("#backupEnabled");
const backupIntervalInput = document.querySelector("#backupIntervalMinutes");
const backupTargetDirInput = document.querySelector("#backupTargetDir");
const backupFolderHint = document.querySelector("#backupFolderHint");
const backupStatus = document.querySelector("#backupStatus");
const backupLastRun = document.querySelector("#backupLastRun");
const backupList = document.querySelector("#backupList");
const runBackupBtn = document.querySelector("#runBackupBtn");
const refreshBackupBtn = document.querySelector("#refreshBackupBtn");
const useGoogleDriveBtn = document.querySelector("#useGoogleDriveBtn");
let googleDriveBackupDir = "";


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}


function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}


function setStatus(message, isError = false) {
  backupStatus.textContent = message;
  backupStatus.classList.toggle("error", isError);
}


function applySettings(settings = {}) {
  backupEnabledInput.checked = Boolean(settings.enabled);
  backupIntervalInput.value = settings.intervalMinutes || 60;
  backupTargetDirInput.value = settings.targetDir || "";
  googleDriveBackupDir = settings.googleDriveDir || "";
  backupLastRun.textContent = formatDateTime(settings.lastRunAt);
  if (backupFolderHint) {
    backupFolderHint.textContent = googleDriveBackupDir
      ? `Google Drive detected: ${googleDriveBackupDir}`
      : "Google Drive Desktop was not detected. Install/sign in to Google Drive for desktop, then refresh this page.";
  }
}


function renderBackups(backups = []) {
  if (!backups.length) {
    backupList.innerHTML = '<div class="backup-empty">No backups found.</div>';
    return;
  }

  backupList.innerHTML = backups.map(backup => `
    <article class="backup-row">
      <div>
        <strong>${escapeHtml(backup.name)}</strong>
        <span>${escapeHtml(backup.path)}</span>
      </div>
      <div class="backup-row-meta">
        <span>${escapeHtml(formatDateTime(backup.createdAt))}</span>
        <span>${Number(backup.imageCount || 0)} image${Number(backup.imageCount || 0) === 1 ? "" : "s"}</span>
        <span>${backup.hasDatabase ? "DB ready" : "DB missing"}</span>
      </div>
    </article>
  `).join("");
}


async function loadBackupSettings() {
  setStatus("Loading");
  const response = await fetch(backupApiUrl);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to load backup settings");
  }

  applySettings(result.settings || {});
  renderBackups(result.backups || []);
  setStatus("Ready");
}


backupSettingsForm.addEventListener("submit", async event => {
  event.preventDefault();
  setStatus("Saving");

  try {
    const response = await fetch(backupApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        enabled: backupEnabledInput.checked,
        intervalMinutes: backupIntervalInput.value,
        targetDir: backupTargetDirInput.value
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to save backup settings");
    }

    applySettings(result.settings || {});
    renderBackups(result.backups || []);
    setStatus("Ready");
    showToast(result.message || "Backup settings saved");
  } catch (error) {
    setStatus("Error", true);
    showToast(error.message || "Failed to save backup settings");
  }
});


runBackupBtn.addEventListener("click", async () => {
  runBackupBtn.disabled = true;
  setStatus("Backing up");

  try {
    const response = await fetch(backupRunApiUrl, { method: "POST" });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Backup failed");
    }

    applySettings(result.settings || {});
    renderBackups(result.backups || []);
    setStatus("Ready");
    showToast(result.message || "Backup completed");
  } catch (error) {
    setStatus("Error", true);
    showToast(error.message || "Backup failed");
  } finally {
    runBackupBtn.disabled = false;
  }
});


refreshBackupBtn.addEventListener("click", () => {
  loadBackupSettings().catch(error => {
    setStatus("Error", true);
    showToast(error.message || "Failed to refresh backup settings");
  });
});


useGoogleDriveBtn.addEventListener("click", () => {
  if (!googleDriveBackupDir) {
    showToast("Google Drive Desktop folder not detected");
    return;
  }
  backupTargetDirInput.value = googleDriveBackupDir;
  showToast("Google Drive backup folder selected");
});


loadBackupSettings().catch(error => {
  setStatus("Error", true);
  showToast(error.message || "Failed to load backup settings");
});
