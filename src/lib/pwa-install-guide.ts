export type PwaInstallBrowser = "chrome-android" | "chrome-ios" | "safari-ios";

export type PwaInstallGuide = {
  browser: PwaInstallBrowser;
  label: string;
  steps: string[];
};

const IOS_DEVICE_PATTERN = /iPhone|iPad|iPod/i;
const CHROME_IOS_PATTERN = /CriOS\//i;
const SAFARI_PATTERN = /Safari\//i;
const NON_SAFARI_IOS_PATTERN = /FxiOS|EdgiOS|OPiOS/i;
const ANDROID_PATTERN = /Android/i;
const CHROME_PATTERN = /Chrome\//i;
const NON_CHROME_ANDROID_PATTERN =
  /EdgA|OPR|SamsungBrowser|Firefox|DuckDuckGo|Vivaldi/i;

export function getPwaInstallGuide(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0
): PwaInstallGuide | null {
  const iosDevice =
    IOS_DEVICE_PATTERN.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);

  if (iosDevice && CHROME_IOS_PATTERN.test(userAgent)) {
    return {
      browser: "chrome-ios",
      label: "Chrome en iPhone o iPad",
      steps: [
        "Abre el menu ⋯ de Chrome y toca Compartir.",
        "Elige Añadir a pantalla de inicio.",
        "Confirma tocando Añadir.",
      ],
    };
  }

  if (
    iosDevice &&
    SAFARI_PATTERN.test(userAgent) &&
    !NON_SAFARI_IOS_PATTERN.test(userAgent)
  ) {
    return {
      browser: "safari-ios",
      label: "Safari en iPhone o iPad",
      steps: [
        "Toca Compartir (el cuadrado con la flecha hacia arriba).",
        "Desplazate y toca Añadir a pantalla de inicio.",
        "Confirma tocando Añadir.",
      ],
    };
  }

  if (
    ANDROID_PATTERN.test(userAgent) &&
    CHROME_PATTERN.test(userAgent) &&
    !NON_CHROME_ANDROID_PATTERN.test(userAgent)
  ) {
    return {
      browser: "chrome-android",
      label: "Chrome en Android",
      steps: [
        "Toca el menu ⋮ en la esquina superior derecha.",
        "Elige Instalar aplicacion o Añadir a pantalla de inicio.",
        "Confirma la instalacion.",
      ],
    };
  }

  return null;
}
