/** Expose topics currently offered by enabled feeds. */
export function configureTopicsApi(app) {
  app.get('/api/topics', { preHandler: app.requireAccount }, async () => ({
    topics: app.services.feeds.topics(),
  }));
}
