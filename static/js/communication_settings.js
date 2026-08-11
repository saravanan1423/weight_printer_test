const communicationForm = document.querySelector("#communicationForm");
const testConnectionBtn = document.querySelector("#testConnectionBtn");
const connectionStatus = document.querySelector("#connectionStatus");
const liveConnectionState = document.querySelector("#liveConnectionState");
const liveValue = document.querySelector("#liveValue");
const previewValue = document.querySelector("#communicationPreviewValue");
const previewMeta = document.querySelector("#communicationPreviewMeta");
const previewStatus = document.querySelector("#previewStatus");
const asciiBoxGrid = document.querySelector("#asciiBoxGrid");
const selectedAsciiCard = document.querySelector("#selectedAsciiCard");
const clearAsciiSelectionBtn = document.querySelector("#clearAsciiSelectionBtn");
const comPortHint = document.querySelector("#comPortHint");
const pickerModeButtons = Array.from(document.querySelectorAll("[data-picker-mode]"));

const communicationApiUrl = "/settings/api/communication";

let activeTestController = null;
let lastTestRawValue = "";
let lastSelectedAscii = null;
let livePollTimer = null;
let livePollBusy = false;
let isLiveRawMode = true;
let selectedStartAscii = null;
let selectedEndAscii = null;
let selectedFromPosition = null;
let selectedToPosition = null;
let activePickerMode = "startAscii";

