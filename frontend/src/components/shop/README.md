# TelephonyInterface Components

A sophisticated conversation interface system for the BICI telephony application, providing real-time communication management between AI agents, human agents, and customers.

## Overview

The TelephonyInterface replaces the basic dashboard with a comprehensive conversation management system that includes:

- **Real-time conversation streaming** via Server-Sent Events (SSE)
- **Human-in-the-loop controls** for seamless AI to human handoffs
- **Multi-channel communication** (SMS, voice calls)
- **Professional UI/UX** with modern chat interface
- **Organization-scoped security** with proper data isolation
- **Advanced analytics** and conversation insights

## Components

### Main Components

#### `TelephonyInterface.tsx`
The core conversation interface component with essential features:
- Tabbed interface (Conversation/Profile/Analytics/Settings)
- Real-time SSE connection management
- Auto/Manual mode toggle for human control
- SMS and voice call controls
- Smart scrolling with scroll-to-bottom functionality
- Connection status monitoring with reconnection logic

#### `TelephonyInterface-fixed.tsx`
Enhanced version with additional advanced features:
- Minimizable/draggable interface
- Advanced voice controls (mute, volume, recording)
- Enhanced error handling and retry mechanisms
- Notification system integration
- Session timers and activity tracking
- Lead scoring and sentiment analysis

### Supporting Components

#### `ConversationDisplay.tsx`
Displays conversation messages with:
- Different message types (SMS, voice, system)
- Message bubbles with sender identification
- Timestamp and status indicators
- Voice message duration and confidence scores
- Professional styling with proper message threading

#### `MessageInput.tsx`
Message composition interface featuring:
- Auto-resizing textarea with character limits
- Quick reply suggestions
- Emoji and attachment buttons (future enhancements)
- Real-time validation and error handling
- Send on Enter functionality

#### `StatusIndicator.tsx`
Real-time status display showing:
- Connection status (Live, Offline, Error)
- Current mode (Voice call active, SMS mode)
- Control status (AI Active, Human Control)
- Animated indicators for better UX

#### `LeadProfile.tsx`
Customer profile management with:
- Contact information editing
- Lead scoring and sentiment display
- Funding readiness and chase status
- Activity timeline
- Notes and comments system
- AI-generated insights

#### `ConversationAnalyticsView.tsx`
Analytics dashboard providing:
- Key metrics (message count, duration, lead score)
- Message distribution charts
- Sentiment analysis with historical data
- Performance insights and response times
- Topic and keyword analysis
- Intent recognition results

#### `SettingsPanel.tsx`
Configuration interface for:
- Communication preferences
- Voice and audio settings
- Notification management
- Privacy and security options
- Interface customization
- Organization settings

## Type Definitions

### Core Types (`/types/conversation.ts`)

```typescript
interface ConversationMessage {
  id: string
  content: string
  sentBy: 'user' | 'agent' | 'human_agent' | 'system'
  timestamp: string
  type: 'text' | 'voice' | 'system'
  status?: 'sending' | 'sent' | 'delivered' | 'failed'
  // ... additional fields
}

interface Lead {
  id: string
  customerName: string
  phoneNumber: string
  email?: string
  fundingReadiness?: 'Not Ready' | 'Pre-Qualified' | 'Ready'
  // ... additional fields
}

interface HumanControlSession {
  sessionId: string
  phoneNumber: string
  organizationId: string
  agentName: string
  startTime: string
  status: 'active' | 'ended'
  // ... additional fields
}
```

## API Integration

### Server-Sent Events (SSE)
- **Endpoint**: `/api/stream/conversation/:leadId`
- **Parameters**: `phoneNumber`, `load=true`, `organizationId`
- **Events**: `connected`, `conversation_history`, `sms_received`, `call_initiated`, etc.

### Human Control APIs
- **Join**: `POST /api/human-control/join`
- **Leave**: `POST /api/human-control/leave`
- **Send Message**: `POST /api/human-control/send-message`
- **Status**: `GET /api/human-control/status`

### Communication APIs
- **Outbound Call**: `POST /api/conversations/outbound-call`
- **Send SMS**: Integrated with human control message sending

## Security Features

### Organization Isolation
- All API calls include `organizationId` headers
- SSE events validate organization context
- Cross-organization data access is blocked
- Memory keys are organization-scoped

### Data Validation
- Phone number normalization
- Message length limits (SMS 1600 chars)
- Input sanitization and validation
- Authentication token verification

## Usage Example

```tsx
import { TelephonyInterface } from '@/components/shop'

function Dashboard() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  
  return (
    <div className="h-screen flex">
      <LeadsList onSelectLead={setSelectedLead} />
      {selectedLead && (
        <TelephonyInterface
          selectedLead={selectedLead}
          organizationId="your-org-id"
          onLeadUpdate={handleLeadUpdate}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </div>
  )
}
```

## Advanced Usage

```tsx
import { TelephonyInterfaceFixed } from '@/components/shop'

function EnhancedDashboard() {
  return (
    <TelephonyInterfaceFixed
      selectedLead={selectedLead}
      organizationId={organizationId}
      onLeadUpdate={handleLeadUpdate}
      onClose={handleClose}
      onNotification={handleNotification}
      showAdvancedFeatures={true}
      enableVoiceControls={true}
      enableAnalytics={true}
    />
  )
}
```

## Features Roadmap

### Implemented ✅
- Real-time conversation streaming
- Human-in-the-loop controls
- Multi-channel communication
- Professional UI/UX
- Organization security
- Error handling and reconnection
- Lead profile management
- Basic analytics
- Settings management

### Planned 🚧
- File attachments in messages
- Emoji picker integration
- Advanced voice controls (noise cancellation)
- Real-time collaboration (multiple agents)
- Advanced AI insights and suggestions
- Integration with CRM systems
- Mobile responsive design enhancements
- Accessibility improvements

## Technical Notes

### Performance Considerations
- Message history limited to 50 messages for memory efficiency
- Auto-scroll optimization with intersection observers
- Component memoization for frequently updated displays
- Debounced input handling for better UX

### Browser Support
- Modern browsers with EventSource support
- WebRTC for future voice features
- Progressive enhancement for older browsers

### Development Tips
- Use TypeScript interfaces for type safety
- Follow the existing component patterns
- Implement proper error boundaries
- Test SSE reconnection scenarios
- Validate organization context in all operations

## Contributing

When contributing to these components:

1. Follow the existing TypeScript patterns
2. Maintain organization security requirements
3. Add proper error handling and loading states
4. Include appropriate tests for new features
5. Update type definitions as needed
6. Document any new API integrations
7. Ensure responsive design compatibility

## Dependencies

- React 18+ with hooks
- Framer Motion for animations
- Heroicons for consistent iconography
- date-fns for date formatting
- react-hot-toast for notifications
- Tailwind CSS for styling

The components are designed to integrate seamlessly with the existing BICI application architecture while providing a modern, professional conversation management experience.