import { TexasCommandCenter } from "./components/TexasCommandCenter";
import { UkCommandCenter } from "./UkCommandCenter";
import { RadarApp } from "./RadarApp";
import { FloridaApp } from "./FloridaApp";
import { MfuSupportApp } from "./MfuSupportApp";

function isTexasCommandCenterRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.pathname.includes("/texas");
}

function isUkLegacyRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.pathname.includes("/uk");
}

function isFloridaRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.pathname.includes("/florida");
}

function isMfuSupportRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.location.pathname.includes("/mfu-support") ||
    window.location.pathname.includes("/commissary")
  );
}

export function App() {
  if (isTexasCommandCenterRoute()) {
    return <TexasCommandCenter />;
  }
  if (isUkLegacyRoute()) {
    return <UkCommandCenter />;
  }
  if (isFloridaRoute()) {
    return <FloridaApp />;
  }
  if (isMfuSupportRoute()) {
    return <MfuSupportApp />;
  }
  return <RadarApp />;
}
