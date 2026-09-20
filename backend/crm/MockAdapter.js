class MockAdapter {
  constructor() {
    console.log('[CRM] Initialized Mock Adapter');
    // Store in-memory for duplicate checks
    this.contacts = new Map();
  }

  async createOrUpdateContact(lead) {
    console.log(`[CRM Mock] createOrUpdateContact called for ${lead.email}`);
    let contactId;
    
    // Check for duplicate
    for (const [id, data] of this.contacts.entries()) {
      if (data.email === lead.email) {
        contactId = id;
        console.log(`[CRM Mock] Found existing contact: ${contactId}`);
        break;
      }
    }

    if (!contactId) {
      contactId = `mock_contact_${Date.now()}`;
      console.log(`[CRM Mock] Created new contact: ${contactId}`);
    }

    // Upsert
    this.contacts.set(contactId, {
      email: lead.email,
      name: lead.name,
      company: lead.company,
      updatedAt: new Date()
    });

    return contactId;
  }

  async updatePipelineStage(contactId, priority) {
    const stageMapping = {
      'HIGH': 'PRIORITY_STAGE',
      'MEDIUM': 'QUALIFIED_STAGE',
      'LOW': 'STANDARD_STAGE'
    };
    const stageId = stageMapping[priority] || 'STANDARD_STAGE';
    console.log(`[CRM Mock] Updated contact ${contactId} to pipeline stage: ${stageId}`);
    return stageId;
  }
}

module.exports = MockAdapter;
