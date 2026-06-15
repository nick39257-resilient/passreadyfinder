import { TexasCommandCenter } from "./components/TexasCommandCenter";
import { UkCommandCenter } from "./UkCommandCenter";
import { RadarApp } from "./RadarApp";
import { FloridaApp } from "./FloridaApp";

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
  return <RadarApp />;
}
