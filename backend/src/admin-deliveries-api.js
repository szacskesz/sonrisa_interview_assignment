/** List the latest queued delivery results for administrators. */
export function configureAdminDeliveriesApi(app) {
  app.get('/api/admin/deliveries', { onRequest: app.requireAdmin }, async () => ({
    deliveries: app.services.queue.recent().map(({ id, title, publisher, status, attempt_count, last_error }) => ({
      id, title, publisher, status, attemptCount: attempt_count, lastError: last_error,
    })),
  }));
}