const controlNames = {
  0: "NUL",
  1: "SOH",
  2: "STX",
  3: "ETX",
  4: "EOT",
  5: "ENQ",
  6: "ACK",
  7: "BEL",
  8: "BS",
  9: "TAB",
  10: "LF",
  11: "VT",
  12: "FF",
  13: "CR",
  27: "ESC",
  32: "SPACE",
  127: "DEL"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function trimControlPrefix(text) {
  return String(text || "").replace(/^[\u0000-\u001f]+/, "").trim();
}

function characterLabel(char) {
  if (!char) return "--";
  const code = char.charCodeAt(0);
  return controlNames[code] || char;
}

function asciiLabel(char) {
  if (!char) return "ASCII --";
  return `ASCII ${char.charCodeAt(0)} (${characterLabel(char)})`;
}

function asciiInputToCharacter(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const code = Number(text);
  if (!Number.isInteger(code) || code < 0 || code > 127) {
    return "";
  }

  return String.fromCharCode(code);
}

function characterToAsciiInput(char) {
  if (!char) return "";
  return String(char.charCodeAt(0));
}

function asciiInputLabel(value) {
  const char = asciiInputToCharacter(value);
  if (!char) return "Character --";
  return `Character ${characterLabel(char)}`;
}

function normalizeNumericText(text) {
  const value = String(text || "").trim();
  if (!value) return "";

  const numericPattern = /^-?\d+(?:\.\d+)?$/;
  if (!numericPattern.test(value)) {
    return value;
  }

  const negative = value.startsWith("-");
  const numericPortion = negative ? value.slice(1) : value;

  let normalized;
  if (numericPortion.includes(".")) {
    const [integerPart, fractionPart = ""] = numericPortion.split(".", 2);
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
    const normalizedFraction = fractionPart.replace(/0+$/, "");
    normalized = normalizedFraction
      ? `${normalizedInteger}.${normalizedFraction}`
      : normalizedInteger;
  } else {
    normalized = numericPortion.replace(/^0+(?=\d)/, "") || "0";
  }

  return negative ? `-${normalized}` : normalized;
}

function resolvePreviewSegments(rawText, startCharacter, endCharacter, startAddress, endAddress, reverseWeight) {
  const rawValue = String(rawText || "");
  let workingText = startCharacter ? rawValue : trimControlPrefix(rawValue);
  if (!startCharacter && !endCharacter) {
    workingText = workingText.trim();
  }
  const steps = [
    { label: "Raw output", value: rawValue || "No live raw data yet." },
  ];

  if (!workingText) {
    return {
      raw: rawValue,
      selected: "",
      value: "",
      steps,
      notes: ["Waiting for live raw data"],
    };
  }

  if (startCharacter && endCharacter) {
    const startIndex = workingText.indexOf(startCharacter);
    if (startIndex === -1) {
      return {
        raw: rawValue,
        selected: "",
        displayValue: "",
        value: "",
        steps: steps.concat([{ label: "Start of text", value: `Missing ${characterLabel(startCharacter)}` }]),
        notes: [`Start ASCII not found: ${asciiLabel(startCharacter)}`],
      };
    }

    const contentStartIndex = startIndex + startCharacter.length;
    const endIndex = workingText.indexOf(endCharacter, contentStartIndex);
    if (endIndex === -1) {
      return {
        raw: rawValue,
        selected: "",
        displayValue: "",
        value: "",
        steps: steps.concat([{ label: "End of text", value: `Missing ${characterLabel(endCharacter)}` }]),
        notes: [`End ASCII not found: ${asciiLabel(endCharacter)}`],
      };
    }

    workingText = workingText.slice(contentStartIndex, endIndex);
    steps.push({ label: "Between start and end", value: workingText || "--" });
  } else {
    if (startCharacter) {
      const startIndex = workingText.indexOf(startCharacter);
      if (startIndex === -1) {
        return {
          raw: rawValue,
          selected: "",
          displayValue: "",
          value: "",
          steps: steps.concat([{ label: "Start of text", value: `Missing ${characterLabel(startCharacter)}` }]),
          notes: [`Start ASCII not found: ${asciiLabel(startCharacter)}`],
        };
      }
      workingText = workingText.slice(startIndex + startCharacter.length);
      steps.push({ label: "After start of text", value: workingText || "--" });
    }

    if (endCharacter) {
      const endIndex = workingText.indexOf(endCharacter);
      if (endIndex === -1) {
        return {
          raw: rawValue,
          selected: "",
          displayValue: "",
          value: "",
          steps: steps.concat([{ label: "End of text", value: `Missing ${characterLabel(endCharacter)}` }]),
          notes: [`End ASCII not found: ${asciiLabel(endCharacter)}`],
        };
      }
      workingText = workingText.slice(0, endIndex);
      steps.push({ label: "Before end of text", value: workingText || "--" });
    }
  }

  const start = Math.max(Number(startAddress) || 0, 0);
  const end = Math.max(Number(endAddress) || 0, 0);
  let selectedText = workingText;

  if (start || end) {
    const startIndex = start ? Math.max(start - 1, 0) : 0;
    if (end) {
      const endIndex = Math.max(end - 1, 0);
      if (endIndex < startIndex) {
        return {
          raw: rawValue,
          selected: "",
          displayValue: "",
          value: "",
          steps: steps.concat([{ label: "Selected value", value: "Invalid range" }]),
          notes: ["End point must be greater than or equal to starting char"],
        };
      }
      selectedText = workingText.slice(startIndex, endIndex + 1);
    } else {
      selectedText = workingText.slice(startIndex);
    }
    steps.push({ label: "Selected value", value: selectedText || "--" });
  }

  const finalText = reverseWeight ? selectedText.split("").reverse().join("") : selectedText;
  if (reverseWeight) {
    steps.push({ label: "After reverse", value: finalText || "--" });
  }
  const displayValue = String(finalText || "").trim();

  return {
    raw: rawValue,
    selected: selectedText,
    displayValue,
    value: normalizeNumericText(finalText),
    steps,
    notes: [
      `Start: ${startCharacter ? asciiLabel(startCharacter) : "none"}`,
      `End: ${endCharacter ? asciiLabel(endCharacter) : "none"}`,
      `Start char position: ${start || 0}`,
      `End point: ${end || 0}`,
      `Reverse: ${reverseWeight ? "enabled" : "disabled"}`,
    ],
  };
}

function getPayload() {
  const startAsciiValue = document.querySelector("#startCharacter").value.trim();
  const endAsciiValue = document.querySelector("#endCharacter").value.trim();
  const invalidStartAscii = startAsciiValue && !asciiInputToCharacter(startAsciiValue);
  const invalidEndAscii = endAsciiValue && !asciiInputToCharacter(endAsciiValue);

  if (invalidStartAscii || invalidEndAscii) {
    throw new Error("Start/End ASCII value must be a whole number from 0 to 127");
  }

  return {
    portName: document.querySelector("#comPort").value.trim(),
    baudRate: document.querySelector("#baudrate").value,
    timeout: document.querySelector("#timeout").value,
    dataBits: document.querySelector("#byteSize").value,
    parity: document.querySelector("#parity").value,
    stopBits: document.querySelector("#stopBit").value,
    startCharacter: asciiInputToCharacter(document.querySelector("#startCharacter").value),
    endCharacter: asciiInputToCharacter(document.querySelector("#endCharacter").value),
    startAddress: document.querySelector("#startAddress").value,
    endAddress: document.querySelector("#endAddress").value,
    reverseWeight: document.querySelector("#reverseWeight").checked
  };
}

function ensureSelectValue(selectId, value, fallbackValue) {
  const select = document.querySelector(selectId);
  const nextValue = value || fallbackValue;

  if (!Array.from(select.options).some(option => option.value === nextValue)) {
    const option = document.createElement("option");
    option.value = nextValue;
    option.textContent = nextValue;
    select.appendChild(option);
  }

  select.value = nextValue;
}

function populateComPorts(ports = [], selectedPort = "") {
  const select = document.querySelector("#comPort");
  select.innerHTML = '<option value="">Select COM Port</option>';

  ports.forEach(port => {
    const option = document.createElement("option");
    option.value = port.device || "";
    option.textContent = port.label || port.device || "";
    select.appendChild(option);
  });

  if (selectedPort && !Array.from(select.options).some(option => option.value === selectedPort)) {
    const option = document.createElement("option");
    option.value = selectedPort;
    option.textContent = `${selectedPort} (saved)`;
    select.appendChild(option);
  }

  select.value = selectedPort || "";
  if (comPortHint) {
    comPortHint.textContent = ports.length
      ? `${ports.length} COM port${ports.length === 1 ? "" : "s"} detected`
      : "No COM ports detected. Connect the device and reopen/test.";
  }
}

function applySettings(settings, availablePorts = []) {
  populateComPorts(availablePorts, settings.portName || "");
  ensureSelectValue("#baudrate", settings.baudRate, "9600");
  document.querySelector("#timeout").value = settings.timeout || "1000";
  ensureSelectValue("#byteSize", settings.dataBits, "8");
  ensureSelectValue("#parity", settings.parity, "None");
  ensureSelectValue("#stopBit", settings.stopBits, "1");
  document.querySelector("#startCharacter").value = characterToAsciiInput(settings.startCharacter || "");
  document.querySelector("#endCharacter").value = characterToAsciiInput(settings.endCharacter || "");
  document.querySelector("#startAddress").value = settings.startAddress || "0";
  document.querySelector("#endAddress").value = settings.endAddress || "0";
  document.querySelector("#reverseWeight").checked = settings.reverseWeight === true;
  renderPreview();
}

function setTopStatus(status, message = "") {
  const resolvedStatus = status === "success" ? "success" : "not_connected";
  connectionStatus.textContent = message || (resolvedStatus === "success" ? "Connected" : "Not Connected");
  connectionStatus.classList.toggle("error", resolvedStatus !== "success");
}

function setLiveStatus(status, value = "") {
  const hasValue = Boolean((value || "").trim());
  const resolvedStatus = hasValue ? "success" : status;
  const statusText = resolvedStatus === "success" ? "Reading scale data" : "Waiting for scale data";

  liveConnectionState.textContent = statusText;
  liveConnectionState.classList.toggle("connected", resolvedStatus === "success");
  liveValue.textContent = hasValue ? value : "--";
}

function setTestButtonState(isTesting) {
  testConnectionBtn.textContent = isTesting ? "Testing..." : "Test Connection";
  testConnectionBtn.disabled = isTesting;
}

function setPickerMode(mode) {
  activePickerMode = mode;
  pickerModeButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.pickerMode === activePickerMode);
  });
  renderSelectedAscii();
}

