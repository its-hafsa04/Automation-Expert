class MockNotificationProvider {
  constructor() {
    console.log('[Notification] Initialized Mock Provider');
  }

  async send(payload) {
    console.log('\n=============================================');
    console.log('🚨 URGENT: HIGH PRIORITY LEAD 🚨');
    console.log('=============================================');
    console.log(`Name:    ${payload.name}`);
    console.log(`Email:   ${payload.email}`);
    console.log(`Company: ${payload.company}`);
    console.log(`Reason:  ${payload.reason}`);
    console.log('=============================================\n');
  }
}

module.exports = MockNotificationProvider;
