/** Storage access that survives iOS private mode / blocked cookies. */
function canUseStorage(storage: Storage): boolean {
  try {
    const probe = "__passready_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

let localOk: boolean | null = null;
let sessionOk: boolean | null = null;

function localAvailable(): boolean {
  if (localOk === null) {
    localOk = typeof localStorage !== "undefined" && canUseStorage(localStorage);
  }
  return localOk;
}

function sessionAvailable(): boolean {
  if (sessionOk === null) {
    sessionOk = typeof sessionStorage !== "undefined" && canUseStorage(sessionStorage);
  }
  return sessionOk;
}

export function readLocal(key: string): string | null {
  if (!localAvailable()) {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  if (!localAvailable()) {
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function removeLocal(key: string): void {
  if (!localAvailable()) {
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readSession(key: string): string | null {
  if (!sessionAvailable()) {
    return null;
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string): void {
  if (!sessionAvailable()) {
    return;
  }
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
