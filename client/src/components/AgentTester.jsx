import React, { useState } from 'react';
import { Send, Bot, User, Clock, CheckCircle, AlertTriangle, Phone, ExternalLink, TestTube } from 'lucide-react';
import WidgetTester from './WidgetTester';

const AgentTester = ({ agentStatus, onTest }) => {
  const [message, setMessage] = useState('');
  const [testHistory, setTestHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testingMode, setTestingMode] = useState('widget'); // 'widget' or 'simulated'

  const quickTestMessages = [
    "What are your store hours?",
    "Where are you located?",
    "I want to speak to a human",
    "I'm interested in electric bikes",
    "Can you help me choose a bike?",
    "I have a question about my order",
    "What time do you close today?",
    "Bonjour, quelles sont vos heures d'ouverture?",
  ];

  const handleTest = async (testMessage = message) => {
    if (!testMessage.trim()) return;

    setIsLoading(true);
    const testId = Date.now();
    const startTime = new Date();

    try {
      const response = await onTest(testMessage);
      const endTime = new Date();
      const responseTime = endTime - startTime;

      const testResult = {
        id: testId,
        user_message: testMessage,
        agent_response: response.data.test_result.agent_response,
        timestamp: startTime.toISOString(),
        response_time: responseTime,
        status: 'success',
      };

      setTestHistory(prev => [testResult, ...prev].slice(0, 10)); // Keep last 10 tests
      setMessage(''); // Clear input if it was typed
    } catch (error) {
      const testResult = {
        id: testId,
        user_message: testMessage,
        agent_response: error.response?.data?.message || 'Test failed',
        timestamp: startTime.toISOString(),
        response_time: 0,
        status: 'error',
      };

      setTestHistory(prev => [testResult, ...prev].slice(0, 10));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTest();
    }
  };

  const formatResponseTime = (ms) => {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Agent Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Bot className="h-6 w-6 text-primary-600" />
            <div>
              <h2 className="text-xl font-semibold text-neutral-900">Agent Testing</h2>
              <p className="text-sm text-neutral-600">Test Ryder with widget, phone, or simulated responses</p>
            </div>
          </div>
          
          <span className={`status-indicator ${
            agentStatus?.agent?.status === 'active' ? 'status-online' : 'status-offline'
          }`}>
            {agentStatus?.agent?.status?.toUpperCase() || 'OFFLINE'}
          </span>
        </div>

        {/* Testing Mode Selector */}
        <div className="flex space-x-2 mb-4">
          <button
            onClick={() => setTestingMode('widget')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-colors ${
              testingMode === 'widget'
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
            }`}
          >
            <ExternalLink className="h-4 w-4" />
            <span>ElevenLabs Widget</span>
          </button>
          <button
            onClick={() => setTestingMode('simulated')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-colors ${
              testingMode === 'simulated'
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
            }`}
          >
            <TestTube className="h-4 w-4" />
            <span>Simulated Testing</span>
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center mb-2">
            <Phone className="h-5 w-5 text-blue-600 mr-2" />
            <p className="text-blue-800 font-medium">Primary Testing Method: Voice Calls</p>
          </div>
          <p className="text-blue-700 text-sm">
            Call <strong>+1 (778) 650-9966</strong> to test Ryder's actual voice responses. 
            The text interface below provides simulated responses for development purposes only.
          </p>
        </div>

        {agentStatus?.agent?.status !== 'active' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
              <p className="text-yellow-800">Agent is not active. Voice calls may not work properly.</p>
            </div>
          </div>
        )}
      </div>

      {/* Conditional Content Based on Mode */}
      {testingMode === 'widget' ? (
        <WidgetTester agentStatus={agentStatus} />
      ) : (
        <>
          {/* Test Interface */}
      <div className="card">
        <h3 className="font-semibold text-neutral-900 mb-4">Simulated Text Testing</h3>
        <p className="text-sm text-neutral-600 mb-4">
          ⚠️ These are simulated responses using Ryder's store data. 
          For real agent testing, call the phone number above.
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Type your message:
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask Ryder a question..."
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                disabled={isLoading}
              />
              <button
                onClick={() => handleTest()}
                disabled={!message.trim() || isLoading}
                className={`btn-primary flex items-center space-x-2 ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Send className="h-4 w-4" />
                {isLoading && (
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                )}
              </button>
            </div>
          </div>

          {/* Quick Test Messages */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Or try these quick tests:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {quickTestMessages.map((testMsg, index) => (
                <button
                  key={index}
                  onClick={() => handleTest(testMsg)}
                  disabled={isLoading}
                  className="text-left px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testMsg}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Test History */}
      {testHistory.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-neutral-900 mb-4">Test History</h3>
          
          <div className="space-y-4">
            {testHistory.map((test) => (
              <div
                key={test.id}
                className={`p-4 rounded-lg border ${
                  test.status === 'success' 
                    ? 'border-green-200 bg-green-50' 
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {test.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-sm font-medium text-neutral-700">
                      {new Date(test.timestamp).toLocaleTimeString('en-CA')}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2 text-xs text-neutral-500">
                    <Clock className="h-3 w-3" />
                    <span>{formatResponseTime(test.response_time)}</span>
                  </div>
                </div>

                {/* User Message */}
                <div className="mb-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <User className="h-4 w-4 text-neutral-400" />
                    <span className="text-xs font-medium text-neutral-500">USER</span>
                  </div>
                  <p className="text-sm text-neutral-700 bg-white bg-opacity-70 rounded p-2">
                    {test.user_message}
                  </p>
                </div>

                {/* Agent Response */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <Bot className="h-4 w-4 text-primary-600" />
                    <span className="text-xs font-medium text-neutral-500">RYDER</span>
                  </div>
                  <p className={`text-sm rounded p-2 ${
                    test.status === 'success'
                      ? 'text-neutral-700 bg-white bg-opacity-70'
                      : 'text-red-700 bg-red-100'
                  }`}>
                    {test.agent_response}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {testHistory.length >= 10 && (
            <p className="text-xs text-neutral-500 mt-2">
              Showing last 10 tests. Older tests are automatically removed.
            </p>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default AgentTester;