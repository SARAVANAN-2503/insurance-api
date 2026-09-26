const { calculateCpuPercent, startCpuMonitor, stopCpuMonitor } = require('../src/monitoring/cpu-monitor');

describe('CPU percentage', () => {
  test('uses CPU deltas, including user and system time, rather than lifetime totals', () => {
    expect(calculateCpuPercent({ user: 9000000, system: 3000000 },
      { user: 9500000, system: 3200000 }, 1000000000n)).toBe(70);
  });

  test('uses actual elapsed time rather than the configured timer interval', () => {
    expect(calculateCpuPercent({ user: 0, system: 0 }, { user: 500000, system: 0 }, 2000000000n)).toBe(25);
  });

  test('can exceed 100% when multiple cores contribute', () => {
    expect(calculateCpuPercent({ user: 0, system: 0 }, { user: 2000000, system: 0 }, 1000000000n)).toBe(200);
  });

  test('handles a zero elapsed interval', () => {
    expect(calculateCpuPercent({ user: 0, system: 0 }, { user: 100, system: 0 }, 0n)).toBe(0);
  });
});

describe('CPU monitor lifecycle', () => {
  let cpu;
  let onThreshold;

  beforeEach(() => {
    jest.useFakeTimers();
    cpu = jest.spyOn(process, 'cpuUsage').mockReturnValue({ user: 0, system: 0 });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    onThreshold = jest.fn();
  });

  afterEach(() => {
    stopCpuMonitor();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function start(startupGraceMs = 0) {
    startCpuMonitor({ thresholdPercent: 70, sampleIntervalMs: 1000, startupGraceMs, onThreshold });
  }

  test('below threshold does not request shutdown or log normal samples', () => {
    start();
    cpu.mockReturnValue({ user: 690000, system: 0 });
    jest.advanceTimersByTime(1000);
    expect(onThreshold).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  test.each([70, 80])('%s percent triggers at a threshold of 70', (percent) => {
    start();
    cpu.mockReturnValue({ user: percent * 10000, system: 0 });
    jest.advanceTimersByTime(1000);
    expect(onThreshold).toHaveBeenCalledWith(percent);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('each reading uses the previous sample as its baseline', () => {
    start();
    cpu.mockReturnValue({ user: 600000, system: 0 });
    jest.advanceTimersByTime(1000);
    cpu.mockReturnValue({ user: 1200000, system: 0 });
    jest.advanceTimersByTime(1000);
    expect(onThreshold).not.toHaveBeenCalled();
  });

  test('startup grace excludes early CPU activity and starts a fresh sampling interval', () => {
    start(2000);
    cpu.mockReturnValue({ user: 2000000, system: 0 });
    jest.advanceTimersByTime(2000);
    expect(onThreshold).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(onThreshold).not.toHaveBeenCalled();
    cpu.mockReturnValue({ user: 2700000, system: 0 });
    jest.advanceTimersByTime(1000);
    expect(onThreshold).toHaveBeenCalledTimes(1);
  });

  test('invokes the shutdown callback only once', () => {
    start();
    cpu.mockReturnValue({ user: 800000, system: 0 });
    jest.advanceTimersByTime(10000);
    expect(onThreshold).toHaveBeenCalledTimes(1);
    expect(cpu).toHaveBeenCalledTimes(2);
  });

  test.each([0, 2000])('stopping clears sampling and grace timers (grace %s)', (grace) => {
    start(grace);
    stopCpuMonitor();
    cpu.mockReturnValue({ user: 10000000, system: 0 });
    jest.advanceTimersByTime(10000);
    expect(onThreshold).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('repeated starts do not create additional timers', () => {
    start();
    start();
    expect(jest.getTimerCount()).toBe(1);
  });
});
