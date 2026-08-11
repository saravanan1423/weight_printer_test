const LIVE_WEIGHT_URL = "/settings/api/communication/live";
const LIVE_WEIGHT_POLL_INTERVAL_MS = 1000;
const DISCONNECT_FAILURE_THRESHOLD = 3;

let pollTimer = null;
let pollInFlight = false;
let stopped = false;
let lastValidDetail = null;
let consecutiveFailures = 0;

function publishLiveResult(result = {}) {
  const value = String(result.value ?? "").trim();
  const hasValidValue = result.status === "success" && value !== "" && value !== "--";

  if (hasValidValue) {
    lastValidDetail = result;
    consecutiveFailures = 0;
    postMessage({ type: "scale-live-update", detail: result });
    return;
  }

  consecutiveFailures += 1;
  if (lastValidDetail && consecutiveFailures < DISCONNECT_FAILURE_THRESHOLD) {
    postMessage({
      type: "scale-live-update",
      detail: { ...lastValidDetail, waitingForNextReading: true }
    });
    return;
  }

  lastValidDetail = null;
  postMessage({ type: "scale-live-update", detail: result });
}

async function pollLiveWeight() {
  if (stopped || pollInFlight) return;
  pollInFlight = true;

  try {
    const response = await fetch(LIVE_WEIGHT_URL, {
      cache: "no-store",
      credentials: "same-origin"
    });
    const result = await response.json().catch(() => ({}));
    publishLiveResult(result);
  } catch (error) {
    publishLiveResult({
      status: "not_connected",
      value: "",
      message: error?.message || "Failed to read scale"
    });
  } finally {
    pollInFlight = false;
    if (!stopped) {
      pollTimer = setTimeout(pollLiveWeight, LIVE_WEIGHT_POLL_INTERVAL_MS);
    }
  }
}

function stopPolling() {
  stopped = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

self.addEventListener("message", event => {
  if (event.data?.type === "stop") {
    stopPolling();
  }
});

pollLiveWeight();
