class GoHighLevelAdapter {
  constructor(apiKey, locationId) {
    this.apiKey = apiKey;
    this.locationId = locationId;
    this.baseUrl = 'https://rest.gohighlevel.com/v1'; // Or v2 depending on token type

    // Pipeline stage configuration via env, fallback to defaults
    this.stageMapping = {
      'HIGH': process.env.GHL_STAGE_HIGH || 'high_priority_stage_id',
      'MEDIUM': process.env.GHL_STAGE_MEDIUM || 'medium_priority_stage_id',
      'LOW': process.env.GHL_STAGE_LOW || 'low_priority_stage_id'
    };
    
    console.log('[CRM] Initialized GoHighLevel Adapter');
  }

  async _fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      clearTimeout(id);
      
      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`GHL API Error: ${response.status} - ${errorText}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
        const timeoutError = new Error('GHL API Request timed out');
        timeoutError.code = 'ETIMEDOUT';
        throw timeoutError;
      }
      throw error;
    }
  }

  async createOrUpdateContact(lead) {
    try {
      // 1. Search for existing contact to prevent duplicates
      const searchUrl = `${this.baseUrl}/contacts/lookup?email=${encodeURIComponent(lead.email)}&locationId=${this.locationId}`;
      let contactId = null;
      
      try {
        const searchResult = await this._fetchWithTimeout(searchUrl);
        if (searchResult && searchResult.contacts && searchResult.contacts.length > 0) {
          contactId = searchResult.contacts[0].id;
        }
      } catch (searchError) {
        // If 404, it means contact not found, which is fine. Other errors we should throw.
        if (!searchError.message.includes('404')) {
          throw searchError;
        }
      }

      // 2. Create or Update
      const payload = {
        locationId: this.locationId,
        email: lead.email,
        name: lead.name,
        companyName: lead.company,
        customField: {
           message: lead.message
        }
      };

      let url = `${this.baseUrl}/contacts/`;
      let method = 'POST';

      if (contactId) {
        url = `${this.baseUrl}/contacts/${contactId}`;
        method = 'PUT';
      }

      const response = await this._fetchWithTimeout(url, {
        method,
        body: JSON.stringify(payload)
      });

      return response.contact.id;
    } catch (error) {
      console.error('[CRM GHL Adapter] createOrUpdateContact failed:', error.message);
      throw error;
    }
  }

  async updatePipelineStage(contactId, priority) {
    try {
      const stageId = this.stageMapping[priority] || this.stageMapping['LOW'];
      if (!stageId) {
        console.warn('[CRM GHL Adapter] No stage ID configured for priority:', priority);
        return null;
      }

      // In GHL, updating a pipeline stage typically involves creating/updating an Opportunity
      const payload = {
        locationId: this.locationId,
        contactId: contactId,
        pipelineId: process.env.GHL_PIPELINE_ID || 'default_pipeline_id',
        stageId: stageId
      };

      const response = await this._fetchWithTimeout(`${this.baseUrl}/opportunities/`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      return stageId;
    } catch (error) {
      console.error(`[CRM GHL Adapter] updatePipelineStage failed for contact ${contactId}:`, error.message);
      throw error;
    }
  }
}

module.exports = GoHighLevelAdapter;
