/** Run an async maintenance task at most once at a time and wait for it on shutdown. */
export function startPeriodicTask(run, { intervalMs = 1_000, onError }) {
  const controller = new AbortController();
  let active;
  function tick() {
    active ??= Promise.resolve().then(() => run(controller.signal)).catch(onError).finally(() => {
      active = undefined;
    });
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    controller.abort();
    await active;
  };
}
