import { ConversationInsights } from '../types';
import { logger } from './logger';

export class ConversationAnalyzer {
  // Keywords for classification
  private static classificationKeywords = {
    sales: [
      'buy', 'purchase', 'price', 'cost', 'how much', 'looking for',
      'interested in', 'shopping', 'new bike', 'models', 'options',
      'budget', 'financing', 'payment', 'discount', 'deal', 'sale',
      'test ride', 'demo', 'try', 'comparison', 'versus', 'which bike'
    ],
    service: [
      'repair', 'fix', 'broken', 'service', 'tune-up', 'maintenance',
      'problem', 'issue', 'not working', 'strange noise', 'adjustment',
      'brake', 'gear', 'chain', 'tire', 'wheel', 'pedal', 'handlebar',
      'appointment', 'book', 'schedule', 'when can', 'how long'
    ],
    support: [
      'help', 'support', 'warranty', 'return', 'exchange', 'refund',
      'complaint', 'unhappy', 'disappointed', 'frustrated', 'wrong',
      'mistake', 'error', 'not what', 'expected', 'supposed to',
      'manager', 'supervisor', 'speak to', 'escalate'
    ],
    general: [
      'hours', 'open', 'closed', 'location', 'where', 'directions',
      'contact', 'phone', 'email', 'website', 'parking', 'near',
      'how to get', 'address', 'find you'
    ]
  };

  // Trigger detection patterns
  private static triggerPatterns = {
    asked_hours: ['what time', 'when open', 'hours', 'open now', 'closed', 'business hours'],
    asked_directions: ['where', 'location', 'address', 'how to get', 'directions', 'find you', 'located'],
    asked_price: ['how much', 'cost', 'price', 'expensive', 'cheap', 'budget', 'afford'],
    appointment_request: ['appointment', 'schedule', 'book', 'come in', 'visit', 'available'],
    test_ride_interest: ['test ride', 'try', 'demo', 'test drive', 'ride it'],
    comparison_shopping: ['versus', 'vs', 'compare', 'difference', 'better', 'which one'],
    urgent_need: ['today', 'right now', 'immediately', 'asap', 'urgent', 'emergency'],
    technical_question: ['how does', 'what is', 'explain', 'tell me about', 'works', 'specifications'],
    budget_mentioned: ['budget', 'afford', 'payment', 'financing', 'monthly', 'price range'],
    weather_related: ['rain', 'weather', 'wet', 'sunny', 'cold', 'hot', 'season'],
    when_open: ['when open', 'what time open', 'opening time'],
    where_located: ['where are you', 'where located', 'your address'],
    how_to_get: ['how to get there', 'directions to', 'navigate to']
  };

  static analyzeConversation(
    transcript: string, 
    elevenLabsAnalysis?: any
  ): ConversationInsights {
    const lowerTranscript = transcript.toLowerCase();
    
    // Initialize insights
    const insights: ConversationInsights = {
      classification: 'general',
      triggers: [],
      leadStatus: 'contacted',
      keyPoints: [],
      nextSteps: [],
      sentiment: 0.5,
      purchaseIntent: 0
    };

    // 1. Classify the conversation
    insights.classification = this.classifyConversation(lowerTranscript);
    
    // 2. Detect triggers
    insights.triggers = this.detectTriggers(lowerTranscript);
    
    // 3. Calculate purchase intent
    insights.purchaseIntent = this.calculatePurchaseIntent(lowerTranscript, insights.classification);
    
    // 4. Determine lead status
    insights.leadStatus = this.determineLeadStatus(insights);
    
    // 5. Extract key points from ElevenLabs analysis
    if (elevenLabsAnalysis) {
      insights.keyPoints = this.extractKeyPoints(elevenLabsAnalysis);
      insights.sentiment = elevenLabsAnalysis.sentiment || this.analyzeSentiment(lowerTranscript);
      
      // Use ElevenLabs data collection if available
      if (elevenLabsAnalysis.data_collection_results) {
        this.mergeDataCollectionResults(insights, elevenLabsAnalysis.data_collection_results);
      }
    } else {
      insights.sentiment = this.analyzeSentiment(lowerTranscript);
    }
    
    // 6. Generate next steps
    insights.nextSteps = this.generateNextSteps(insights);
    
    logger.info('Conversation analysis complete:', {
      classification: insights.classification,
      triggers: insights.triggers,
      purchaseIntent: insights.purchaseIntent,
      sentiment: insights.sentiment
    });
    
    return insights;
  }

