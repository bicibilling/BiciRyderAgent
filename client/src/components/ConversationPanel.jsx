import React, { useState } from 'react';
import { MessageCircle, Clock, User, Phone, RefreshCw } from 'lucide-react';

const ConversationPanel = ({ conversations, onRefresh }) => {
  const [selectedConversation, setSelectedConversation] = useState(null);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-CA', {
      timeZone: 'America/Vancouver',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getConversationDuration = (conversation) => {
    if (conversation.duration_seconds) {
      const minutes = Math.floor(conversation.duration_seconds / 60);
      const seconds = conversation.duration_seconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return 'Ongoing';
  };

  if (!conversations || conversations.length === 0) {
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
            Recent Conversations ({conversations.length})
          </h2>
          <button onClick={onRefresh} className="btn-outline text-sm py-1 px-3">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </button>
        </div>

        <div className="space-y-3">
          {conversations.map((conversation) => (
            <div
              key={conversation.conversation_id || conversation.id}
              className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                selectedConversation?.id === conversation.id
                  ? 'border-primary-200 bg-primary-50'
                  : 'border-neutral-200 hover:border-neutral-300'
              }`}
              onClick={() => setSelectedConversation(conversation)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 bg-neutral-100 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-neutral-600" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">
                      {conversation.caller_number || 'Unknown Caller'}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {conversation.conversation_id || `ID: ${conversation.id}`}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4 text-sm text-neutral-500">
                  <div className="flex items-center space-x-1">
                    <Clock className="h-4 w-4" />
                    <span>{getConversationDuration(conversation)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Phone className="h-4 w-4" />
                    <span>{formatDate(conversation.created_at || conversation.timestamp)}</span>
                  </div>
                </div>
              </div>

              {conversation.summary && (
                <p className="mt-2 text-sm text-neutral-600 line-clamp-2">
                  {conversation.summary}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Conversation Details */}
      {selectedConversation && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-neutral-900">
              Conversation Details
            </h3>
            <span className={`status-indicator ${
              selectedConversation.status === 'completed' ? 'status-online' :
              selectedConversation.status === 'ongoing' ? 'status-warning' :
              'status-offline'
            }`}>
              {selectedConversation.status || 'Unknown'}
            </span>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Caller Number
                </label>
                <p className="text-sm text-neutral-900">
                  {selectedConversation.caller_number || 'Unknown'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Duration
                </label>
                <p className="text-sm text-neutral-900">
                  {getConversationDuration(selectedConversation)}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Start Time
                </label>
                <p className="text-sm text-neutral-900">
                  {formatDate(selectedConversation.created_at || selectedConversation.timestamp)}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Conversation ID
                </label>
                <p className="text-sm text-neutral-900 font-mono">
                  {selectedConversation.conversation_id || selectedConversation.id}
                </p>
              </div>
            </div>

            {selectedConversation.transcript && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Transcript
                </label>
                <div className="bg-neutral-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <pre className="text-sm text-neutral-700 whitespace-pre-wrap">
                    {selectedConversation.transcript}
                  </pre>
                </div>
              </div>
            )}

            {selectedConversation.summary && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Summary
                </label>
                <p className="text-sm text-neutral-700 bg-neutral-50 rounded-lg p-4">
                  {selectedConversation.summary}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationPanel;