import React, { useState } from 'react';
import { MessageCircle, Clock, User, Phone, RefreshCw } from 'lucide-react';

const ConversationPanel = ({ conversations, customers, onRefresh }) => {
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-CA', {
      timeZone: 'America/Vancouver',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Use customers if available, fallback to individual conversations
  const displayData = customers && customers.length > 0 ? customers : conversations;
  const isGroupedView = customers && customers.length > 0;

  if (!displayData || displayData.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="text-xl font-semibold text-neutral-900 flex items-center">
            <MessageCircle className="h-5 w-5 mr-2" />
            Recent Conversations
          </h2>
          <button onClick={onRefresh} className="btn-outline text-sm py-1 px-3">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </button>
        </div>
        
        <div className="text-center py-12">
          <MessageCircle className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No conversations yet</h3>
          <p className="text-neutral-500 mb-4">
            When customers call Ryder at +1 (604) 670-0262, their conversations will appear here.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-green-800 text-sm">
              <strong>Ready to test:</strong><br />
              Call +1 (604) 670-0262 from any phone to start a conversation with Ryder. 
              The conversation will appear here in real-time.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Conversation List */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-xl font-semibold text-neutral-900 flex items-center">
            <MessageCircle className="h-5 w-5 mr-2" />
            {isGroupedView ? `Customers (${displayData.length})` : `Conversations (${displayData.length})`}
          </h2>
          <button onClick={onRefresh} className="btn-outline text-sm py-1 px-3">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </button>
        </div>

        <div className="space-y-3">
          {displayData.map((item) => {
            // Handle both customer and conversation data structures
            const isCustomer = isGroupedView;
            const displayPhone = isCustomer ? item.customer_phone : (item.caller_number || 'Unknown');
            const displaySummary = isCustomer ? item.latest_summary : item.summary;
            const displayDate = isCustomer ? item.last_call : (item.created_at || item.timestamp);
            const conversationCount = isCustomer ? item.conversation_count : 1;
            const totalDuration = isCustomer ? item.total_duration : item.duration_seconds;
            
            return (
              <div
                key={isCustomer ? item.customer_phone : (item.conversation_id || item.id)}
                className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                  selectedCustomer?.customer_phone === item.customer_phone ||
                  selectedCustomer?.conversation_id === item.conversation_id
                    ? 'border-primary-200 bg-primary-50'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
                onClick={() => setSelectedCustomer(item)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-neutral-100 rounded-full flex items-center justify-center">
                      <User className="h-4 w-4 text-neutral-600" />
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900">
                        {displayPhone}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {isCustomer ? `${conversationCount} conversations` : (item.conversation_id || `ID: ${item.id}`)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-neutral-500">
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4" />
                      <span>{formatDuration(totalDuration)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Phone className="h-4 w-4" />
                      <span>{formatDate(displayDate)}</span>
                    </div>
                  </div>
                </div>

                {displaySummary && (
                  <p className="mt-2 text-sm text-neutral-600 line-clamp-2">
                    {displaySummary}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer Details with Full Conversation History */}
      {selectedCustomer && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-neutral-900">
              {isGroupedView ? 'Customer History' : 'Conversation Details'}
            </h3>
            <span className="status-indicator status-online">
              {isGroupedView ? `${selectedCustomer.conversation_count} calls` : (selectedCustomer.status || 'Unknown')}
            </span>
          </div>

          {isGroupedView ? (
            // Customer view with all conversations
            <div className="space-y-6">
              {/* Customer Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Phone Number
                  </label>
                  <p className="text-sm text-neutral-900 font-medium">
                    {selectedCustomer.customer_phone}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Total Conversations
                  </label>
                  <p className="text-sm text-neutral-900">
                    {selectedCustomer.conversation_count} calls
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Total Talk Time
                  </label>
                  <p className="text-sm text-neutral-900">
                    {formatDuration(selectedCustomer.total_duration)}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Customer Since
                  </label>
                  <p className="text-sm text-neutral-900">
                    {formatDate(selectedCustomer.first_call)}
                  </p>
                </div>
              </div>

              {/* All Conversations for This Customer */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Conversation History ({selectedCustomer.conversation_count} calls)
                </label>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selectedCustomer.conversations.map((conv) => (
                    <div key={conv.conversation_id} className="bg-neutral-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-neutral-500 font-mono">{conv.conversation_id}</span>
                        <span className="text-xs text-neutral-500">{formatDate(conv.created_at)}</span>
                      </div>
                      
                      <div className="mb-2">
                        <span className="text-sm font-medium text-neutral-700">Summary: </span>
                        <span className="text-sm text-neutral-900">{conv.summary}</span>
                      </div>
                      
                      <div className="mb-3">
                        <span className="text-sm font-medium text-neutral-700">Duration: </span>
                        <span className="text-sm text-neutral-900">{formatDuration(conv.duration_seconds)}</span>
                      </div>

                      {conv.transcript && conv.transcript.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Transcript:
                          </label>
                          <div className="bg-white rounded border p-3 max-h-40 overflow-y-auto">
                            {conv.transcript.map((turn, idx) => (
                              <div key={idx} className="mb-2 last:mb-0">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className={`text-xs font-medium ${
                                    turn.speaker === 'Customer' ? 'text-blue-600' : 'text-green-600'
                                  }`}>
                                    {turn.speaker}:
                                  </span>
                                  <span className="text-xs text-neutral-400">{turn.time}s</span>
                                </div>
                                <p className="text-xs text-neutral-700 ml-2">
                                  {turn.message}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Individual conversation view (fallback)
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Caller Number
                  </label>
                  <p className="text-sm text-neutral-900">
                    {selectedCustomer.caller_number || 'Unknown'}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Duration
                  </label>
                  <p className="text-sm text-neutral-900">
                    {formatDuration(selectedCustomer.duration_seconds)}
                  </p>
                </div>
              </div>

              {selectedCustomer.transcript && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Transcript
                  </label>
                  <div className="bg-neutral-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                    {Array.isArray(selectedCustomer.transcript) ? (
                      selectedCustomer.transcript.map((turn, idx) => (
                        <div key={idx} className="mb-2">
                          <span className={`text-sm font-medium ${
                            turn.speaker === 'Customer' ? 'text-blue-600' : 'text-green-600'
                          }`}>
                            {turn.speaker}: 
                          </span>
                          <span className="text-sm text-neutral-700 ml-2">
                            {turn.message}
                          </span>
                        </div>
                      ))
                    ) : (
                      <pre className="text-sm text-neutral-700 whitespace-pre-wrap">
                        {selectedCustomer.transcript}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConversationPanel;