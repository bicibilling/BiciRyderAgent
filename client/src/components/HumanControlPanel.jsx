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
  const [transferActive, setTransferActive] = useState(false);
  const [transferSetAt, setTransferSetAt] = useState(null);

  useEffect(() => {
    loadConversationQueue();
    loadTransferStatus();
    const interval = setInterval(() => {
      loadConversationQueue();
      loadTransferStatus();
    }, 5000); // Refresh every 5 seconds
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

  const loadTransferStatus = async () => {
    try {
      const response = await axios.get('/api/human-control/transfer-number');
      setTransferActive(response.data.is_active);
      setTransferSetAt(response.data.set_at);
      if (response.data.phone_number && response.data.phone_number !== agentPhone) {
        setAgentPhone(response.data.phone_number);
      }
    } catch (error) {
      console.error('Failed to load transfer status:', error);
    }
  };

  const setTransferNumber = async () => {
    if (!agentPhone) {
      alert('Please enter your phone number first');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post('/api/human-control/transfer-number', {
        phone_number: agentPhone,
        agent_name: agentName || 'Human Agent'
      });

      setTransferActive(true);
      setTransferSetAt(response.data.set_at);
      alert('Transfer number activated! Customers can now be transferred to your phone.');
    } catch (error) {
      console.error('Failed to set transfer number:', error);
      alert(error.response?.data?.error || 'Failed to set transfer number');
    } finally {
      setIsLoading(false);
    }
  };

  const clearTransferNumber = async () => {
    setIsLoading(true);
    try {
      await axios.delete('/api/human-control/transfer-number');
      setTransferActive(false);
      setTransferSetAt(null);
      alert('Transfer number cleared. You are now offline.');
    } catch (error) {
      console.error('Failed to clear transfer number:', error);
      alert('Failed to clear transfer number');
    } finally {
      setIsLoading(false);
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
          {transferActive && (
            <span className="text-sm text-green-600 flex items-center">
              <CheckCircle className="h-4 w-4 mr-1" />
              Transfer Active
            </span>
          )}
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
              Your Phone Number
            </label>
            <input
              type="tel"
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value)}
              placeholder="+16045551234"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-neutral-500 mt-1">Use E.164 format (+1234567890)</p>
          </div>
        </div>

        {/* Transfer Control */}
        <div className="mt-4 flex items-center space-x-3">
          {!transferActive ? (
            <button
              onClick={setTransferNumber}
              disabled={isLoading || !agentPhone}
              className="btn-primary flex items-center space-x-2"
            >
              <Phone className="h-4 w-4" />
              <span>Go Online for Transfers</span>
            </button>
          ) : (
            <button
              onClick={clearTransferNumber}
              disabled={isLoading}
              className="btn-outline flex items-center space-x-2"
            >
              <Phone className="h-4 w-4" />
              <span>Go Offline</span>
            </button>
          )}
          {transferActive && transferSetAt && (
            <span className="text-sm text-neutral-600">
              Active since {new Date(transferSetAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className={`mt-4 rounded-lg p-4 ${transferActive ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
          <p className={`text-sm ${transferActive ? 'text-green-800' : 'text-blue-800'}`}>
            {transferActive ? (
              <><strong>🟢 You're Online:</strong> When customers say "human" or need help, Ryder will transfer them directly to {agentPhone}</>
            ) : (
              <><strong>Direct Call Transfer:</strong> Enter your phone number and go online. When customers request human help, they'll be transferred directly to your phone via ElevenLabs native transfer.</>
            )}
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
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Native Transfer System</h3>
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">1.</span>
            <p>Enter your phone number and click "Go Online for Transfers"</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">2.</span>
            <p>When customers call +1 (604) 670-0262, they speak with Ryder first</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">3.</span>
            <p><strong>Instant Transfer:</strong> When customer says "human", "agent", or needs help, Ryder immediately transfers the call to your phone</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">4.</span>
            <p>The customer stays on the same call - no need to call back or redial</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">5.</span>
            <p><strong>Powered by ElevenLabs:</strong> Uses native transfer_to_number tool for seamless handoffs</p>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-medium text-primary-600">6.</span>
            <p>Click "Go Offline" when you're unavailable - Ryder will take messages instead</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HumanControlPanel;