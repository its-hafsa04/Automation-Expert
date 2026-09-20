# n8n lead qualification workflow

Import `lead-qualification.json` into n8n. The workflow is intentionally limited to orchestration:

1. Receive a lead at the n8n Webhook.
2. Submit the payload to `POST /api/leads/webhook`.
3. Poll `GET /api/leads/:leadId/qualification` until backend qualification completes.
4. Route on the backend-owned `priority` field.
5. Send a Slack notification only for `HIGH` priority.
6. Return a JSON success response, or route integration failures to the error response.

## Required configuration

Configure these values in n8n without putting secrets in the exported JSON:

- `BACKEND_BASE_URL`: Base URL for the backend, for example `https://api.example.com`.
- `N8N_HIGH_PRIORITY_SLACK_CHANNEL`: Slack channel ID or channel name permitted by the Slack credential.
- n8n Slack API credential named `Slack Lead Notifications`, with permission to post messages.

The Slack node contains the placeholder credential ID `__N8N_CREDENTIAL_ID__`; replace it by selecting the credential after import. Do not commit the resulting credential data.

The backend itself still needs its normal runtime configuration, including `DATABASE_URL`, and optionally `GEMINI_API_KEY`, `GHL_API_KEY`, `GHL_LOCATION_ID`, and `SLACK_WEBHOOK_URL` when those backend integrations are enabled. Those values belong in the backend deployment environment, not in the workflow export.

## Webhook payload

```json
{
  "name": "Jane High",
  "email": "jane@example.com",
  "company": "Acme",
  "message": "Interested in an enterprise plan",
  "idempotencyKey": "optional-stable-key"
}
```

The workflow uses the incoming `idempotencyKey`, or n8n's execution ID when one is not supplied. The backend remains the source of truth for qualification, spam handling, CRM synchronization, and retry-safe processing.

## Import and activate

1. Import the JSON file into n8n.
2. Set the `BACKEND_BASE_URL` and `N8N_HIGH_PRIORITY_SLACK_CHANNEL` environment variables in the n8n runtime.
3. Select the Slack credential in `Notify HIGH in Slack`.
4. Confirm the Webhook node's production URL is reachable by the lead source.
5. Test with a valid lead and with an invalid payload to verify both success and error responses.
