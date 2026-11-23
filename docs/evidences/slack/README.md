# Slack delivery review

The browser tests used a simulated Slack provider, a fake RSS feed, and real Mailpit email. They verified consent cancellation and retry, account linking, Email defaults, the required channel selection, combined delivery, Slack-only delivery, Slack throttling while Email stayed available, and the cutoff after reconnecting. The simulated Slack destination was `DDEMO`; the captured API request contained the same headline as the corresponding Mailpit email.

Backend verification covered the identity signature, nonce, workspace and token claims, account ownership, replay protection, migration, queue eligibility, and provider failure handling. The full verification run passed 62 backend tests, 21 Angular tests, and 14 Playwright tests, including the public Google News and USGS checks. The Angular production build passed.

Slack browser linking and a received DM in the installed workspace remain to be verified. Follow the [live smoke-test steps](../../slack-alerts.md#verify-your-workspace).

## Before connecting Slack

![Subscriptions showing the Connect Slack action](01-slack-disconnected.png)

## Adding a subscription for both channels

![Subscription editor with Email and Slack direct message selected](02-add-subscription-channels.png)

## Connected user with a saved subscription

![Connected Slack identity and both saved channels](03-connected-subscription.png)

## Admin delivery while Slack is rate limited

![Retried Slack delivery beside a sent email](04-delivery-retrying.png)

## Admin delivery after the Slack retry

![Sent results for Slack and Email](05-delivery-sent.png)

## Saved Slack preference after disconnecting

![Slack-only subscription marked as needing a connection](06-saved-slack-needs-connection.png)

## Editing a Slack-only subscription

![Subscription editor with Slack selected and Email cleared](07-edit-slack-only-subscription.png)
