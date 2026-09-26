let running = false;
let graceTimer;
let sampleTimer;

function calculateCpuPercent(previousCpu, currentCpu, elapsedNs) {
  if (elapsedNs <= 0n) return 0;
  const cpuMicroseconds = currentCpu.user - previousCpu.user + currentCpu.system - previousCpu.system;
  return Math.max(0, cpuMicroseconds / (Number(elapsedNs) / 1000) * 100);
}

function stopCpuMonitor() {
  running = false;
  clearTimeout(graceTimer);
  clearInterval(sampleTimer);
  graceTimer = undefined;
  sampleTimer = undefined;
}

function startCpuMonitor({ thresholdPercent, sampleIntervalMs, startupGraceMs, onThreshold }) {
  if (running) return;
  running = true;

  function beginSampling() {
    let previousCpu = process.cpuUsage();
    let previousTime = process.hrtime.bigint();
    sampleTimer = setInterval(() => {
      const currentCpu = process.cpuUsage();
      const currentTime = process.hrtime.bigint();
      const percent = calculateCpuPercent(previousCpu, currentCpu, currentTime - previousTime);
      previousCpu = currentCpu;
      previousTime = currentTime;
      if (percent >= thresholdPercent) {
        stopCpuMonitor();
        console.warn(`CPU threshold reached: ${percent.toFixed(1)}% >= ${thresholdPercent}%. Initiating restart.`);
        onThreshold(percent);
      }
    }, sampleIntervalMs);
    sampleTimer.unref();
  }

  if (startupGraceMs === 0) beginSampling();
  else {
    graceTimer = setTimeout(beginSampling, startupGraceMs);
    graceTimer.unref();
  }
}

module.exports = { calculateCpuPercent, startCpuMonitor, stopCpuMonitor };
