const SlackNotificationProvider = require('./SlackNotificationProvider');
const MockNotificationProvider = require('./MockNotificationProvider');

class NotificationService {
  constructor() {
    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhook) {
      this.provider = new SlackNotificationProvider(slackWebhook);
    } else {
      this.provider = new MockNotificationProvider();
    }
  }

  /**
   * Notifies sales team about a high priority lead
   * @param {Object} lead - The lead object
   * @param {String} reason - The AI provided reason for high priority
   */
  async notifyHighPriorityLead(lead, reason) {
    try {
      const payload = {
        name: lead.name,
        company: lead.company || 'Not provided',
        email: lead.email,
        reason: reason
      };

      await this.provider.send(payload);
    } catch (error) {
      error.service = 'notification';
      throw error;
    }
  }
}

module.exports = new NotificationService();
