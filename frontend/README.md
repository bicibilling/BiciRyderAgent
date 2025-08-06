# BICI AI Voice Agent Frontend

A modern React TypeScript frontend application for the BICI AI Voice Agent system. Built with Vite, Tailwind CSS, and featuring real-time WebSocket integration for live call monitoring and human takeover capabilities.

## Features

- **🎯 Real-time Dashboard** - Live monitoring of AI voice conversations
- **💬 Human Takeover** - Seamless transition from AI to human agents
- **📊 Analytics & Reporting** - Comprehensive insights and performance metrics
- **🎨 BICI Brand Design** - Custom UI components matching BICI.cc theme
- **📱 Responsive Design** - Mobile-first design for all devices
- **🔒 Secure Authentication** - JWT-based authentication with role management
- **⚡ Real-time Updates** - WebSocket integration for live data synchronization

## Tech Stack

- **Frontend Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS with custom BICI brand theme
- **State Management:** React Context + Zustand
- **Routing:** React Router v6
- **Forms:** React Hook Form with Zod validation
- **Charts:** Recharts
- **Animations:** Framer Motion
- **Icons:** Heroicons
- **HTTP Client:** Axios
- **Notifications:** React Hot Toast

## Getting Started

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_BASE_URL=ws://localhost:3001
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Building for Production

Build the application:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components (Button, Card, etc.)
│   ├── Layout.tsx      # Main application layout
│   └── ProtectedRoute.tsx
├── contexts/           # React contexts
│   ├── AuthContext.tsx
│   └── WebSocketContext.tsx
├── pages/              # Page components
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── ConversationsPage.tsx
│   ├── AnalyticsPage.tsx
│   └── SettingsPage.tsx
├── App.tsx            # Main application component
├── main.tsx           # Application entry point
└── index.css          # Global styles and Tailwind imports
```

## Key Features

### Real-time Dashboard

- Live monitoring of active voice conversations
- Real-time metrics and statistics
- Connection status indicators
- Quick actions for conversation management

### Human Takeover Interface

- Seamless AI-to-human transition
- Real-time chat interface
- Context preservation
- Message type selection (user message vs. contextual update)

### Analytics & Reporting

- Interactive charts and visualizations
- Call volume trends
- AI performance metrics
- Lead quality analysis
- Customizable date ranges

### Responsive Design

- Mobile-first approach
- Adaptive layouts for tablet and desktop
- Touch-friendly interface
- Collapsible sidebar navigation

## Deployment

### Render Deployment

The application is configured for deployment on Render with the included `render.yaml` file.

1. Connect your repository to Render
2. The build will automatically use the production configuration
3. Environment variables will be set from the Render dashboard

### Manual Deployment

1. Build the application:
```bash
npm run build:production
```

2. Serve the `dist` folder using any static file server:
```bash
npx serve -s dist
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:3001` |
| `VITE_WS_BASE_URL` | WebSocket server URL | `ws://localhost:3001` |
| `VITE_APP_NAME` | Application name | `BICI AI Voice Agent` |
| `VITE_ENABLE_ANALYTICS` | Enable analytics features | `true` |
| `VITE_ENABLE_NOTIFICATIONS` | Enable notifications | `true` |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is proprietary software for BICI.cc.