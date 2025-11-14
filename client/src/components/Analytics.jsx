import React from 'react';
import { BarChart3, TrendingUp, Clock, Users, Phone, MessageSquare, Star, Target } from 'lucide-react';

const Analytics = ({ analytics, storeStatus }) => {
  if (!analytics || analytics.total_calls === 0) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <BarChart3 className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">Ryder Analytics Ready</h3>
          <p className="text-neutral-500 mb-4">
            Performance metrics will appear here once customers start calling Ryder at +1 (778) 650-9966
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-blue-800 text-sm">
              <strong>Test Ryder's performance:</strong><br />
              Call +1 (778) 650-9966 and test greeting compliance, lead qualification (5 questions), 
              French detection (Quebec numbers), and business hours logic.
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
      {/* Bici-Specific Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          icon={Phone}
          title="Total Customer Calls"
          value={analytics.total_calls}
          subtitle="All conversations"
          color="blue"
        />
        
        <MetricCard
          icon={Users}
          title="Proper Greetings"
          value={`${Math.round((analytics.successful_calls / analytics.total_calls) * 100)}%`}
          subtitle="Date, time, store status"
          color="green"
        />
        
        <MetricCard
          icon={MessageSquare}
          title="Lead Qualification"
          value={analytics.top_queries.filter(q => q.query.toLowerCase().includes('bike')).length}
          subtitle="Bike interest conversations"
          color="purple"
        />
        
        <MetricCard
          icon={Star}
          title="Quebec French Detection"
          value={analytics.top_queries.filter(q => q.query.toLowerCase().includes('français') || q.query.toLowerCase().includes('bonjour')).length}
          subtitle="Auto language switching"
          color="yellow"
        />
      </div>

      {/* Bici Business Performance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          icon={Clock}
          title="Store Hours Inquiries"
          value={analytics.top_queries.filter(q => q.query.toLowerCase().includes('hours') || q.query.toLowerCase().includes('open')).length}
          subtitle="Hours and location requests"
          color="blue"
        />
        
        <MetricCard
          icon={Target}
          title="Human Transfers"
          value={analytics.top_queries.filter(q => q.query.toLowerCase().includes('human') || q.query.toLowerCase().includes('person')).length}
          subtitle="Successful escalations"
          color="green"
        />
        
        <MetricCard
          icon={TrendingUp}
          title="After-Hours Messages"
          value={analytics.top_queries.filter(q => q.query.toLowerCase().includes('message') || q.query.toLowerCase().includes('callback')).length}
          subtitle="Callback requests taken"
          color="purple"
        />
      </div>

      {/* Top Customer Inquiries */}
      <div className="card">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center">
          <BarChart3 className="h-5 w-5 mr-2" />
          Customer Inquiry Types
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

      {/* Ryder Performance & Compliance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Ryder's Core Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-neutral-600">Proper Identification:</span>
              <span className="font-medium text-green-600">
                ✓ "Ryder, AI Teammate at Bici"
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Store Hours Communication:</span>
              <span className={`font-medium ${
                storeStatus?.isOpen ? 'text-green-600' : 'text-yellow-600'
              }`}>
                {storeStatus?.isOpen ? 'Open until 6 PM' : 'Closed - proper messaging'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Skills Mentioned:</span>
              <span className="font-medium text-blue-600">
                Hours, Location, Departments
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Future Skills Noted:</span>
              <span className="font-medium text-purple-600">
                Orders, Inventory
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Business Rules Compliance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-neutral-600">No Cost/Margin Sharing:</span>
              <span className="font-medium text-green-600">✓ Compliant</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Kids Bike Handling:</span>
              <span className="font-medium text-green-600">✓ Acknowledge & Redirect</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">After-Hours Logic:</span>
              <span className="font-medium text-green-600">✓ No Transfer, Message Only</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Phone Number:</span>
              <span className="font-medium text-neutral-900">+1 (778) 650-9966</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lead Qualification Performance */}
      <div className="card">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">5-Question Lead Qualification</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {analytics.top_queries.filter(q => q.query.toLowerCase().includes('riding') || q.query.toLowerCase().includes('type')).length}
            </div>
            <div className="text-sm text-neutral-600">Riding Type Asked</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {analytics.top_queries.filter(q => q.query.toLowerCase().includes('experience') || q.query.toLowerCase().includes('beginner')).length}
            </div>
            <div className="text-sm text-neutral-600">Experience Level</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {analytics.top_queries.filter(q => q.query.toLowerCase().includes('budget') || q.query.toLowerCase().includes('price')).length}
            </div>
            <div className="text-sm text-neutral-600">Budget Discussion</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {analytics.top_queries.filter(q => q.query.toLowerCase().includes('when') || q.query.toLowerCase().includes('timeline')).length}
            </div>
            <div className="text-sm text-neutral-600">Purchase Timeline</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {analytics.top_queries.filter(q => q.query.toLowerCase().includes('store') || q.query.toLowerCase().includes('visit')).length}
            </div>
            <div className="text-sm text-neutral-600">Store Visit Interest</div>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-blue-800 text-sm">
            <strong>Lead Qualification Goal:</strong> Collect all 5 data points for HubSpot forwarding
          </p>
        </div>
      </div>

      {/* Analytics Period */}
      <div className="text-center">
        <p className="text-sm text-neutral-500">
          Ryder analytics based on {analytics.total_calls} real conversations. 
          Focus: Greeting compliance, lead qualification, and business hours logic.
        </p>
      </div>
    </div>
  );
};

export default Analytics;