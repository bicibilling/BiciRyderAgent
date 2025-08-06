import React, { useState, useEffect, useRef } from 'react';
import { Lead, Conversation } from '../types';
import { conversationAPI, humanControlAPI, callAPI, smsAPI } from '../services/api';

interface ConversationPanelProps {
  lead: Lead;
  onUpdate: () => void;
}

const ConversationPanel: React.FC<ConversationPanelProps> = ({ lead, onUpdate }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isHumanControl, setIsHumanControl] = useState(false);
  const [activeTab, setActiveTab] = useState<'conversation' | 'profile' | 'analytics'>('conversation');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, [lead.id]);

  useEffect(() => {
    scrollToBottom();
  }, [conversations]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const data = await conversationAPI.getByLeadId(lead.id);
      setConversations(data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading conversations:', error);
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleJoinControl = async () => {
    try {
      await humanControlAPI.join(lead.id, 'Agent');
      setIsHumanControl(true);
      onUpdate();
    } catch (error) {
      console.error('Error joining control:', error);
    }
  };

  const handleLeaveControl = async () => {
    try {
      await humanControlAPI.leave(lead.id);
      setIsHumanControl(false);
      onUpdate();
    } catch (error) {
      console.error('Error leaving control:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    
    try {
      if (isHumanControl) {
        await humanControlAPI.sendMessage(lead.id, message, lead.phone_number);
      } else {
        await smsAPI.send(lead.phone_number, message);
      }
      setMessage('');
      loadConversations();
      onUpdate();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleStartCall = async () => {
    try {
      await callAPI.initiateOutbound(lead.phone_number, lead.id);
      onUpdate();
    } catch (error) {
      console.error('Error starting call:', error);
    }
  };

  const getMessageStyle = (sentBy: string) => {
    switch (sentBy) {
      case 'user':
        return 'bg-gray-100 ml-auto';
      case 'agent':
        return 'bg-bici-blue';
      case 'human_agent':
        return 'bg-green-100';
      case 'system':
        return 'bg-yellow-50 text-yellow-800 text-center text-sm italic';
      default:
        return 'bg-gray-50';
    }
  };

  return (
    <div className="bici-card flex flex-col h-[600px]">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold">{lead.customer_name || 'Unknown Customer'}</h2>
            <p className="text-sm text-bici-text">{lead.phone_number}</p>
            {lead.email && <p className="text-sm text-bici-muted">{lead.email}</p>}
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={handleStartCall}
              className="bici-button-primary flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call
            </button>
            {isHumanControl ? (
              <button onClick={handleLeaveControl} className="bici-button-secondary">
                AI Resume
              </button>
            ) : (
              <button onClick={handleJoinControl} className="bici-button-accent">
                Join Chat
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('conversation')}
          className={`pb-2 px-1 ${activeTab === 'conversation' 
            ? 'border-b-2 border-bici-black font-semibold' 
            : 'text-bici-text'}`}
        >
          Conversation
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-2 px-1 ${activeTab === 'profile' 
            ? 'border-b-2 border-bici-black font-semibold' 
            : 'text-bici-text'}`}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-2 px-1 ${activeTab === 'analytics' 
            ? 'border-b-2 border-bici-black font-semibold' 
            : 'text-bici-text'}`}
        >
          Analytics
        </button>
      </div>

      {/* Content */}
      {activeTab === 'conversation' && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto mb-4">
            {loading ? (
              <div className="text-center text-bici-text">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="text-center text-bici-text">No conversations yet</div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`p-3 rounded-lg max-w-[80%] ${getMessageStyle(conv.sent_by)}`}
                  >
                    <div className="text-xs text-gray-500 mb-1">
                      {conv.sent_by === 'user' ? 'Customer' : 
                       conv.sent_by === 'human_agent' ? 'Human Agent' :
                       conv.sent_by === 'agent' ? 'AI Agent' : 'System'}
                      {' • '}
                      {new Date(conv.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="text-sm">{conv.content}</div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex space-x-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={isHumanControl ? "Type your message..." : "Send SMS message..."}
              className="flex-1 bici-input"
            />
            <button onClick={handleSendMessage} className="bici-button-primary">
              Send
            </button>
          </div>
        </>
      )}

      {activeTab === 'profile' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-bici-text">Status</label>
            <p className="text-sm">{lead.status}</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-bici-text">Sentiment</label>
            <p className="text-sm">{lead.sentiment}</p>
          </div>
          {lead.bike_interest && (
            <div>
              <label className="text-sm font-semibold text-bici-text">Bike Interest</label>
              <p className="text-sm">Type: {lead.bike_interest.type || 'Not specified'}</p>
              {lead.bike_interest.budget && (
                <p className="text-sm">
                  Budget: ${lead.bike_interest.budget.min} - ${lead.bike_interest.budget.max}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="text-sm font-semibold text-bici-text">Qualification</label>
            <p className="text-sm">
              Ready to buy: {lead.qualification_data.ready_to_buy ? 'Yes' : 'No'}
            </p>
            <p className="text-sm">
              Purchase intent: {(lead.qualification_data.purchase_intent * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-bici-text">Created</label>
            <p className="text-sm">{new Date(lead.created_at).toLocaleString()}</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-bici-text">Last Updated</label>
            <p className="text-sm">{new Date(lead.updated_at).toLocaleString()}</p>
          </div>
          {lead.last_contact_at && (
            <div>
              <label className="text-sm font-semibold text-bici-text">Last Contact</label>
              <p className="text-sm">{new Date(lead.last_contact_at).toLocaleString()}</p>
            </div>
          )}
          <div>
            <label className="text-sm font-semibold text-bici-text">Total Conversations</label>
            <p className="text-sm">{conversations.length}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationPanel;