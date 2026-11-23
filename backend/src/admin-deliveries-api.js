/** List the latest queued delivery results for administrators. */
export function configureAdminDeliveriesApi(app) {
  app.get('/api/admin/deliveries', { onRequest: app.requireAdmin }, async () => ({
    deliveries: app.services.queue.recent().map(({ id, title, publisher, channel, status, attempt_count, last_error }) => ({
      id, title, publisher, channel, status, attemptCount: attempt_count, lastError: last_error,
    })),
  }));
}
