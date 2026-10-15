// Camera access: list cameras, open one, remember the choice.
// Works with any camera the browser can see, including an iPhone through
// Continuity Camera (it appears as a normal webcam on the Mac).

import { CAMERA_IDEAL_FPS, CAMERA_IDEAL_HEIGHT, CAMERA_IDEAL_WIDTH } from "./config.js";
import { KEYS, storage } from "./storage.js";

/** An error with a `kind` the UI can turn into a friendly message. */
export class CameraError extends Error {
  /** @param {"insecure"|"unsupported"|"denied"|"notFound"|"inUse"|"unknown"} kind */
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/** Browsers only allow the camera on https:// pages or on localhost. */
export function cameraAllowedHere() {
  return Boolean(globalThis.isSecureContext);
}

/** Turn a getUserMedia error into a CameraError with a plain kind. */
function classifyError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return new CameraError("denied", "Camera permission was denied.");
    case "NotFoundError":
    case "OverconstrainedError":
      return new CameraError("notFound", "No camera was found.");
    case "NotReadableError":
    case "AbortError":
      return new CameraError("inUse", "The camera is busy or could not start.");
    default:
      return new CameraError("unknown", error?.message ?? String(error));
  }
}

/**
 * Open a camera. Pass a deviceId to pick a specific one, or null for the default.
 * @returns {Promise<MediaStream>}
 */
export async function openCamera(deviceId = null) {
  if (!cameraAllowedHere()) {
    throw new CameraError("insecure", "The camera only works on https:// or localhost pages.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("unsupported", "This browser cannot use a camera.");
  }
  const video = {
    width: { ideal: CAMERA_IDEAL_WIDTH },
    height: { ideal: CAMERA_IDEAL_HEIGHT },
    frameRate: { ideal: CAMERA_IDEAL_FPS },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (error) {
    // A remembered camera may have been unplugged; fall back to any camera once.
    if (deviceId && (error?.name === "NotFoundError" || error?.name === "OverconstrainedError")) {
      return openCamera(null);
    }
    throw classifyError(error);
  }
}

/** Stop every track so the camera light turns off. */
export function closeCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * List video input devices. Labels are only filled in after permission is
 * granted, so call this after openCamera succeeds.
 * @returns {Promise<Array<{deviceId: string, label: string}>>}
 */
export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

/** The deviceId of the camera a stream is using. */
export function deviceIdOf(stream) {
  return stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
}

export function rememberCamera(deviceId) {
  storage.setJSON(KEYS.cameraDeviceId, deviceId);
}

export function rememberedCamera() {
  return storage.getJSON(KEYS.cameraDeviceId, null);
}

/** Fill a <select> with cameras and select the active one. */
export function fillCameraPicker(select, cameras, activeDeviceId) {
  select.replaceChildren(
    ...cameras.map((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.textContent = camera.label;
      option.selected = camera.deviceId === activeDeviceId;
      return option;
    }),
  );
  select.disabled = cameras.length === 0;
}
