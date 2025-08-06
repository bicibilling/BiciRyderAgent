// Conversation types for TelephonyInterface
export interface ConversationMessage {
  id: string
  content: string
  sentBy: 'user' | 'agent' | 'human_agent' | 'system'
  timestamp: string
  type: 'text' | 'voice' | 'system'
  phoneNumber?: string
  status?: 'sending' | 'sent' | 'delivered' | 'failed'
  duration?: number
  confidence?: number
}

export interface ConversationSummary {
  summary: string
  timestamp: string
  phoneNumber: string
  organizationId: string
}

export interface Lead {
  id: string
  customerName: string
  phoneNumber: string
  email?: string
  fundingReadiness?: 'Not Ready' | 'Pre-Qualified' | 'Ready'
  chaseStatus?: 'Auto Chase Running' | 'Manual Follow-up' | 'Closed'
  sentiment?: 'Positive' | 'Neutral' | 'Negative'
  organizationId: string
  createdAt?: string
  updatedAt?: string
}

export interface HumanControlSession {
  sessionId: string
  phoneNumber: string
  organizationId: string
  leadId?: string
  agentId: string
  agentName: string
  agentEmail: string
  startTime: string
  lastActivity: string
  status: 'active' | 'ended'
  messageCount: number
  customerResponsesPending: number
  handoffReason: string
  customMessage?: string
  metadata: {
    aiConversationPaused: boolean
    lastAIMessage?: string
    conversationContext?: string
  }
}

export interface CallSession {
  id: string
  organizationId: string
  leadId?: string
  elevenLabsConversationId?: string
  phoneNumber: string
  status: 'active' | 'completed' | 'failed'
  startedAt: string
  endedAt?: string
  duration?: number
  transcript?: string
  summary?: string
  callType: 'inbound' | 'outbound'
  initiatedBy?: string
}

export interface QueuedMessage {
  id: string
  content: string
  type: 'customer' | 'system'
  timestamp: string
  processed: boolean
  processedBy?: string
  processedAt?: string
}

export interface SSEConnectionStatus {
  connected: boolean
  connectionId?: string
  lastHeartbeat?: string
  reconnectAttempts: number
  error?: string
}

export interface ConversationAnalytics {
  totalMessages: number
  aiMessages: number
  humanMessages: number
  customerMessages: number
  averageResponseTime: number
  sentimentScore: number
  leadQualityScore: number
  keywordsMentioned: string[]
  intents: Array<{
    intent: string
    confidence: number
  }>
}

// SSE Event types
export type SSEEventType = 
  | 'connected'
  | 'heartbeat'
  | 'conversation_history'
  | 'sms_received'
  | 'sms_sent'
  | 'call_initiated'
  | 'call_ended'
  | 'human_control_started'
  | 'human_control_ended'
  | 'human_message_sent'
  | 'customer_message_received'
  | 'error'

export interface SSEEvent {
  type: SSEEventType
  leadId?: string
  phoneNumber?: string
  organizationId?: string
  connectionId?: string
  timestamp: string
  message?: ConversationMessage
  messages?: ConversationMessage[]
  summary?: ConversationSummary
  session?: HumanControlSession
  queuedMessage?: QueuedMessage
  error?: string
  [key: string]: any
}

// UI State types
export type MainTabType = 'conversation' | 'profile' | 'analytics' | 'settings'
export type ConversationMode = 'auto' | 'manual'
export type CurrentMode = 'idle' | 'voice' | 'sms'
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface TelephonyInterfaceProps {
  selectedLead: Lead | null
  organizationId: string
  onLeadUpdate?: (lead: Lead) => void
  onClose?: () => void
}