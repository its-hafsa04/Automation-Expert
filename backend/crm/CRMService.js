const GoHighLevelAdapter = require('./GoHighLevelAdapter');
const MockAdapter = require('./MockAdapter');

function isRealGhlCredential(value) {
  if (!value || !String(value).trim()) return false;
  const normalized = String(value).trim().toLowerCase();
  if (normalized.startsWith('your_')) return false;
  return true;
}

class CRMService {
  constructor() {
    this.adapter = this._initializeAdapter();
  }

  _initializeAdapter() {
    const provider = (process.env.CRM_PROVIDER || '').trim().toLowerCase();

    if (provider === 'mock') {
      return new MockAdapter();
    }

    const apiKey = process.env.GHL_API_KEY;
    const locationId = process.env.GHL_LOCATION_ID;
    const hasGhlCredentials =
      isRealGhlCredential(apiKey) && isRealGhlCredential(locationId);

    if (provider === 'gohighlevel' || provider === 'ghl') {
      if (!hasGhlCredentials) {
        console.warn(
          '[CRM] CRM_PROVIDER is GoHighLevel but credentials are missing or placeholders. Using MockAdapter.'
        );
        return new MockAdapter();
      }
      return new GoHighLevelAdapter(apiKey, locationId);
    }

    if (hasGhlCredentials) {
      return new GoHighLevelAdapter(apiKey, locationId);
    }

    console.warn('[CRM] GoHighLevel credentials not configured. Using MockAdapter.');
    return new MockAdapter();
  }

  async createOrUpdateContact(lead) {
    if (!lead || !lead.email) {
      throw new Error('Lead must have an email address to sync to CRM');
    }
    return await this.adapter.createOrUpdateContact(lead);
  }

  async updatePipelineStage(contactId, priority) {
    if (!contactId) {
      throw new Error('Contact ID is required to update pipeline stage');
    }
    return await this.adapter.updatePipelineStage(contactId, priority);
  }
}

// Export a singleton instance
module.exports = new CRMService();
