// In-memory conversation store (replace with database in production)
class ConversationStore {
  constructor() {
    this.conversations = new Map();
    this.humanSessions = new Map();
  }

  // Store conversation data
  storeConversation(conversationId, data) {
    const existing = this.conversations.get(conversationId) || {};
    this.conversations.set(conversationId, {
      ...existing,
      ...data,
      updated_at: new Date().toISOString()
    });
  }

  // Get conversation
  getConversation(conversationId) {
    return this.conversations.get(conversationId);
  }

  // Get all conversations
  getAllConversations() {
    return Array.from(this.conversations.values())
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  // Add transcript segment
  addTranscript(conversationId, speaker, text, timestamp) {
    const conversation = this.getConversation(conversationId) || {
      conversation_id: conversationId,
      transcript: [],
      created_at: new Date().toISOString()
    };

    conversation.transcript.push({
      speaker,
      text,
      timestamp: timestamp || new Date().toISOString()
    });

    this.storeConversation(conversationId, conversation);
  }

  // Generate conversation summary for human handoff
  generateHandoffSummary(conversationId) {
    const conversation = this.getConversation(conversationId);
    if (!conversation || !conversation.transcript) {
      return null;
    }

    const transcript = conversation.transcript;
    const customerMessages = transcript.filter(t => t.speaker === 'customer');
    const agentMessages = transcript.filter(t => t.speaker === 'agent');

    // Analyze tone (simple keyword detection)
    const allCustomerText = customerMessages.map(m => m.text.toLowerCase()).join(' ');
    let tone = 'neutral';
    
    if (allCustomerText.includes('angry') || allCustomerText.includes('frustrated') || 
        allCustomerText.includes('upset') || allCustomerText.includes('terrible')) {
      tone = 'angry';
    } else if (allCustomerText.includes('happy') || allCustomerText.includes('great') ||
               allCustomerText.includes('wonderful') || allCustomerText.includes('excellent')) {
      tone = 'happy';
    } else if (allCustomerText.includes('urgent') || allCustomerText.includes('emergency') ||
               allCustomerText.includes('asap') || allCustomerText.includes('immediately')) {
      tone = 'urgent';
    }

    // Extract key information
    const issue = this.extractIssue(allCustomerText);
    const customerInfo = this.extractCustomerInfo(conversation);

    return {
      conversation_id: conversationId,
      customer_phone: conversation.caller_phone || 'Unknown',
      customer_name: customerInfo.name || 'Customer',
      issue_summary: issue,
      tone: tone,
      duration_minutes: Math.floor((transcript.length * 30) / 60), // Rough estimate
      key_points: this.extractKeyPoints(customerMessages),
      suggested_actions: this.suggestActions(issue, tone),
      full_transcript: transcript,
      handoff_time: new Date().toISOString()
    };
  }

  extractIssue(text) {
    if (text.includes('bike') && text.includes('buy')) return 'Customer interested in purchasing a bike';
    if (text.includes('order') && text.includes('status')) return 'Customer inquiring about order status';
    if (text.includes('repair') || text.includes('service')) return 'Customer needs bike service/repair';
    if (text.includes('hours') || text.includes('open')) return 'Customer asking about store hours';
    if (text.includes('location') || text.includes('directions')) return 'Customer needs store location/directions';
    if (text.includes('human') || text.includes('person')) return 'Customer requested to speak with human';
    return 'General inquiry about Bici services';
  }

  extractCustomerInfo(conversation) {
    // Extract customer information from conversation
    return {
      name: conversation.customer_name || null,
      phone: conversation.caller_phone || null,
      previous_customer: !!conversation.returning_customer
    };
  }

  extractKeyPoints(customerMessages) {
    // Extract key discussion points
    const points = [];
    const text = customerMessages.map(m => m.text.toLowerCase()).join(' ');
    
    if (text.includes('electric') || text.includes('e-bike')) points.push('Interested in electric bikes');
    if (text.includes('mountain') || text.includes('mtb')) points.push('Interested in mountain bikes');
    if (text.includes('road') || text.includes('racing')) points.push('Interested in road bikes');
    if (text.includes('budget') || text.includes('price')) points.push('Discussed budget/pricing');
    if (text.includes('beginner') || text.includes('new to')) points.push('New to cycling');
    if (text.includes('experienced') || text.includes('advanced')) points.push('Experienced cyclist');
    
    return points.length > 0 ? points : ['General inquiry'];
  }

  suggestActions(issue, tone) {
    const actions = [];
    
    if (tone === 'angry') {
      actions.push('Apologize and prioritize resolution');
      actions.push('Escalate to manager if needed');
    }
    
    if (issue.includes('purchase')) {
      actions.push('Schedule bike fitting/consultation');
      actions.push('Provide product recommendations');
    }
    
    if (issue.includes('order status')) {
      actions.push('Look up order in system');
      actions.push('Provide tracking information');
    }
    
    if (issue.includes('service')) {
      actions.push('Schedule service appointment');
      actions.push('Explain service process');
    }
    
    return actions.length > 0 ? actions : ['Listen and provide appropriate assistance'];
  }

  // Human session management
  startHumanSession(conversationId, agentInfo) {
    const summary = this.generateHandoffSummary(conversationId);
    this.humanSessions.set(conversationId, {
      agent_info: agentInfo,
      summary: summary,
      started_at: new Date().toISOString(),
      status: 'active'
    });
    return summary;
  }

  endHumanSession(conversationId) {
    this.humanSessions.delete(conversationId);
  }

  getHumanSession(conversationId) {
    return this.humanSessions.get(conversationId);
  }
}

module.exports = new ConversationStore();