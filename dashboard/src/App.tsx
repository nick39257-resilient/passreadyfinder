import { TexasCommandCenter } from "./components/TexasCommandCenter";
import { UkCommandCenter } from "./UkCommandCenter";
import { RadarApp } from "./RadarApp";

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

export function App() {
  if (isTexasCommandCenterRoute()) {
    return <TexasCommandCenter />;
  }
  if (isUkLegacyRoute()) {
    return <UkCommandCenter />;
  }
  return <RadarApp />;
}
