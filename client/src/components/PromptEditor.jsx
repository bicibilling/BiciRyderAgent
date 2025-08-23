import React, { useState, useEffect } from 'react';
import { Edit3, Save, Upload, Play, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { agentAPI } from '../services/api';

const PromptEditor = ({ agentStatus, onUpdate }) => {
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.2);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [testPrompts, setTestPrompts] = useState([]);
  const [testResults, setTestResults] = useState(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  useEffect(() => {
    // Load current prompt from agent status
    if (agentStatus?.agent?.conversation_config?.agent?.prompt?.prompt) {
      setPrompt(agentStatus.agent.conversation_config.agent.prompt.prompt);
      setTemperature(agentStatus.agent.conversation_config.agent.prompt.temperature || 0.2);
    }

    // Load test prompts
    loadTestPrompts();
  }, [agentStatus]);

  const loadTestPrompts = async () => {
    try {
      const response = await agentAPI.getTestPrompts();
      setTestPrompts(response.data.test_prompts || []);
    } catch (error) {
      console.error('Failed to load test prompts:', error);
    }
  };

  const handlePromptChange = (newPrompt) => {
    setPrompt(newPrompt);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await agentAPI.updatePrompt({ prompt, temperature });
      setHasChanges(false);
      onUpdate?.();
      console.log('Prompt saved locally');
    } catch (error) {
      console.error('Failed to save prompt:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeploy = async () => {
    setIsLoading(true);
    try {
      await agentAPI.deploy();
      setHasChanges(false);
      onUpdate?.();
      console.log('Agent deployed to ElevenLabs');
    } catch (error) {
      console.error('Failed to deploy:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    try {
      const response = await agentAPI.runAllTests();
      setTestResults(response.data);
    } catch (error) {
      console.error('Failed to run tests:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Prompt Editor */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-xl font-semibold text-neutral-900 flex items-center">
            <Edit3 className="h-5 w-5 mr-2" />
            Agent Prompt Editor
          </h2>
          <div className="flex items-center space-x-2">
            {hasChanges && (
              <span className="text-sm text-yellow-600 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1" />
                Unsaved changes
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || isLoading}
              className="btn-outline text-sm py-1 px-3 flex items-center space-x-1"
            >
              <Save className="h-4 w-4" />
              <span>Save</span>
            </button>
            <button
              onClick={handleDeploy}
              disabled={hasChanges || isLoading}
              className="btn-primary text-sm py-1 px-3 flex items-center space-x-1"
            >
              <Upload className="h-4 w-4" />
              <span>Deploy</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              System Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              rows={20}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
              placeholder="Enter Ryder's system prompt..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Temperature (Creativity)
              </label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                0.0 = Very consistent, 1.0 = Very creative
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Current Model
              </label>
              <input
                type="text"
                value={agentStatus?.agent?.conversation_config?.agent?.prompt?.llm || 'gemini-2.0-flash'}
                disabled
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 text-neutral-500"
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 text-sm">
              <strong>Workflow:</strong> 1) Edit prompt above 2) Click "Save" 3) Click "Deploy" to push to ElevenLabs 4) Test by calling +1 (604) 670-0262
            </p>
          </div>
        </div>
      </div>

      {/* Fundamental Tests */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-neutral-900 flex items-center">
            <Play className="h-5 w-5 mr-2" />
            Fundamental Behavior Tests
          </h3>
          <button
            onClick={runAllTests}
            disabled={isRunningTests}
            className="btn-primary text-sm py-1 px-3 flex items-center space-x-1"
          >
            {isRunningTests ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span>{isRunningTests ? 'Running...' : 'Run All 10 Tests'}</span>
          </button>
        </div>

        <p className="text-sm text-neutral-600 mb-4">
          Test core behaviors before deploying to production. These validate Ryder's essential functionality.
        </p>

        {/* Test Prompts List */}
        {testPrompts.length > 0 && (
          <div className="space-y-2 mb-4">
            <h4 className="font-medium text-neutral-900">Test Categories:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {testPrompts.slice(0, 10).map((test, index) => (
                <div key={test.id} className="text-sm bg-neutral-50 rounded p-2">
                  <span className="font-medium">{index + 1}. {test.category.replace(/_/g, ' ')}</span>
                  <p className="text-neutral-600 text-xs mt-1">"{test.prompt}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Results */}
        {testResults && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
              <div>
                <h4 className="font-medium text-neutral-900">Test Summary</h4>
                <p className="text-sm text-neutral-600">
                  {testResults.summary.passed_tests}/{testResults.summary.total_tests} tests passed 
                  ({testResults.summary.success_rate}%)
                </p>
              </div>
              <div className={`flex items-center space-x-2 ${
                testResults.summary.success_rate >= 80 ? 'text-green-600' : 'text-red-600'
              }`}>
                {testResults.summary.success_rate >= 80 ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
                <span className="font-medium">
                  {testResults.summary.success_rate >= 80 ? 'PASSED' : 'NEEDS WORK'}
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {testResults.test_results.map((result) => (
                <div
                  key={result.id}
                  className={`p-3 rounded-lg border text-sm ${
                    result.status === 'completed' 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{result.category.replace(/_/g, ' ')}</span>
                    {result.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <p className="text-neutral-600 mb-2">"{result.prompt}"</p>
                  {result.response && (
                    <p className="text-neutral-800 bg-white bg-opacity-70 rounded p-2 text-xs">
                      {result.response}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptEditor;