# USGS earthquake alerts

## Scope and admin workflow

Add one built-in **USGS Earthquakes** source for worldwide magnitude 4.5 and above. Rename the admin **RSS feeds** page to **Sources**. The **Add source** dialog has an **RSS** or **USGS Earthquakes** picker. RSS keeps its URL, publisher, topic, polling interval, and enabled settings. For USGS, the server supplies the endpoint, publisher, and **Earthquakes** topic. The admin can set its polling interval, which defaults to 60 seconds, and enable or disable it. Source type is fixed after creation. The existing poll health and delivery views show the new source's results.

Users subscribe to **Earthquakes** through the existing topic picker. An eligible email includes magnitude, location, occurrence time in UTC, and the USGS event link.

## API and polling

- Use the [USGS M4.5+ past-day GeoJSON feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson) for routine polls. It updates every minute. Use the [Earthquake Catalog API](https://earthquake.usgs.gov/fdsnws/event/1/) in bounded time windows when recovering a gap beyond the live feed's 24-hour coverage.
- Normalize the USGS event ID, associated IDs, magnitude, location, occurrence time, update time, and public event link. Use the occurrence time for the subscriber activation cutoff. [USGS GeoJSON fields](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)
- The first successful poll after creation or intentional re-enable establishes the baseline. A server outage preserves the previous baseline. Resume from slightly before the last successful scan boundary and use the existing delivery job key to tolerate replay. Associated USGS IDs can identify a previously queued event if its preferred ID changes.
- Send one alert per eligible recipient and earthquake. A revision that first brings an eligible event to magnitude 4.5 can produce its first alert. A subsequent revision retains the event identity. The USGS link provides the current event details.

## Storage and compatibility

Reuse the existing `feeds` table, including `source_kind` for adapter selection and `initialized_at_ms` for the USGS baseline. Reuse `last_poll_success_at_ms` as the USGS scan checkpoint. Record the frozen scan boundary after all fetched batches have been committed, including when the scan yields no events. If a batch fails, retry the range from the previous successful scan. The existing delivery jobs deduplicate replay. There is no SQLite migration or article archive for this integration.

The existing admin API accepts a source kind when creating a source and returns it when listing sources. Existing RSS clients can omit the kind. The USGS settings use the built-in values, and the edit endpoint accepts its interval and enabled status. Topic eligibility and SMTP retries use the existing workflow.

## Implementation and verification order

1. Add the USGS adapter and verify live-feed parsing, time bounds, historical windows, and malformed responses.
2. Connect the adapter to source configuration, polling, deduplication, and email. Test baselines, activation, recovery, revisions, and preservation of RSS behavior.
3. Add the Angular source picker and USGS settings. Test the form and the existing admin outcomes.
4. Run the controlled browser-to-Mailpit scenario and a separate live USGS check. Rerun the full suites and capture human review screenshots.
