// Customer Memory & Context System for Lightning-Fast Agent Context
const moment = require('moment-timezone');

class CustomerMemoryService {
  constructor() {
    // In production, this would be a database (Supabase/PostgreSQL)
    // For now, using in-memory storage for demo
    this.customerProfiles = new Map();
    this.conversationHistory = new Map();
  }

  // Store conversation summary after call ends (post-call webhook)
  storeConversationSummary(callerPhone, conversationData) {
    const customerId = this.normalizePhoneNumber(callerPhone);
    
    // Update customer profile
    const profile = this.customerProfiles.get(customerId) || {
      phone: callerPhone,
      first_seen: new Date().toISOString(),
      conversation_count: 0,
      preferences: {},
      purchase_history: [],
      sentiment_history: [],
      last_interaction: null
    };

    profile.conversation_count += 1;
    profile.last_interaction = new Date().toISOString();
    
    // Extract customer insights from conversation
    const insights = this.extractInsights(conversationData);
    
    // Update preferences based on conversation
    if (insights.bike_interest) {
      profile.preferences.bike_type = insights.bike_interest;
    }
    if (insights.budget) {
      profile.preferences.budget_range = insights.budget;
    }
    if (insights.experience_level) {
      profile.preferences.experience = insights.experience_level;
    }
    if (insights.communication_style) {
      profile.preferences.communication_style = insights.communication_style;
    }

    // Track sentiment over time
    profile.sentiment_history.push({
      sentiment: insights.sentiment,
      date: new Date().toISOString(),
      conversation_id: conversationData.conversation_id
    });

    // Store conversation summary
    this.conversationHistory.set(conversationData.conversation_id, {
      customer_id: customerId,
      conversation_id: conversationData.conversation_id,
      date: new Date().toISOString(),
      duration_seconds: conversationData.duration_seconds,
      summary: conversationData.summary,
      outcome: conversationData.outcome,
      next_actions: insights.suggested_actions || [],
      transcript_summary: conversationData.transcript_summary
    });

    this.customerProfiles.set(customerId, profile);
    
    console.log('📝 Customer profile updated:', customerId, profile.conversation_count, 'conversations');
    return profile;
  }

  // Get customer context for new conversation (conversation initiation webhook)
  getCustomerContext(callerPhone) {
    const customerId = this.normalizePhoneNumber(callerPhone);
    const profile = this.customerProfiles.get(customerId);
    
    if (!profile) {
      // First-time caller
      return {
        customer_tier: 'new',
        customer_name: 'New Customer',
        conversation_count: 0,
        previous_context: 'First time calling Bici',
        preferred_communication: 'friendly and informative',
        bike_interest: 'unknown',
        last_conversation: 'none'
      };
    }

    // Returning customer - build rich context
    const recentConversations = Array.from(this.conversationHistory.values())
      .filter(conv => conv.customer_id === customerId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3); // Last 3 conversations

    const lastConversation = recentConversations[0];
    const daysSinceLastCall = lastConversation ? 
      moment().diff(moment(lastConversation.date), 'days') : 0;

    // Determine customer tier
    let tier = 'returning';
    if (profile.conversation_count >= 5) tier = 'frequent';
    if (profile.purchase_history?.length > 0) tier = 'customer';
    if (profile.conversation_count >= 10) tier = 'vip';

    // Build context summary
    let contextSummary = `Returning customer (${profile.conversation_count} previous calls)`;
    if (lastConversation) {
      contextSummary += `. Last call ${daysSinceLastCall} days ago about: ${lastConversation.summary}`;
    }

    // Determine communication preference
    const avgSentiment = this.getAverageSentiment(profile.sentiment_history);
    let communicationStyle = 'professional and helpful';
    if (avgSentiment > 0.7) communicationStyle = 'enthusiastic and positive';
    if (avgSentiment < 0.3) communicationStyle = 'careful and empathetic';

    return {
      customer_tier: tier,
      customer_name: profile.name || 'Valued Customer',
      conversation_count: profile.conversation_count,
      previous_context: contextSummary,
      preferred_communication: communicationStyle,
      bike_interest: profile.preferences.bike_type || 'exploring options',
      budget_range: profile.preferences.budget_range || 'not specified',
      experience_level: profile.preferences.experience || 'unknown',
      last_conversation: lastConversation?.summary || 'none',
      days_since_last_call: daysSinceLastCall,
      customer_sentiment: avgSentiment > 0.6 ? 'positive' : avgSentiment < 0.4 ? 'needs_attention' : 'neutral',
      suggested_approach: this.suggestApproach(profile, recentConversations)
    };
  }

