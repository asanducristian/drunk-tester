let isVerbose = false;

export function setVerbose(verbose) {
  isVerbose = verbose;
}

export function getVerbose() {
  return isVerbose;
}

export function log(...args) {
  console.log(...args);
}

export function error(...args) {
  console.error(...args);
}

export function debug(...args) {
  if (isVerbose) {
    console.log(...args);
  }
}
