const emailForm = document.querySelector("#emailForm");
const emailLog = document.querySelector("#emailLog");
const emailLogStartDate = document.querySelector("#emailLogStartDate");
const emailLogEndDate = document.querySelector("#emailLogEndDate");
const emailConnectionStatus = document.querySelector("#emailConnectionStatus");
const emailSavedState = document.querySelector("#emailSavedState");
const sendInstructionEmailBtn = document.querySelector("#sendInstructionEmailBtn");
const senderEmailInput = document.querySelector("#senderEmail");
const emailUsernameInput = document.querySelector("#emailUsername");

const emailApiUrl = "/settings/api/email";

let emailLogEntries = [];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getEmailPayload() {
  if (!emailUsernameInput.value.trim()) {
    emailUsernameInput.value = senderEmailInput.value.trim();
  }

  return {
    smtpHost: document.querySelector("#smtpHost").value.trim(),
    smtpPort: document.querySelector("#smtpPort").value,
    security: document.querySelector("#smtpSecurity").value,
    senderEmail: senderEmailInput.value.trim(),
    username: emailUsernameInput.value.trim(),
    password: document.querySelector("#emailPassword").value,
    recipient: document.querySelector("#recipient").value.trim()
  };
}

function applyEmailSettings(settings) {
  document.querySelector("#smtpHost").value = settings.smtpHost || "smtp.gmail.com";
  document.querySelector("#smtpPort").value = settings.smtpPort || "587";
  document.querySelector("#smtpSecurity").value = settings.security || "TLS";
  senderEmailInput.value = settings.senderEmail || "";
  emailUsernameInput.value = settings.username || settings.senderEmail || "";
  document.querySelector("#emailPassword").value = settings.password || "";
  document.querySelector("#recipient").value = settings.recipient || settings.testRecipient || "";
  setEmailConnectionStatus(Boolean(settings.isConnected));
}

senderEmailInput.addEventListener("blur", () => {
  if (!emailUsernameInput.value.trim()) {
    emailUsernameInput.value = senderEmailInput.value.trim();
  }
});

function setEmailConnectionStatus(isConnected) {
  const statusText = isConnected ? "Connected" : "Not Connected";
  emailConnectionStatus.textContent = statusText;
  emailSavedState.textContent = isConnected ? "Saved" : "Not Saved";
  emailConnectionStatus.classList.toggle("error", !isConnected);
}

function setInstructionButtonState(isSending) {
  sendInstructionEmailBtn.disabled = isSending;
  sendInstructionEmailBtn.textContent = isSending ? "Sending..." : "Send Instruction Email";
}

function mapLogs(logs) {
  return logs.map(log => {
    const date = log.timestamp ? new Date(log.timestamp) : new Date();
    return {
      id: log.id,
      date: date.toISOString().slice(0, 10),
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      message: log.message,
      type: log.type || "warning"
    };
  });
}

function renderEmailLogs() {
  emailLog.innerHTML = "";
  const start = emailLogStartDate.value;
  const end = emailLogEndDate.value;
  const rows = emailLogEntries.filter(entry => {
    if (start && entry.date < start) return false;
    if (end && entry.date > end) return false;
    return true;
  });

  if (!rows.length) {
    emailLog.innerHTML = '<div class="log-row warning"><span>--</span><p>No email logs found for selected date range.</p></div>';
    return;
  }

  rows.forEach(entry => {
    const row = document.createElement("div");
    row.className = `log-row ${entry.type}`.trim();
    row.innerHTML = `
      <span>${entry.date} ${entry.time}</span>
      <p>${entry.message}</p>
    `;
    emailLog.appendChild(row);
  });
}

async function loadEmailDetails() {
  const response = await fetch(emailApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load email settings");
  }

  const result = await response.json();
  applyEmailSettings(result.settings || {});
  emailLogEntries = mapLogs(result.logs || []);
  renderEmailLogs();
}

emailForm.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const response = await fetch(emailApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getEmailPayload())
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to save email settings");
    }

    applyEmailSettings(result.settings || {});
    await loadEmailDetails();
    showToast(result.message || "Email connection saved successfully");
  } catch (error) {
    setEmailConnectionStatus(false);
    showToast(error.message || "Failed to save email settings");
  }
});

sendInstructionEmailBtn.addEventListener("click", async () => {
  setInstructionButtonState(true);

  try {
    const response = await fetch(`${emailApiUrl}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getEmailPayload())
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to send instruction email");
    }

    applyEmailSettings(result.settings || {});
    await loadEmailDetails();
    showToast(result.message || "Instruction email sent successfully");
  } catch (error) {
    setEmailConnectionStatus(false);
    await loadEmailDetails().catch(() => {});
    showToast(error.message || "Failed to send instruction email");
  } finally {
    setInstructionButtonState(false);
  }
});

emailLogStartDate.addEventListener("change", renderEmailLogs);
emailLogEndDate.addEventListener("change", renderEmailLogs);

emailLogStartDate.value = todayISO();
emailLogEndDate.value = todayISO();
setEmailConnectionStatus(false);
setInstructionButtonState(false);

loadEmailDetails().catch(error => {
  emailLogEntries = [];
  renderEmailLogs();
  setEmailConnectionStatus(false);
  showToast(error.message || "Failed to load email settings");
});