  // Extract insights from conversation transcript/summary
  extractInsights(conversationData) {
    const transcript = conversationData.transcript || '';
    const summary = conversationData.summary || '';
    const fullText = (transcript + ' ' + summary).toLowerCase();

    const insights = {
      sentiment: 0.5, // Default neutral
      bike_interest: null,
      budget: null,
      experience_level: null,
      communication_style: 'standard',
      suggested_actions: []
    };

    // Bike interest detection
    if (fullText.includes('mountain') || fullText.includes('mtb')) {
      insights.bike_interest = 'mountain';
    } else if (fullText.includes('road') || fullText.includes('racing')) {
      insights.bike_interest = 'road';
    } else if (fullText.includes('electric') || fullText.includes('e-bike')) {
      insights.bike_interest = 'electric';
    } else if (fullText.includes('gravel')) {
      insights.bike_interest = 'gravel';
    }

    // Budget detection
    const budgetMatch = fullText.match(/\$?\d{1,2},?\d{3}/);
    if (budgetMatch) {
      insights.budget = budgetMatch[0];
    } else if (fullText.includes('budget')) {
      insights.budget = 'budget-conscious';
    }

    // Experience level
    if (fullText.includes('beginner') || fullText.includes('new to')) {
      insights.experience_level = 'beginner';
    } else if (fullText.includes('experienced') || fullText.includes('advanced')) {
      insights.experience_level = 'experienced';
    }

    // Sentiment analysis (simple keyword-based)
    let sentimentScore = 0.5;
    if (fullText.includes('great') || fullText.includes('excellent') || fullText.includes('amazing')) {
      sentimentScore += 0.3;
    }
    if (fullText.includes('frustrated') || fullText.includes('angry') || fullText.includes('terrible')) {
      sentimentScore -= 0.3;
    }
    if (fullText.includes('thank') || fullText.includes('helpful')) {
      sentimentScore += 0.2;
    }
    
    insights.sentiment = Math.max(0, Math.min(1, sentimentScore));

    // Communication style
    if (fullText.includes('technical') || fullText.includes('specs')) {
      insights.communication_style = 'technical';
    } else if (fullText.includes('simple') || fullText.includes('basic')) {
      insights.communication_style = 'simple';
    }

    return insights;
  }

  // Get average sentiment from history
  getAverageSentiment(sentimentHistory) {
    if (!sentimentHistory || sentimentHistory.length === 0) return 0.5;
    
    const recentSentiments = sentimentHistory.slice(-5); // Last 5 interactions
    const avg = recentSentiments.reduce((sum, s) => sum + s.sentiment, 0) / recentSentiments.length;
    return avg;
  }

  // Suggest approach based on customer profile
  suggestApproach(profile, recentConversations) {
    const suggestions = [];
    
    if (profile.conversation_count === 1) {
      suggestions.push('Second-time caller - acknowledge previous conversation');
    }
    
    if (profile.conversation_count >= 3) {
      suggestions.push('Frequent caller - provide personalized service');
    }
    
    if (profile.preferences.bike_type) {
      suggestions.push(`Customer interested in ${profile.preferences.bike_type} bikes`);
    }
    
    const lastConv = recentConversations[0];
    if (lastConv && lastConv.next_actions?.length > 0) {
      suggestions.push(`Follow up on: ${lastConv.next_actions.join(', ')}`);
    }

    return suggestions.join('. ');
  }

  // Normalize phone number for consistent lookup
  normalizePhoneNumber(phone) {
    if (!phone) return 'unknown';
    
    // Remove all non-digits and normalize to E.164 format
    const digits = phone.replace(/\D/g, '');
    
    // Add +1 for North American numbers
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    return phone; // Return as-is if can't normalize
  }

  // Get customer profile for admin/dashboard
  getCustomerProfile(customerId) {
    return this.customerProfiles.get(customerId);
  }

  // Get all customer profiles (for dashboard analytics)
  getAllCustomers() {
    return Array.from(this.customerProfiles.entries()).map(([id, profile]) => ({
      customer_id: id,
      ...profile
    }));
  }

  // Clear old data (privacy compliance)
  cleanupOldData(daysToKeep = 90) {
    const cutoffDate = moment().subtract(daysToKeep, 'days');
    
    for (const [customerId, profile] of this.customerProfiles.entries()) {
      if (moment(profile.last_interaction).isBefore(cutoffDate)) {
        this.customerProfiles.delete(customerId);
        console.log('🗑️ Cleaned up old customer data:', customerId);
      }
    }
  }
}

module.exports = new CustomerMemoryService();