  private static classifyConversation(transcript: string): 'sales' | 'support' | 'service' | 'general' {
    const scores: Record<string, number> = {
      sales: 0,
      service: 0,
      support: 0,
      general: 0
    };

    // Count keyword matches for each category
    for (const [category, keywords] of Object.entries(this.classificationKeywords)) {
      for (const keyword of keywords) {
        if (transcript.includes(keyword)) {
          scores[category]++;
        }
      }
    }

    // Find category with highest score
    let maxScore = 0;
    let classification: string = 'general';
    
    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        classification = category;
      }
    }

    // If scores are too close, check for strong indicators
    if (maxScore < 3) {
      if (transcript.includes('buy') || transcript.includes('purchase') || transcript.includes('new bike')) {
        return 'sales';
      }
      if (transcript.includes('repair') || transcript.includes('fix') || transcript.includes('broken')) {
        return 'service';
      }
      if (transcript.includes('complaint') || transcript.includes('problem with')) {
        return 'support';
      }
    }

    return classification as 'sales' | 'support' | 'service' | 'general';
  }

  private static detectTriggers(transcript: string): string[] {
    const triggers: string[] = [];
    
    for (const [trigger, patterns] of Object.entries(this.triggerPatterns)) {
      for (const pattern of patterns) {
        if (transcript.includes(pattern)) {
          triggers.push(trigger);
          break; // Only add each trigger once
        }
      }
    }
    
    return triggers;
  }

  private static calculatePurchaseIntent(transcript: string, classification: string): number {
    let intent = 0;
    
    // Base intent from classification
    if (classification === 'sales') {
      intent = 0.5;
    }
    
    // Increase for buying signals
    const buyingSignals = [
      'ready to buy', 'want to purchase', 'how much', 'price',
      'today', 'right now', 'in stock', 'available',
      'test ride', 'try it', 'see it'
    ];
    
    for (const signal of buyingSignals) {
      if (transcript.includes(signal)) {
        intent += 0.1;
      }
    }
    
    // Strong buying signals
    if (transcript.includes('buy today') || transcript.includes('purchase now')) {
      intent = Math.max(intent, 0.9);
    }
    
    // Cap at 1.0
    return Math.min(intent, 1.0);
  }

  private static determineLeadStatus(insights: ConversationInsights): string {
    if (insights.purchaseIntent > 0.8) {
      return 'hot';
    } else if (insights.purchaseIntent > 0.6) {
      return 'qualified';
    } else if (insights.classification === 'sales') {
      return 'qualified';
    } else {
      return 'contacted';
    }
  }

  private static analyzeSentiment(transcript: string): number {
    let sentiment = 0.5; // Neutral baseline
    
    // Positive indicators
    const positive = [
      'thank', 'great', 'awesome', 'perfect', 'excellent',
      'love', 'fantastic', 'wonderful', 'amazing', 'good',
      'happy', 'pleased', 'excited', 'interested'
    ];
    
    // Negative indicators
    const negative = [
      'angry', 'upset', 'frustrated', 'disappointed', 'unhappy',
      'terrible', 'awful', 'bad', 'worst', 'hate',
      'problem', 'issue', 'complaint', 'wrong'
    ];
    
    for (const word of positive) {
      if (transcript.includes(word)) {
        sentiment += 0.1;
      }
    }
    
    for (const word of negative) {
      if (transcript.includes(word)) {
        sentiment -= 0.1;
      }
    }
    
    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, sentiment));
  }

  private static extractKeyPoints(analysis: any): string[] {
    const keyPoints: string[] = [];
    
    if (analysis.key_points) {
      return analysis.key_points;
    }
    
    // Extract from summary if available
    if (analysis.call_summary_title) {
      keyPoints.push(analysis.call_summary_title);
    }
    
    if (analysis.transcript_summary) {
      // Take first sentence of summary
      const firstSentence = analysis.transcript_summary.split('.')[0];
      if (firstSentence && !keyPoints.includes(firstSentence)) {
        keyPoints.push(firstSentence);
      }
    }
    
    return keyPoints;
  }

  private static mergeDataCollectionResults(insights: ConversationInsights, dataCollection: any): void {
    // Customer name
    if (dataCollection.customer_name?.value) {
      insights.customerName = dataCollection.customer_name.value;
    }
    
    // Bike preferences
    if (dataCollection.bike_type?.value) {
      insights.bikePreferences = insights.bikePreferences || {};
      insights.bikePreferences.type = dataCollection.bike_type.value;
    }
    
    // Budget
    if (dataCollection.budget_range?.value && dataCollection.budget_range.value !== 'not_specified') {
      insights.budgetRange = dataCollection.budget_range.value;
      insights.triggers.push('budget_mentioned');
    }
    
    // Timeline
    if (dataCollection.purchase_timeline?.value) {
      insights.purchaseTimeline = dataCollection.purchase_timeline.value;
      
      // Adjust purchase intent based on timeline
      if (dataCollection.purchase_timeline.value === 'immediate') {
        insights.purchaseIntent = Math.max(insights.purchaseIntent, 0.9);
      } else if (dataCollection.purchase_timeline.value === 'this_week') {
        insights.purchaseIntent = Math.max(insights.purchaseIntent, 0.7);
      }
    }
    
    // Experience level
    if (dataCollection.riding_experience?.value) {
      insights.ridingExperience = dataCollection.riding_experience.value;
    }
  }

  private static generateNextSteps(insights: ConversationInsights): string[] {
    const nextSteps: string[] = [];
    
    // Based on classification
    switch (insights.classification) {
      case 'sales':
        if (insights.purchaseIntent > 0.7) {
          nextSteps.push('Schedule test ride');
          nextSteps.push('Send product information');
        } else {
          nextSteps.push('Send catalog');
          nextSteps.push('Follow up in 2-3 days');
        }
        break;
        
      case 'service':
        nextSteps.push('Book service appointment');
        nextSteps.push('Send service pricing');
        break;
        
      case 'support':
        if (insights.sentiment < 0.3) {
          nextSteps.push('Manager callback within 1 hour');
          nextSteps.push('Document issue for resolution');
        } else {
          nextSteps.push('Follow up email');
        }
        break;
        
      default:
        nextSteps.push('Send store information');
    }
    
    // Based on triggers
    if (insights.triggers.includes('appointment_request')) {
      nextSteps.push('Confirm appointment details');
    }
    
    if (insights.triggers.includes('asked_price')) {
      nextSteps.push('Send pricing sheet');
    }
    
    return nextSteps;
  }
}