function advancePickerMode() {
  const order = ["startAscii", "endAscii", "fromPosition", "toPosition"];
  const currentIndex = order.indexOf(activePickerMode);
  const nextMode = order[Math.min(currentIndex + 1, order.length - 1)] || "startAscii";
  setPickerMode(nextMode);
}

function renderAsciiBoxes(rawText = lastTestRawValue) {
  if (!asciiBoxGrid) return;

  const text = String(rawText || "");
  asciiBoxGrid.innerHTML = "";

  if (!text) {
    asciiBoxGrid.innerHTML = '<div class="ascii-empty">Save communication settings to show continuous live ASCII boxes.</div>';
    return;
  }

  Array.from(text).forEach((char, index) => {
    const code = char.charCodeAt(0);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ascii-box";
    button.dataset.char = char;
    button.dataset.index = String(index + 1);
    button.innerHTML = `
      <span class="ascii-box__char">${escapeHtml(characterLabel(char))}</span>
      <span class="ascii-box__code">${code}</span>
      <small>${index + 1}</small>
    `;
    if (
      lastSelectedAscii
      && lastSelectedAscii.index === index + 1
      && lastSelectedAscii.code === code
    ) {
      button.classList.add("selected");
    }
    if (
      selectedStartAscii
      && selectedStartAscii.position === index + 1
      && selectedStartAscii.code === code
    ) {
      button.classList.add("range-start");
    }
    if (
      selectedEndAscii
      && selectedEndAscii.position === index + 1
      && selectedEndAscii.code === code
    ) {
      button.classList.add("range-end");
    }
    if (selectedFromPosition && selectedFromPosition.rawPosition === index + 1) {
      button.classList.add("position-start");
    }
    if (selectedToPosition && selectedToPosition.rawPosition === index + 1) {
      button.classList.add("position-end");
    }
    button.addEventListener("click", () => selectAsciiCharacter(char, index + 1));
    asciiBoxGrid.appendChild(button);
  });
}

function selectAsciiCharacter(char, position) {
  lastSelectedAscii = {
    char,
    code: char.charCodeAt(0),
    position,
  };

  if (activePickerMode === "startAscii") {
    selectedStartAscii = { ...lastSelectedAscii };
    document.querySelector("#startCharacter").value = lastSelectedAscii.code;
    advancePickerMode();
  } else if (activePickerMode === "endAscii") {
    selectedEndAscii = { ...lastSelectedAscii };
    document.querySelector("#endCharacter").value = selectedEndAscii.code;
    advancePickerMode();
  } else if (activePickerMode === "fromPosition") {
    selectedFromPosition = {
      rawPosition: position,
      relativePosition: resolveRelativeAddressPosition(lastTestRawValue, position),
    };
    document.querySelector("#startAddress").value = selectedFromPosition.relativePosition;
    advancePickerMode();
  } else if (activePickerMode === "toPosition") {
    selectedToPosition = {
      rawPosition: position,
      relativePosition: resolveRelativeAddressPosition(lastTestRawValue, position),
    };
    if (selectedFromPosition && selectedToPosition.relativePosition < selectedFromPosition.relativePosition) {
      const previousFrom = selectedFromPosition;
      selectedFromPosition = selectedToPosition;
      selectedToPosition = previousFrom;
    }
    if (selectedFromPosition) {
      document.querySelector("#startAddress").value = selectedFromPosition.relativePosition;
    }
    document.querySelector("#endAddress").value = selectedToPosition.relativePosition;
  }

  renderSelectedAscii();
  renderPreview();
  renderAsciiBoxes(lastTestRawValue);
}

function resolveRelativeAddressPosition(rawText, rawPosition) {
  const text = String(rawText || "");
  const startCharacter = asciiInputToCharacter(document.querySelector("#startCharacter").value);
  const endCharacter = asciiInputToCharacter(document.querySelector("#endCharacter").value);
  const zeroBasedRawPosition = Math.max(Number(rawPosition) || 1, 1) - 1;

  if (startCharacter && endCharacter) {
    let searchIndex = 0;
    while (searchIndex < text.length) {
      const startMarkerIndex = text.indexOf(startCharacter, searchIndex);
      if (startMarkerIndex === -1) break;

      const contentStartIndex = startMarkerIndex + startCharacter.length;
      const endMarkerIndex = text.indexOf(endCharacter, contentStartIndex);
      if (endMarkerIndex === -1) break;

      if (zeroBasedRawPosition >= contentStartIndex && zeroBasedRawPosition < endMarkerIndex) {
        return zeroBasedRawPosition - contentStartIndex + 1;
      }

      searchIndex = endMarkerIndex + endCharacter.length;
    }
  }

  let startIndex = 0;
  let endIndex = text.length;

  if (startCharacter) {
    const markerIndex = text.indexOf(startCharacter);
    if (markerIndex >= 0) {
      startIndex = markerIndex + startCharacter.length;
    }
  }

  if (endCharacter) {
    const markerIndex = text.indexOf(endCharacter, startIndex);
    if (markerIndex >= 0) {
      endIndex = markerIndex;
    }
  }

  if (zeroBasedRawPosition < startIndex || zeroBasedRawPosition >= endIndex) {
    return rawPosition;
  }

  return zeroBasedRawPosition - startIndex + 1;
}

function renderSelectedAscii() {
  if (!selectedAsciiCard) return;

  const modeLabels = {
    startAscii: "First ASCII",
    endAscii: "Last ASCII",
    fromPosition: "Start Position",
    toPosition: "End Position",
  };
  const startText = selectedStartAscii ? `First ASCII ${selectedStartAscii.code} (${characterLabel(selectedStartAscii.char)})` : "First ASCII --";
  const endText = selectedEndAscii ? `Last ASCII ${selectedEndAscii.code} (${characterLabel(selectedEndAscii.char)})` : "Last ASCII --";
  const fromText = selectedFromPosition ? `Start Pos ${selectedFromPosition.relativePosition}` : "Start Pos --";
  const toText = selectedToPosition ? `End Pos ${selectedToPosition.relativePosition}` : "End Pos --";

  selectedAsciiCard.querySelector("strong").textContent = `${startText} | ${endText} | ${fromText} | ${toText}`;
  selectedAsciiCard.querySelector("small").textContent = `Active icon: ${modeLabels[activePickerMode]}. Click a live box to assign it.`;
  return;

  if (!selectedStartAscii) {
    selectedAsciiCard.querySelector("strong").textContent = "--";
    selectedAsciiCard.querySelector("small").textContent = "Step 1: click the Start ASCII box.";
    return;
  }

  if (!selectedEndAscii) {
    selectedAsciiCard.querySelector("strong").textContent =
      `Start: pos ${selectedStartAscii.position}, ASCII ${selectedStartAscii.code} (${characterLabel(selectedStartAscii.char)})`;
    selectedAsciiCard.querySelector("small").textContent = "Step 2: click the End ASCII box.";
    return;
  }

  if (!selectedFromPosition) {
    selectedAsciiCard.querySelector("strong").textContent =
      `Start ASCII ${selectedStartAscii.code} (${characterLabel(selectedStartAscii.char)}) to End ASCII ${selectedEndAscii.code} (${characterLabel(selectedEndAscii.char)})`;
    selectedAsciiCard.querySelector("small").textContent = "Step 3: click the first value position inside the selected ASCII segment.";
    return;
  }

  if (!selectedToPosition) {
    selectedAsciiCard.querySelector("strong").textContent =
      `From position ${selectedFromPosition.relativePosition}`;
    selectedAsciiCard.querySelector("small").textContent = "Step 4: click the last value position inside the same segment.";
    return;
  }

  selectedAsciiCard.querySelector("strong").textContent =
    `Start pos ${selectedStartAscii.position} ASCII ${selectedStartAscii.code} → End pos ${selectedEndAscii.position} ASCII ${selectedEndAscii.code}`;
  selectedAsciiCard.querySelector("small").textContent =
    `Characters: ${characterLabel(selectedStartAscii.char)} to ${characterLabel(selectedEndAscii.char)}. From ${document.querySelector("#startAddress").value}, To ${document.querySelector("#endAddress").value}.`;
  selectedAsciiCard.querySelector("strong").textContent =
    `ASCII ${selectedStartAscii.code} to ${selectedEndAscii.code}, From ${selectedFromPosition.relativePosition} to ${selectedToPosition.relativePosition}`;
  selectedAsciiCard.querySelector("small").textContent =
    "Preview is updated. Click another box to start a new selection.";
}

function renderPreview(rawText = lastTestRawValue) {
  if (!previewValue || !previewMeta || !previewStatus) return;

  const payload = resolvePreviewSegments(
    rawText,
    asciiInputToCharacter(document.querySelector("#startCharacter").value),
    asciiInputToCharacter(document.querySelector("#endCharacter").value),
    document.querySelector("#startAddress").value,
    document.querySelector("#endAddress").value,
    document.querySelector("#reverseWeight").checked
  );

  const hasRaw = Boolean(String(payload.raw || "").trim());
  previewStatus.textContent = hasRaw
    ? (isLiveRawMode ? "Live preview ready" : "Test preview ready")
    : "Waiting";
  previewValue.textContent = payload.displayValue || payload.value || "--";
  previewMeta.innerHTML = payload.notes.map(note => `<span>${escapeHtml(note)}</span>`).join("");
  document.querySelector("#startCharacterAscii").textContent = asciiInputLabel(document.querySelector("#startCharacter").value);
  document.querySelector("#endCharacterAscii").textContent = asciiInputLabel(document.querySelector("#endCharacter").value);
  renderAsciiBoxes(rawText);
  renderSelectedAscii();
}

async function runSingleTest(controller) {
  try {
    setTopStatus("not_connected", "Testing...");
    const response = await fetch(`${communicationApiUrl}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayload()),
      signal: controller.signal
    });
    const result = await response.json();

    setTopStatus(result.status || "not_connected");
    isLiveRawMode = false;
    lastTestRawValue = result.rawValue || result.value || "";
    renderPreview(lastTestRawValue);

    if (result.status === "success") {
      showToast("Test connection success");
    } else if (result.message) {
      showToast(result.message);
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    setTopStatus("not_connected");
    showToast(error.message || "Failed to test communication");
  } finally {
    activeTestController = null;
    setTestButtonState(false);
  }
}

async function pollLiveData() {
  if (livePollBusy) return;
  livePollBusy = true;

  try {
    const response = await fetch(`${communicationApiUrl}/live`, {
      cache: "no-store"
    });
    const result = await response.json();
    setLiveStatus(result.status || "not_connected", result.value || "");
    if (result.rawValue) {
      isLiveRawMode = true;
      lastTestRawValue = result.rawValue;
      renderPreview(lastTestRawValue);
    }
  } catch (error) {
    setLiveStatus("not_connected");
  } finally {
    livePollBusy = false;
  }
}

function startLivePolling() {
  if (livePollTimer) {
    clearInterval(livePollTimer);
  }
  pollLiveData();
  livePollTimer = setInterval(pollLiveData, 1500);
}

async function loadCommunicationDetails() {
  const response = await fetch(communicationApiUrl);
  if (!response.ok) {
    throw new Error("Failed to load communication details");
  }

  const result = await response.json();
  applySettings(result.settings || {}, result.availablePorts || []);
}

communicationForm.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const response = await fetch(communicationApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayload())
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to save communication details");
    }

    applySettings(result.settings || {}, result.availablePorts || []);
    if (typeof window.refreshScaleConnection === "function") {
      await window.refreshScaleConnection();
    }
    startLivePolling();
    showToast(result.message || "Communication details saved successfully");
  } catch (error) {
    showToast(error.message || "Failed to save communication details");
  }
});

testConnectionBtn.addEventListener("click", async () => {
  if (activeTestController) {
    activeTestController.abort();
    activeTestController = null;
    setTestButtonState(false);
    setTopStatus("not_connected");
    showToast("Connection closed");
    return;
  }

  const controller = new AbortController();
  activeTestController = controller;
  setTestButtonState(true);
  setTopStatus("not_connected", "Testing...");

  await runSingleTest(controller);
});

document.querySelectorAll(".communication-field input, .communication-field select, #reverseWeight").forEach(field => {
  const fieldWrap = field.closest(".communication-field");

  field.addEventListener("input", () => {
    if (field.id === "startCharacter" || field.id === "endCharacter" || field.id === "startAddress" || field.id === "endAddress") {
      selectedStartAscii = null;
      selectedEndAscii = null;
      selectedFromPosition = null;
      selectedToPosition = null;
      lastSelectedAscii = null;
      setPickerMode("startAscii");
    }
    renderPreview(lastTestRawValue);
  });
  field.addEventListener("change", () => renderPreview(lastTestRawValue));
  field.addEventListener("focus", () => fieldWrap?.classList.add("is-focused"));
  field.addEventListener("blur", () => fieldWrap?.classList.remove("is-focused"));
});

pickerModeButtons.forEach(button => {
  button.addEventListener("click", () => setPickerMode(button.dataset.pickerMode));
});

clearAsciiSelectionBtn?.addEventListener("click", () => {
  document.querySelector("#startCharacter").value = "";
  document.querySelector("#endCharacter").value = "";
  document.querySelector("#startAddress").value = "0";
  document.querySelector("#endAddress").value = "0";
  lastSelectedAscii = null;
  selectedStartAscii = null;
  selectedEndAscii = null;
  selectedFromPosition = null;
  selectedToPosition = null;
  setPickerMode("startAscii");
  renderPreview(lastTestRawValue);
});

setTopStatus("not_connected", "Idle");
setLiveStatus("not_connected");
setTestButtonState(false);
renderPreview("");

loadCommunicationDetails().catch(error => {
  setTopStatus("not_connected");
  setLiveStatus("not_connected");
  renderPreview("");
  showToast(error.message || "Failed to load communication details");
}).finally(startLivePolling);
