export type WaitingWorkerIdentity = {
  scriptURL: string;
  state: string;
};

export function getWaitingWorkerIdentity(
  worker: WaitingWorkerIdentity | null | undefined
): string | null {
  if (!worker || worker.state === "redundant") {
    return null;
  }
  return worker.scriptURL;
}

export function shouldNotifyWaitingWorker(
  workerIdentity: string | null,
  notifiedWorkerIdentity: string | null
): boolean {
  return Boolean(workerIdentity && workerIdentity !== notifiedWorkerIdentity);
}

export function isSerwistWorkerScript(scriptURL: string, origin: string) {
  try {
    const workerURL = new URL(scriptURL);
    return (
      workerURL.origin === origin && workerURL.pathname === "/serwist/sw.js"
    );
  } catch {
    return false;
  }
}
