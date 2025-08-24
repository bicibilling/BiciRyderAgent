import React, { useState, useEffect } from 'react';
import { Users, Phone, AlertTriangle, CheckCircle, Clock, User, Volume2, PhoneCall } from 'lucide-react';
import axios from 'axios';

const HumanControlPanel = () => {
  const [conversationQueue, setConversationQueue] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceSummaryScript, setVoiceSummaryScript] = useState('');

  useEffect(() => {
    loadConversationQueue();
    const interval = setInterval(loadConversationQueue, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadConversationQueue = async () => {
    try {
      const response = await axios.get('/api/human-control/queue');
      setConversationQueue(response.data.queue || []);
    } catch (error) {
      console.error('Failed to load conversation queue:', error);
    }
  };

  const generateVoiceSummary = async (conversationId) => {
    setIsLoading(true);
    try {
      const response = await axios.post(`/api/human-control/voice-summary/${conversationId}`, {
        agent_phone: agentPhone
      });
      
      setVoiceSummaryScript(response.data.voice_script);
      setSelectedConversation(conversationId);
      
      if (response.data.call_sid) {
        alert('Voice summary sent to your phone!');
      }
    } catch (error) {
      console.error('Failed to generate voice summary:', error);
      alert('Failed to generate voice summary');
    } finally {
      setIsLoading(false);
    }
  };

  const initiateHandoff = async (conversationId) => {
    if (!agentName) {
      alert('Please enter your name first');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(`/api/human-control/takeover/${conversationId}`, {
        agent_name: agentName,
        agent_phone: agentPhone
      });
      
      console.log('Handoff initiated:', response.data);
      await loadConversationQueue(); // Refresh queue
    } catch (error) {
      console.error('Failed to initiate handoff:', error);
      alert('Failed to initiate handoff');
    } finally {
      setIsLoading(false);
    }
  };

  const getToneColor = (tone) => {
    switch (tone) {
      case 'angry': return 'text-red-600 bg-red-50 border-red-200';
      case 'urgent': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'happy': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const formatDuration = (minutes) => {
    if (minutes < 1) return 'Just started';
    if (minutes === 1) return '1 minute';
    return `${minutes} minutes`;
  };

  return (
    <div className="space-y-6">
      {/* Human Agent Setup */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-xl font-semibold text-neutral-900 flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Human Agent Control
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Your Phone (for voice summaries)
            </label>
            <input
              type="tel"
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value)}
              placeholder="+1 (604) 555-1234"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">
            <strong>No Computer Required:</strong> When you take over a conversation, 
            we'll call your phone with a voice summary of the customer, their issue, and tone.
          </p>
        </div>
      </div>

      {/* Conversation Queue */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-neutral-900">
            Active Conversations ({conversationQueue.length})
          </h3>
          <button
            onClick={loadConversationQueue}
            className="btn-outline text-sm py-1 px-3"
            disabled={isLoading}
          >
            Refresh
          </button>
        </div>

        {conversationQueue.length === 0 ? (
          <div className="text-center py-8">
            <Phone className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500">No active conversations</p>
            <p className="text-sm text-neutral-400 mt-1">
              Conversations will appear here when customers call +1 (604) 670-0262
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversationQueue.map((conversation) => (
              <div
                key={conversation.conversation_id}
                className={`p-4 rounded-lg border ${
                  conversation.needs_attention 
                    ? 'border-red-200 bg-red-50' 
                    : 'border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 bg-neutral-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-neutral-600" />
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900">
                        {conversation.customer_phone}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {formatDuration(conversation.duration_minutes)} • {conversation.quick_summary}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getToneColor(conversation.tone)}`}>
                      {conversation.tone.toUpperCase()}
                    </span>
                    
                    {conversation.needs_attention && (
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => generateVoiceSummary(conversation.conversation_id)}
                    disabled={isLoading || !agentPhone}
                    className="btn-secondary text-sm py-1 px-3 flex items-center space-x-1"
                  >
                    <Volume2 className="h-4 w-4" />
                    <span>Get Voice Summary</span>
                  </button>

                  <button
                    onClick={() => initiateHandoff(conversation.conversation_id)}
                    disabled={isLoading || !agentName}
                    className="btn-primary text-sm py-1 px-3 flex items-center space-x-1"
                  >
                    <PhoneCall className="h-4 w-4" />
                    <span>Take Over Call</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voice Summary Preview */}
      {voiceSummaryScript && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-neutral-900">Voice Summary Script</h3>
            <span className="text-sm text-green-600 flex items-center">
              <CheckCircle className="h-4 w-4 mr-1" />
              Ready to send
            </span>
          </div>

          <div className="bg-neutral-50 rounded-lg p-4">
            <p className="text-sm text-neutral-700 mb-2">
              <strong>This summary will be read to you when you answer the phone:</strong>
            </p>
            <div className="bg-white rounded border p-3">
              <p className="text-sm text-neutral-800 leading-relaxed">
                {voiceSummaryScript}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center space-x-2">
            <button
              onClick={() => {
                if (agentPhone && selectedConversation) {
                  generateVoiceSummary(selectedConversation);
                }
              }}
              disabled={!agentPhone || isLoading}
              className="btn-primary text-sm py-2 px-4 flex items-center space-x-1"
            >
              <PhoneCall className="h-4 w-4" />
              <span>Call Me With This Summary</span>
            </button>
            
            <button
              onClick={() => setVoiceSummaryScript('')}
              className="btn-outline text-sm py-2 px-4"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">How Human Handoff Works</h3>
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">1.</span>
            <p>Customer calls +1 (604) 670-0262 and talks to Ryder</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">2.</span>
            <p>When customer says "human" or issue requires escalation, conversation appears in queue above</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">3.</span>
            <p><strong>No computer needed:</strong> Click "Get Voice Summary" and we'll call your phone with customer details</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">4.</span>
            <p>Click "Take Over Call" to transfer the customer to your phone line</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">5.</span>
            <p>Voice summary includes: customer name/phone, issue summary, tone (happy/angry/urgent), and suggested actions</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HumanControlPanel;