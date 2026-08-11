(() => {
  const toast = document.querySelector("#toast");
  const toastTitle = document.querySelector("#toastTitle");
  const toastMessage = document.querySelector("#toastMessage");
  const toastIcon = document.querySelector("#toastIcon");
  const toastCloseButton = document.querySelector("#toastCloseButton");
  const toastVariants = ["toast--success", "toast--danger", "toast--warning"];
  const TOAST_DURATION_MS = 3000;
  let toastHideStartedAt = 0;
  let toastRemainingMs = TOAST_DURATION_MS;

  function detectToastVariant(message) {
    const value = String(message || "").trim().toLowerCase();

    if (
      value.includes("failed") ||
      value.includes("error") ||
      value.includes("already exists") ||
      value.includes("delete") && value.includes("unable")
    ) {
      return "danger";
    }

    if (
      value.startsWith("warning:") ||
      value.includes("not registered") ||
      value.includes("select ") ||
      value.includes("required") ||
      value.includes("must ") ||
      value.includes("invalid") ||
      value.includes("no record")
    ) {
      return "warning";
    }

    return "success";
  }

  function hideToast() {
    toast?.classList.remove("show");
  }

  function clearToastTimer() {
    window.clearTimeout(window.showToast.timer);
    window.showToast.timer = null;
  }

  function startToastTimer(duration = TOAST_DURATION_MS) {
    toastHideStartedAt = Date.now();
    toastRemainingMs = duration;
    clearToastTimer();
    window.showToast.timer = window.setTimeout(hideToast, duration);
  }

  function getToastMeta(variant) {
    if (variant === "danger") {
      return {
        title: "Error",
        icon: "!"
      };
    }

    if (variant === "warning") {
      return {
        title: "Warning",
        icon: "!"
      };
    }

    return {
      title: "Success",
      icon: "✓"
    };
  }

  window.showToast = function showToast(message, variant = null) {
    if (!toast) return;
    const resolvedVariant = variant || detectToastVariant(message);
    const meta = getToastMeta(resolvedVariant);

    if (toastTitle) {
      toastTitle.textContent = meta.title;
    }
    if (toastMessage) {
      toastMessage.textContent = message;
    }
    if (toastIcon) {
      toastIcon.textContent = meta.icon;
    }
    toast.classList.remove(...toastVariants);
    toast.classList.add(`toast--${resolvedVariant}`);
    toast.classList.add("show");
    startToastTimer(TOAST_DURATION_MS);
  };

  toastCloseButton?.addEventListener("click", () => {
    clearToastTimer();
    hideToast();
  });

  toast?.addEventListener("mouseenter", () => {
    if (!window.showToast.timer) return;
    const elapsedMs = Date.now() - toastHideStartedAt;
    toastRemainingMs = Math.max(0, toastRemainingMs - elapsedMs);
    clearToastTimer();
  });

  toast?.addEventListener("mouseleave", () => {
    if (!toast.classList.contains("show")) return;
    startToastTimer(Math.max(400, toastRemainingMs || TOAST_DURATION_MS));
  });

  document.querySelector("#topLogoutBtn")?.addEventListener("click", () => showToast("Logout selected"));

  document.querySelector("#sidebarToggle")?.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 980px)").matches) return;
    document.querySelector(".app")?.classList.remove("sidebar-collapsed");
    showToast("Hover the sidebar to expand");
  });

  const workspaceShell = document.querySelector(".workspace-shell");
  const nav = document.querySelector(".nav");
  const entryCard = document.querySelector("#entryCard");
  const scaleConnectionStatus = document.querySelector("#scaleConnectionStatus");
  const cameraConnectionStatus = document.querySelector("#cameraConnectionStatus");
  const scaleLiveApiUrl = "/settings/api/communication/live";
  const cameraStatusApiUrl = "/settings/api/cameras/status";
  const SCALE_REFRESH_INTERVAL_MS = 1000;
  const CAMERA_REFRESH_INTERVAL_MS = 60 * 1000;
  const UPDATE_DISMISSED_SESSION_KEY = "weighman:update-dismissed-version";
  const SETTINGS_UNLOCKED_SESSION_KEY = "weighman:settings-unlocked";
  const settingsLockModal = document.querySelector("#settingsLockModal");
  const settingsLockForm = document.querySelector("#settingsLockForm");
  const settingsLockPassword = document.querySelector("#settingsLockPassword");
  const settingsLockError = document.querySelector("#settingsLockError");
  const settingsLockCancelButton = document.querySelector("#settingsLockCancelButton");
  const settingsLockUnlockButton = document.querySelector("#settingsLockUnlockButton");
  let scalePollTimer = null;
  let scalePollInFlight = false;
  let scaleIsConnected = false;
  let cameraPollTimer = null;
  let cameraPollInFlight = false;
  let navigationTimer = null;
  let appUpdateInfo = null;
  let appUpdateStatusTimer = null;
  let pendingSettingsUnlockAction = null;
  const prefetchedNavigationUrls = new Set();

  function smoothNavigate(url, { replace = false } = {}) {
    if (!url || url === window.location.pathname || url === window.location.href) return;
    window.clearTimeout(navigationTimer);
    if (replace) {
      window.location.replace(url);
      return;
    }
    window.location.href = url;
  }

  window.smoothNavigate = smoothNavigate;

  function settingsAreUnlocked() {
    return window.sessionStorage.getItem(SETTINGS_UNLOCKED_SESSION_KEY) === "true";
  }

  function isSettingsPage() {
    return window.location.pathname === "/settings" || window.location.pathname.startsWith("/settings/");
  }

  function setSettingsUnlocked() {
    window.sessionStorage.setItem(SETTINGS_UNLOCKED_SESSION_KEY, "true");
  }

  function setSettingsLockModalVisible(isVisible) {
    if (!settingsLockModal) return;
    settingsLockModal.classList.toggle("open", isVisible);
    settingsLockModal.setAttribute("aria-hidden", isVisible ? "false" : "true");
    if (isVisible) {
      if (settingsLockError) settingsLockError.textContent = "";
      if (settingsLockPassword) {
        settingsLockPassword.value = "";
        window.setTimeout(() => settingsLockPassword.focus(), 0);
      }
    }
  }

  function closeSettingsLockModal() {
    pendingSettingsUnlockAction = null;
    setSettingsLockModalVisible(false);
    if (isSettingsPage() && !settingsAreUnlocked()) {
      smoothNavigate("/weightment", { replace: true });
    }
  }

  function requestSettingsUnlock(afterUnlock) {
    if (settingsAreUnlocked()) {
      afterUnlock?.();
      return;
    }
    pendingSettingsUnlockAction = afterUnlock || null;
    setSettingsLockModalVisible(true);
  }

  function openNavigationGroup(trigger) {
    document.querySelector(".app")?.classList.remove("sidebar-collapsed");
    const group = trigger.closest(".nav-group");
    if (!group) return;
    const isOpen = group.classList.contains("open");
    document.querySelectorAll(".nav-group").forEach(item => {
      item.classList.remove("open");
      item.querySelector(":scope > button").setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll(".nav [data-screen], .nav-group > button").forEach(item => item.classList.remove("active"));
    if (!isOpen) {
      group.classList.add("open");
      trigger.classList.add("active");
      trigger.setAttribute("aria-expanded", "true");
    }
    trigger.blur();
  }

  async function unlockSettings(event) {
    event?.preventDefault();
    const password = settingsLockPassword?.value || "";
    if (!password.trim()) {
      if (settingsLockError) settingsLockError.textContent = "Enter settings password";
      settingsLockPassword?.focus();
      return;
    }

    if (settingsLockUnlockButton) settingsLockUnlockButton.disabled = true;
    if (settingsLockCancelButton) settingsLockCancelButton.disabled = true;
    if (settingsLockError) settingsLockError.textContent = "Checking password...";

    try {
      const response = await fetch("/settings/api/settings-auth/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Settings password is incorrect");
      }
      setSettingsUnlocked();
      const action = pendingSettingsUnlockAction;
      pendingSettingsUnlockAction = null;
      setSettingsLockModalVisible(false);
      showToast(result.message || "Settings unlocked");
      action?.();
    } catch (error) {
      if (settingsLockError) settingsLockError.textContent = error.message || "Settings password is incorrect";
      settingsLockPassword?.focus();
      settingsLockPassword?.select();
    } finally {
      if (settingsLockUnlockButton) settingsLockUnlockButton.disabled = false;
      if (settingsLockCancelButton) settingsLockCancelButton.disabled = false;
    }
  }

  function prefetchNavigationUrl(url) {
    if (!url || prefetchedNavigationUrls.has(url) || url === window.location.pathname || url === window.location.href) return;
    prefetchedNavigationUrls.add(url);
    fetch(url, {
      cache: "force-cache",
      credentials: "same-origin"
    }).catch(() => {
      prefetchedNavigationUrls.delete(url);
    });
  }

  function warmNavigationCache() {
    const urls = [...new Set(
      [...document.querySelectorAll(".nav [data-nav-url]")]
        .map(button => button.dataset.navUrl)
        .filter(Boolean)
        .filter(url => url !== window.location.pathname && url !== window.location.href)
    )];
    urls.forEach((url, index) => {
      window.setTimeout(() => prefetchNavigationUrl(url), 350 + index * 180);
    });
  }

  function isHomeScreen() {
    return window.location.pathname === "/" || window.location.pathname === "/weightment";
  }

  function setAppUpdateModalVisible(isVisible) {
    const modal = document.querySelector("#appUpdateModal");
    if (!modal) return;
    modal.classList.toggle("show", Boolean(isVisible));
    modal.setAttribute("aria-hidden", String(!isVisible));
  }

  function setAppUpdateStatus(message, isError = false) {
    const status = document.querySelector("#appUpdateStatus");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
  }

  function setAppUpdateProgress(percent = 0, visible = false) {
    const progress = document.querySelector("#appUpdateProgress");
    const progressBar = document.querySelector("#appUpdateProgressBar");
    const cleanPercent = Math.max(0, Math.min(100, Number(percent) || 0));
    if (progress) progress.hidden = !visible;
    if (progressBar) progressBar.style.width = `${cleanPercent}%`;
  }

  function stopAppUpdateStatusPolling() {
    if (!appUpdateStatusTimer) return;
    window.clearInterval(appUpdateStatusTimer);
    appUpdateStatusTimer = null;
  }

  async function refreshAppUpdateStatus() {
    const response = await fetch("/settings/api/admin/update/status", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Failed to read update progress");
    }
    const percent = Number(result.percent || 0);
    setAppUpdateProgress(percent, result.running || percent > 0);
    setAppUpdateStatus(result.message || (result.running ? `Updating ${percent}%` : ""));
    if (!result.running && result.error) {
      stopAppUpdateStatusPolling();
      document.querySelector("#appUpdateNowButton").disabled = false;
      document.querySelector("#appUpdateLaterButton").disabled = false;
      setAppUpdateStatus(result.error, true);
    }
  }

  function startAppUpdateStatusPolling() {
    stopAppUpdateStatusPolling();
    refreshAppUpdateStatus().catch(error => setAppUpdateStatus(error.message || "Failed to read update progress", true));
    appUpdateStatusTimer = window.setInterval(() => {
      refreshAppUpdateStatus().catch(error => {
        stopAppUpdateStatusPolling();
        setAppUpdateStatus(error.message || "Failed to read update progress", true);
      });
    }, 500);
  }

  async function checkForHomeScreenUpdate() {
    if (!isHomeScreen()) return;
    const modal = document.querySelector("#appUpdateModal");
    if (!modal) return;
    try {
      const response = await fetch("/settings/api/admin/update/check", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.updateAvailable) return;
      const latestVersion = result.latestVersion || "";
      if (latestVersion && sessionStorage.getItem(UPDATE_DISMISSED_SESSION_KEY) === latestVersion) return;
      appUpdateInfo = result;
      const message = document.querySelector("#appUpdateMessage");
      if (message) {
        message.textContent = `Version ${latestVersion || "latest"} is available. Current version is ${result.currentVersion || "--"}.`;
      }
      setAppUpdateProgress(0, false);
      setAppUpdateStatus(result.notes || "Click Update Now to download and restart.");
      setAppUpdateModalVisible(true);
    } catch (error) {
      // Silent on startup; manual update check remains available in Admin Settings.
    }
  }

  document.querySelector("#appUpdateLaterButton")?.addEventListener("click", () => {
    if (appUpdateInfo?.latestVersion) {
      sessionStorage.setItem(UPDATE_DISMISSED_SESSION_KEY, appUpdateInfo.latestVersion);
    }
    setAppUpdateModalVisible(false);
  });

  document.querySelector("#appUpdateNowButton")?.addEventListener("click", async () => {
    const updateButton = document.querySelector("#appUpdateNowButton");
    const laterButton = document.querySelector("#appUpdateLaterButton");
    updateButton.disabled = true;
    laterButton.disabled = true;
    setAppUpdateProgress(0, true);
    setAppUpdateStatus("Starting update 0%");
    try {
      const response = await fetch("/settings/api/admin/update/apply", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Failed to start update");
      }
      setAppUpdateStatus(result.message || "Update started.");
      startAppUpdateStatusPolling();
    } catch (error) {
      updateButton.disabled = false;
      laterButton.disabled = false;
      setAppUpdateProgress(0, false);
      setAppUpdateStatus(error.message || "Failed to start update", true);
    }
  });

  function scrollActiveNavigationIntoView() {
    const activeButton = nav?.querySelector("button.active");
    activeButton?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  }

  function hasLiveScaleValue(detail = {}) {
    const value = String(detail.value ?? "").trim();
    return detail.status === "success" && value !== "" && value !== "--";
  }

  function setScaleConnectionStatus(statusOrDetail) {
    if (!scaleConnectionStatus) return scaleIsConnected;
    if (typeof statusOrDetail === "object") {
      const value = String(statusOrDetail?.value ?? "").trim();
      if (value === "--" || (statusOrDetail?.status && statusOrDetail.status !== "success")) {
        scaleIsConnected = false;
      } else if (hasLiveScaleValue(statusOrDetail)) {
        scaleIsConnected = true;
      }
    } else if (statusOrDetail === "success") {
      scaleIsConnected = true;
    } else if (!scaleIsConnected) {
      scaleIsConnected = false;
    }
    const label = scaleIsConnected ? "Scale Connected" : "Device Disconnected";
    scaleConnectionStatus.lastChild.textContent = ` ${label}`;
    scaleConnectionStatus.classList.toggle("status-disconnected", !scaleIsConnected);
    if (scaleIsConnected && scalePollTimer) {
      window.clearTimeout(scalePollTimer);
      scalePollTimer = null;
    }
    return scaleIsConnected;
  }

  function setCameraConnectionStatus(status, connectedCount = 0) {
    if (!cameraConnectionStatus) return;
    const label = status === "success"
      ? `Camera Connected${connectedCount > 1 ? ` (${connectedCount})` : ""}`
      : "Camera Disconnected";
    cameraConnectionStatus.lastChild.textContent = ` ${label}`;
    cameraConnectionStatus.classList.toggle("status-disconnected", status !== "success");
  }

  function scheduleNextScalePoll() {
    window.clearTimeout(scalePollTimer);
    scalePollTimer = window.setTimeout(pollScaleConnection, SCALE_REFRESH_INTERVAL_MS);
  }

  async function pollScaleConnection() {
    if (scalePollInFlight) return;
    scalePollInFlight = true;
    try {
      const response = await fetch(scaleLiveApiUrl);
      const result = await response.json();
      setScaleConnectionStatus(result);
      document.dispatchEvent(new CustomEvent("scale-live-update", { detail: result }));
    } catch (error) {
      setScaleConnectionStatus("not_connected");
      document.dispatchEvent(new CustomEvent("scale-live-update", {
        detail: {
          status: "not_connected",
          value: "",
          message: error.message || "Failed to read scale",
          timeoutMs: SCALE_REFRESH_INTERVAL_MS
        }
      }));
    } finally {
      scalePollInFlight = false;
      if (!scaleIsConnected && !document.querySelector("#liveWeightValue")) {
        scheduleNextScalePoll();
      }
    }
  }

  function scheduleNextCameraPoll() {
    window.clearTimeout(cameraPollTimer);
    cameraPollTimer = window.setTimeout(pollCameraConnection, CAMERA_REFRESH_INTERVAL_MS);
  }

  async function pollCameraConnection() {
    if (cameraPollInFlight) return;
    cameraPollInFlight = true;
    try {
      const response = await fetch(cameraStatusApiUrl);
      const result = await response.json();
      setCameraConnectionStatus(result.status, result.connectedCount || 0);
      document.dispatchEvent(new CustomEvent("camera-status-update", { detail: result }));
    } catch (error) {
      setCameraConnectionStatus("not_connected", 0);
    } finally {
      cameraPollInFlight = false;
      scheduleNextCameraPoll();
    }
  }

  window.refreshScaleConnection = pollScaleConnection;
  window.refreshCameraConnection = pollCameraConnection;

  document.addEventListener("camera-status-update", event => {
    setCameraConnectionStatus(
      event.detail?.status || "not_connected",
      event.detail?.connectedCount || 0
    );
  });

  document.addEventListener("scale-live-update", event => {
    const isConnected = setScaleConnectionStatus(event.detail || {});
    if (!isConnected && !document.querySelector("#liveWeightValue")) {
      scheduleNextScalePoll();
    }
  });

  nav?.addEventListener("mouseleave", () => {
    workspaceShell?.classList.remove("nav-locked-collapsed");
    document.querySelectorAll(".nav-group").forEach(group => {
      group.classList.remove("open");
      group.querySelector(":scope > button")?.setAttribute("aria-expanded", "false");
    });
  });

  document.querySelectorAll(".nav [data-screen]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav [data-screen], .nav-group > button").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".nav-group").forEach(group => {
        group.classList.remove("open");
        group.querySelector(":scope > button").setAttribute("aria-expanded", "false");
      });
      button.classList.add("active");
      scrollActiveNavigationIntoView();
      if (entryCard) {
        entryCard.style.display = "flex";
      }
      button.blur();
      smoothNavigate(button.dataset.navUrl);
    });
  });

  document.querySelectorAll(".nav [data-nav-url]").forEach(button => {
    const prefetch = () => prefetchNavigationUrl(button.dataset.navUrl);
    button.addEventListener("mouseenter", prefetch, { passive: true });
    button.addEventListener("focus", prefetch);
    button.addEventListener("touchstart", prefetch, { passive: true });
  });

  document.querySelectorAll(".master-trigger, .setting-trigger").forEach(trigger => {
    trigger.addEventListener("click", event => {
      event.preventDefault();
      if (trigger.classList.contains("setting-trigger") && !settingsAreUnlocked()) {
        requestSettingsUnlock(() => openNavigationGroup(trigger));
        return;
      }
      openNavigationGroup(trigger);
    });
  });

  document.querySelectorAll(".dropdown button").forEach(button => {
    button.addEventListener("click", event => {
      const isSettingsMenuItem = button.closest('.dropdown[aria-label="Settings menu"]');
      if (isSettingsMenuItem && !settingsAreUnlocked()) {
        event.preventDefault();
        requestSettingsUnlock(() => smoothNavigate(button.dataset.navUrl));
        return;
      }
      document.querySelectorAll(".nav [data-screen], .nav-group > button").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".nav-group").forEach(group => {
        group.classList.remove("open");
        group.querySelector(":scope > button").setAttribute("aria-expanded", "false");
      });
      workspaceShell?.classList.add("nav-locked-collapsed");
      button.classList.add("active");
      scrollActiveNavigationIntoView();
      button.blur();
      smoothNavigate(button.dataset.navUrl);
    });
  });

  settingsLockForm?.addEventListener("submit", unlockSettings);
  settingsLockCancelButton?.addEventListener("click", closeSettingsLockModal);
  settingsLockModal?.addEventListener("click", event => {
    if (event.target === settingsLockModal) {
      closeSettingsLockModal();
    }
  });

  if (isSettingsPage() && !settingsAreUnlocked()) {
    requestSettingsUnlock(() => {});
  }

  setScaleConnectionStatus("not_connected");
  setCameraConnectionStatus("not_connected", 0);
  scrollActiveNavigationIntoView();
  pollScaleConnection();
  pollCameraConnection();
  warmNavigationCache();
  window.setTimeout(checkForHomeScreenUpdate, 1200);

  window.createFrontendPagination = function createFrontendPagination({
    mount,
    pageSize = 10,
    singularLabel = "record",
    pluralLabel = "records",
    onPageChange = null
  }) {
    if (!mount) return null;

    const pagination = document.createElement("div");
    pagination.className = "table-pagination";
    pagination.innerHTML = `
      <div class="table-pagination__summary"></div>
      <div class="table-pagination__actions">
        <button type="button" class="table-pagination__button" data-page-action="prev">Previous</button>
        <div class="table-pagination__pages"></div>
        <button type="button" class="table-pagination__button" data-page-action="next">Next</button>
      </div>
    `;
    mount.insertAdjacentElement("afterend", pagination);

    const summary = pagination.querySelector(".table-pagination__summary");
    const pages = pagination.querySelector(".table-pagination__pages");
    const prevButton = pagination.querySelector('[data-page-action="prev"]');
    const nextButton = pagination.querySelector('[data-page-action="next"]');

    const state = {
      currentPage: 1,
      totalItems: 0
    };

    function getTotalPages() {
      return Math.max(1, Math.ceil(state.totalItems / pageSize));
    }

    function render() {
      const totalPages = getTotalPages();
      const hasItems = state.totalItems > 0;
      const start = hasItems ? (state.currentPage - 1) * pageSize + 1 : 0;
      const end = hasItems ? Math.min(state.currentPage * pageSize, state.totalItems) : 0;
      const label = state.totalItems === 1 ? singularLabel : pluralLabel;

      summary.textContent = hasItems
        ? `${start}-${end} of ${state.totalItems} ${label}`
        : `0 ${pluralLabel}`;

      prevButton.disabled = state.currentPage <= 1 || !hasItems;
      nextButton.disabled = state.currentPage >= totalPages || !hasItems;
      pages.innerHTML = "";

      if (!hasItems) {
        pagination.hidden = true;
        return;
      }

      pagination.hidden = totalPages <= 1;

      const firstPage = Math.max(1, state.currentPage - 1);
      const lastPage = Math.min(totalPages, firstPage + 2);
      const startPage = Math.max(1, lastPage - 2);

      for (let page = startPage; page <= lastPage; page += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table-pagination__page";
        button.textContent = String(page);
        button.disabled = page === state.currentPage;
        button.classList.toggle("active", page === state.currentPage);
        button.addEventListener("click", () => api.setPage(page, true));
        pages.appendChild(button);
      }
    }

    const api = {
      pageSize,
      getCurrentPage() {
        return state.currentPage;
      },
      setPage(page, notify = false) {
        const totalPages = getTotalPages();
        state.currentPage = Math.min(Math.max(1, page), totalPages);
        render();
        if (notify) {
          onPageChange?.();
        }
      },
      reset() {
        state.currentPage = 1;
        render();
      },
      slice(rows, selectedIndex = -1) {
        state.totalItems = rows.length;

        if (selectedIndex >= 0) {
          state.currentPage = Math.floor(selectedIndex / pageSize) + 1;
        } else {
          state.currentPage = Math.min(state.currentPage, getTotalPages());
        }

        render();

        const startIndex = (state.currentPage - 1) * pageSize;
        return rows.slice(startIndex, startIndex + pageSize);
      }
    };

    prevButton.addEventListener("click", () => api.setPage(state.currentPage - 1, true));
    nextButton.addEventListener("click", () => api.setPage(state.currentPage + 1, true));
    render();
    return api;
  };

  window.refreshPageAfterSave = function refreshPageAfterSave(message, variant = null) {
    if (message) {
      window.showToast?.(message, variant);
    }
    window.setTimeout(() => {
      window.location.reload();
    }, TOAST_DURATION_MS + 120);
  };

  function prepareKeyboardTableRows(root = document) {
    const rows = root.matches?.("table tbody tr")
      ? [root]
      : Array.from(root.querySelectorAll?.("table tbody tr") || []);
    rows.forEach(row => {
      if (row.querySelector("td[colspan]")) return;
      if (!row.hasAttribute("tabindex")) row.tabIndex = 0;
    });
  }

  document.addEventListener("keydown", event => {
    if (event.defaultPrevented) return;
    const row = event.target.closest?.("table tbody tr[tabindex]");
    if (!row) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      row.click();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = Array.from(row.closest("tbody").querySelectorAll("tr[tabindex]"));
    const currentIndex = rows.indexOf(row);
    const offset = event.key === "ArrowDown" ? 1 : -1;
    rows[Math.max(0, Math.min(currentIndex + offset, rows.length - 1))]?.focus();
  });

  prepareKeyboardTableRows();
  new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      prepareKeyboardTableRows(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });

})();
