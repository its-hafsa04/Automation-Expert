class SlackNotificationProvider {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    console.log('[Notification] Initialized Slack Provider');
  }

  async send(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const message = {
      text: `🚨 *HIGH PRIORITY LEAD* 🚨\n\n*Name:* ${payload.name}\n*Email:* ${payload.email}\n*Company:* ${payload.company}\n*Reason:* ${payload.reason}`
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

module.exports = SlackNotificationProvider;
