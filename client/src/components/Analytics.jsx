import React from 'react';
import { BarChart3, TrendingUp, Clock, Users, Phone, MessageSquare, Star, Target } from 'lucide-react';

const Analytics = ({ analytics, storeStatus }) => {
  if (!analytics || analytics.total_calls === 0) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <BarChart3 className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No analytics data yet</h3>
          <p className="text-neutral-500 mb-4">
            {analytics?.message || 'Analytics will appear here once customers start calling Ryder at +1 (604) 670-0262'}
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-blue-800 text-sm">
              <strong>To generate analytics:</strong><br />
              Call +1 (604) 670-0262 and have conversations with Ryder. 
              The dashboard will automatically populate with real data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const MetricCard = ({ icon: Icon, title, value, subtitle, trend, color = 'blue' }) => {
    const colorClasses = {
      blue: 'text-blue-600 bg-blue-50',
      green: 'text-green-600 bg-green-50',
      yellow: 'text-yellow-600 bg-yellow-50',
      purple: 'text-purple-600 bg-purple-50',
      red: 'text-red-600 bg-red-50',
    };

    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-600">{title}</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{value}</p>
            {subtitle && (
              <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center">
            <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-sm text-green-600 font-medium">{trend}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          icon={Phone}
          title="Total Calls"
          value={analytics.total_calls}
          subtitle="Last 7 days"
          color="blue"
        />
        
        <MetricCard
          icon={Users}
          title="Human Handoffs"
          value={analytics.successful_handoffs}
          subtitle={`${Math.round((analytics.successful_handoffs / analytics.total_calls) * 100)}% of calls`}
          color="purple"
        />
        
        <MetricCard
          icon={MessageSquare}
          title="Callback Requests"
          value={analytics.callback_requests}
          subtitle="When closed/busy"
          color="yellow"
        />
        
        <MetricCard
          icon={Star}
          title="Satisfaction"
          value={`${analytics.customer_satisfaction}/5.0`}
          subtitle="Average rating"
          color="green"
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          icon={Clock}
          title="Response Time"
          value={analytics.performance.response_time}
          subtitle="Average per interaction"
          color="blue"
        />
        
        <MetricCard
          icon={Target}
          title="Resolution Rate"
          value={analytics.performance.resolution_rate}
          subtitle="Successfully handled"
          color="green"
        />
        
        <MetricCard
          icon={TrendingUp}
          title="Accuracy"
          value={analytics.performance.accuracy}
          subtitle="Correct responses"
          color="purple"
        />
      </div>

      {/* Top Queries */}
      <div className="card">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center">
          <BarChart3 className="h-5 w-5 mr-2" />
          Most Common Questions
        </h3>
        
        <div className="space-y-3">
          {analytics.top_queries.map((query, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  index === 0 ? 'bg-yellow-100 text-yellow-800' :
                  index === 1 ? 'bg-neutral-200 text-neutral-700' :
                  index === 2 ? 'bg-orange-100 text-orange-800' :
                  'bg-neutral-100 text-neutral-600'
                }`}>
                  {index + 1}
                </span>
                <span className="font-medium text-neutral-900">{query.query}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-neutral-600">{query.count} calls</span>
                <div className="w-16 bg-neutral-200 rounded-full h-2">
                  <div
                    className="bg-primary-500 h-2 rounded-full"
                    style={{
                      width: `${(query.count / analytics.top_queries[0].count) * 100}%`
                    }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Store Performance Context */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Store Context</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-neutral-600">Current Status:</span>
              <span className={`font-medium ${
                storeStatus?.data?.isOpen ? 'text-green-600' : 'text-yellow-600'
              }`}>
                {storeStatus?.data?.isOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Today's Hours:</span>
              <span className="font-medium text-neutral-900">
                {storeStatus?.data?.todayHours ? 
                  `${storeStatus.data.todayHours.openFormatted} - ${storeStatus.data.todayHours.closeFormatted}` :
                  'Unknown'
                }
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Phone Number:</span>
              <span className="font-medium text-neutral-900">+1 (604) 670-0262</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Location:</span>
              <span className="font-medium text-neutral-900">Vancouver, BC</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button className="w-full btn-primary text-sm py-2">
              Export Analytics Report
            </button>
            
            <button className="w-full btn-outline text-sm py-2">
              View Detailed Logs
            </button>
            
            <button className="w-full btn-outline text-sm py-2">
              Configure Alerts
            </button>
            
            <a
              href="https://www.bici.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full btn-outline text-sm py-2 inline-block text-center"
            >
              Visit Bici Website
            </a>
          </div>
        </div>
      </div>

      {/* Time Period Note */}
      <div className="text-center">
        <p className="text-sm text-neutral-500">
          Analytics data covers the last {analytics.time_period}. Data refreshes every 30 minutes.
        </p>
      </div>
    </div>
  );
};

export default Analytics;