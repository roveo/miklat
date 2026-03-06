import { requestLocation, findNearestShelter, formatDistance, getPlatformMapsUrl } from "./geolocation.js";
import { initMap, addUserMarker, panTo, highlightShelter, getShelters } from "./map.js";
import { detectLanguage, setLanguage, t } from "./i18n.js";
import { registerServiceWorker } from "./sw-register.js";

const findNearestButton = document.getElementById("find-nearest-btn");
const languageToggle = document.getElementById("language-toggle");
const languageModal = document.getElementById("language-modal");
const languageOptionButtons = Array.from(document.querySelectorAll("[data-lang-option]"));
const installHelpToggle = document.getElementById("install-help-toggle");
const installHelpPopover = document.getElementById("install-help-popover");
const installHelpIntro = document.getElementById("install-help-intro");
const installHelpSteps = document.getElementById("install-help-steps");
const installHelpSwitch = document.getElementById("install-help-switch");
const offlineIndicator = document.getElementById("offline-indicator");
const statusMessage = document.getElementById("status-message");

const INSTALL_PLATFORMS = ["ios", "android", "desktop"];
let installHelpPlatformOverride = null;

function showStatus(message, type = "info", timeoutMs = 3000) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
  statusMessage.classList.toggle("success", type === "success");

  window.setTimeout(() => {
    statusMessage.hidden = true;
  }, timeoutMs);
}

function updateOfflineIndicator() {
  offlineIndicator.hidden = navigator.onLine;
}

function updateActiveLanguageOption(language) {
  for (const button of languageOptionButtons) {
    const isActive = button.getAttribute("data-lang-option") === language;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
}

function setLanguageModalOpen(isOpen) {
  if (!languageModal || !languageToggle) {
    return;
  }

  languageModal.hidden = !isOpen;
  languageToggle.setAttribute("aria-expanded", String(isOpen));
}

function setInstallHelpOpen(isOpen) {
  if (!installHelpPopover || !installHelpToggle) {
    return;
  }

  installHelpPopover.hidden = !isOpen;
  installHelpToggle.setAttribute("aria-expanded", String(isOpen));
}

function closeFloatingPopovers() {
  setLanguageModalOpen(false);
  setInstallHelpOpen(false);
}

function detectInstallPlatform() {
  const userAgent = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);

  if (isIOS) {
    return "ios";
  }
  if (isAndroid) {
    return "android";
  }
  return "desktop";
}

function getNextInstallPlatform(currentPlatform) {
  const currentIndex = INSTALL_PLATFORMS.indexOf(currentPlatform);
  if (currentIndex < 0) {
    return INSTALL_PLATFORMS[0];
  }
  return INSTALL_PLATFORMS[(currentIndex + 1) % INSTALL_PLATFORMS.length];
}

function isStandaloneMode() {
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = window.navigator.standalone === true;
  return mediaStandalone || iosStandalone;
}

function getInstallInstructions() {
  const activePlatform = installHelpPlatformOverride || detectInstallPlatform();

  if (isStandaloneMode()) {
    return {
      intro: t("install_help_already_installed"),
      steps: [],
      platform: null,
    };
  }

  if (activePlatform === "ios") {
    return {
      intro: t("install_help_ios_intro"),
      steps: [
        t("install_help_ios_step_1"),
        t("install_help_ios_step_2"),
        t("install_help_ios_step_3"),
      ],
      platform: "ios",
    };
  }

  if (activePlatform === "android") {
    return {
      intro: t("install_help_android_intro"),
      steps: [
        t("install_help_android_step_1"),
        t("install_help_android_step_2"),
        t("install_help_android_step_3"),
      ],
      platform: "android",
    };
  }

  return {
    intro: t("install_help_desktop_intro"),
    steps: [
      t("install_help_desktop_step_1"),
      t("install_help_desktop_step_2"),
    ],
    platform: "desktop",
  };
}

function renderInstallInstructions() {
  if (!installHelpIntro || !installHelpSteps) {
    return;
  }

  const model = getInstallInstructions();
  installHelpIntro.textContent = model.intro;
  installHelpSteps.replaceChildren();

  for (const step of model.steps) {
    const item = document.createElement("li");
    item.textContent = step;
    installHelpSteps.appendChild(item);
  }

  if (!installHelpSwitch) {
    return;
  }

  if (!model.platform) {
    installHelpSwitch.hidden = true;
    installHelpSwitch.textContent = "";
    return;
  }

  const nextPlatform = getNextInstallPlatform(model.platform);
  installHelpSwitch.hidden = false;
  installHelpSwitch.textContent = `${t("install_help_other_platform")} ${t(`platform_${nextPlatform}`)}`;
}

function setupLanguagePickerModal() {
  if (!languageModal || !languageToggle) {
    return;
  }

  languageToggle.addEventListener("click", () => {
    setInstallHelpOpen(false);
    setLanguageModalOpen(languageModal.hidden);
  });

  languageModal.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", () => {
    closeFloatingPopovers();
  });

  languageToggle.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFloatingPopovers();
    }
  });
}

function setupInstallHelpPopover() {
  if (!installHelpToggle || !installHelpPopover) {
    return;
  }

  installHelpToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setLanguageModalOpen(false);
    setInstallHelpOpen(installHelpPopover.hidden);
  });

  installHelpPopover.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  installHelpSwitch?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const currentPlatform = (installHelpPlatformOverride || detectInstallPlatform());
    installHelpPlatformOverride = getNextInstallPlatform(currentPlatform);
    renderInstallInstructions();
  });
}

async function setupLanguage() {
  const language = detectLanguage();
  await setLanguage(language);

  updateActiveLanguageOption(language);
  renderInstallInstructions();

  for (const button of languageOptionButtons) {
    button.addEventListener("click", async () => {
      const nextLanguage = button.getAttribute("data-lang-option");
      if (!nextLanguage) {
        return;
      }

      await setLanguage(nextLanguage);
      updateActiveLanguageOption(nextLanguage);
      renderInstallInstructions();
      setLanguageModalOpen(false);
    });
  }

  setupLanguagePickerModal();
  setupInstallHelpPopover();
}

async function handleFindNearest() {
  if (!findNearestButton) {
    return;
  }

  findNearestButton.disabled = true;

  try {
    const position = await requestLocation();
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    addUserMarker(userLat, userLng);
    panTo(userLat, userLng, 14);

    const nearest = findNearestShelter(userLat, userLng, getShelters());
    if (!nearest) {
      showStatus(t("no_shelters"));
      return;
    }

    const distance = formatDistance(nearest.distanceMeters, t);
    highlightShelter(nearest.shelter, {
      distanceLabel: t("distance"),
      distanceValue: distance,
      openInMapsLabel: t("open_in_maps"),
      mapsUrl: getPlatformMapsUrl(nearest.shelter.lat, nearest.shelter.lng),
    });
    panTo(nearest.shelter.lat, nearest.shelter.lng, 16);

    showStatus(`${t("nearest_found")}: ${distance}`, "success", 3500);
  } catch (error) {
    if (error && error.code === 1) {
      showStatus(t("location_denied"));
    } else {
      showStatus(t("no_location"));
    }
  } finally {
    findNearestButton.disabled = false;
  }
}

async function boot() {
  await setupLanguage();

  showStatus(t("loading"), "info", 1500);
  await initMap({ openInMapsLabel: t("open_in_maps") });

  if (findNearestButton) {
    findNearestButton.addEventListener("click", handleFindNearest);
  }

  window.addEventListener("online", updateOfflineIndicator);
  window.addEventListener("offline", updateOfflineIndicator);
  updateOfflineIndicator();

  registerServiceWorker(() => {
    showStatus(t("update_available"), "info", 5000);
  });
}

boot().catch((error) => {
  console.error(error);
  showStatus(t("load_failed"));
});
