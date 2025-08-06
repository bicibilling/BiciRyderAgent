import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  List,
  ListItem,
  ListItemText,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  Phone as PhoneIcon,
  Person as PersonIcon,
  Chat as ChatIcon,
  Analytics as AnalyticsIcon,
  Refresh as RefreshIcon,
  PlayArrow as TakeoverIcon,
  Stop as ReleaseIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import { useQuery } from 'react-query';
import axios from 'axios';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useWebSocket } from '../contexts/WebSocketContext';

interface DashboardOverview {
  activeConversations: number;
  connectedClients: number;
  realtimeMetrics: any;
  dailyStats: any;
  recentConversations: any[];
}

interface ActiveConversation {
  id: string;
  customerPhone: string;
  status: string;
  startedAt: string;
  isHumanTakeover: boolean;
  duration?: number;
  lastEvent?: any;
}

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

const DashboardPage: React.FC = () => {
  const { 
    isConnected, 
    activeConversations, 
    subscribeToConversation,
    unsubscribeFromConversation,
    sendMessage,
    takeoverConversation,
    releaseConversation 
  } = useWebSocket();
  
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('text');

  // Fetch dashboard overview
  const { data: overview, isLoading, refetch } = useQuery<DashboardOverview>(
    'dashboard-overview',
    async () => {
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/overview`);
      return response.data.data;
    },
    {
      refetchInterval: 30000, // Refetch every 30 seconds
      enabled: isConnected,
    }
  );

  // Fetch active conversations
  const { data: activeConversationsData, isLoading: conversationsLoading } = useQuery<ActiveConversation[]>(
    'active-conversations',
    async () => {
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/conversations/active`);
      return response.data.data;
    },
    {
      refetchInterval: 10000, // Refetch every 10 seconds
      enabled: isConnected,
    }
  );

  const handleTakeoverConversation = async (conversationId: string) => {
    try {
      takeoverConversation(conversationId);
      subscribeToConversation(conversationId);
      toast.success('Taking over conversation...');
    } catch (error) {
      toast.error('Failed to takeover conversation');
    }
  };

  const handleReleaseConversation = async (conversationId: string) => {
    try {
      releaseConversation(conversationId);
      toast.success('Releasing conversation to AI...');
    } catch (error) {
      toast.error('Failed to release conversation');
    }
  };

  const handleOpenChat = (conversationId: string) => {
    setSelectedConversation(conversationId);
    setChatDialogOpen(true);
    subscribeToConversation(conversationId);
  };

  const handleCloseChat = () => {
    if (selectedConversation) {
      unsubscribeFromConversation(selectedConversation);
    }
    setChatDialogOpen(false);
    setSelectedConversation(null);
    setMessageText('');
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !messageText.trim()) return;

    try {
      sendMessage(selectedConversation, messageText, messageType);
      setMessageText('');
      toast.success('Message sent');
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'ringing':
        return 'warning';
      case 'completed':
        return 'default';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0s';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Real-time Dashboard
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => refetch()}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </Box>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Dashboard is not connected to the WebSocket server. Real-time updates are unavailable.
        </Alert>
      )}

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PhoneIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Active Calls</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {activeConversations.size}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Currently in progress
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PersonIcon color="secondary" sx={{ mr: 1 }} />
                <Typography variant="h6">Connected Agents</Typography>
              </Box>
              <Typography variant="h3" color="secondary">
                {overview?.connectedClients || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Dashboard users online
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ChatIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="h6">Today's Calls</Typography>
              </Box>
              <Typography variant="h3" color="success">
                {overview?.dailyStats?.total_conversations || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total conversations today
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AnalyticsIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6">AI Success Rate</Typography>
              </Box>
              <Typography variant="h3" color="warning">
                {overview?.dailyStats?.total_conversations 
                  ? Math.round(((overview.dailyStats.total_conversations - (overview.dailyStats.human_takeovers || 0)) / overview.dailyStats.total_conversations) * 100)
                  : 100}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Conversations without human intervention
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Active Conversations */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Active Conversations
              </Typography>
              
              {conversationsLoading && <LinearProgress sx={{ mb: 2 }} />}
              
              {activeConversationsData && activeConversationsData.length > 0 ? (
                <List>
                  {activeConversationsData.map((conversation, index) => (
                    <React.Fragment key={conversation.id}>
                      <ListItem
                        sx={{ px: 0 }}
                        secondaryAction={
                          <Box>
                            <IconButton
                              edge="end"
                              color="primary"
                              onClick={() => handleOpenChat(conversation.id)}
                              title="Open chat"
                            >
                              <ChatIcon />
                            </IconButton>
                            {conversation.isHumanTakeover ? (
                              <IconButton
                                edge="end"
                                color="secondary"
                                onClick={() => handleReleaseConversation(conversation.id)}
                                title="Release to AI"
                              >
                                <ReleaseIcon />
                              </IconButton>
                            ) : (
                              <IconButton
                                edge="end"
                                color="warning"
                                onClick={() => handleTakeoverConversation(conversation.id)}
                                title="Take over conversation"
                              >
                                <TakeoverIcon />
                              </IconButton>
                            )}
                          </Box>
                        }
                      >
                        <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                          <PhoneIcon />
                        </Avatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle2">
                                {conversation.customerPhone}
                              </Typography>
                              <Chip
                                label={conversation.status}
                                color={getStatusColor(conversation.status)}
                                size="small"
                              />
                              {conversation.isHumanTakeover && (
                                <Chip
                                  label="Human"
                                  color="warning"
                                  size="small"
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Typography variant="body2" color="text.secondary">
                                Started: {format(new Date(conversation.startedAt), 'HH:mm:ss')}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Duration: {formatDuration(conversation.duration)}
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItem>
                      {index < activeConversationsData.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <PhoneIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="body1" color="text.secondary">
                    No active conversations
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>
              
              {overview?.recentConversations && overview.recentConversations.length > 0 ? (
                <List>
                  {overview.recentConversations.slice(0, 5).map((conversation: any, index: number) => (
                    <React.Fragment key={conversation.id}>
                      <ListItem sx={{ px: 0 }}>
                        <Avatar sx={{ mr: 2, bgcolor: 'grey.400' }}>
                          <PhoneIcon />
                        </Avatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle2">
                                {conversation.customerPhone}
                              </Typography>
                              <Chip
                                label={conversation.status}
                                color={getStatusColor(conversation.status)}
                                size="small"
                              />
                            </Box>
                          }
                          secondary={
                            <Typography variant="body2" color="text.secondary">
                              {format(new Date(conversation.startedAt), 'MMM dd, HH:mm')} • 
                              Duration: {formatDuration(conversation.duration)}
                            </Typography>
                          }
                        />
                      </ListItem>
                      {index < overview.recentConversations.slice(0, 5).length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <ChatIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="body1" color="text.secondary">
                    No recent activity
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Chat Dialog */}
      <Dialog
        open={chatDialogOpen}
        onClose={handleCloseChat}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Human-in-the-Loop Chat
          {selectedConversation && (
            <Typography variant="subtitle2" color="text.secondary">
              Conversation: {selectedConversation}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Message Type</InputLabel>
              <Select
                value={messageType}
                label="Message Type"
                onChange={(e) => setMessageType(e.target.value)}
              >
                <MenuItem value="text">User Message</MenuItem>
                <MenuItem value="contextual_update">Contextual Update</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Message"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={
                messageType === 'text' 
                  ? 'Type a message as if you are the user...'
                  : 'Provide contextual information to the AI...'
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseChat}>Close</Button>
          <Button
            onClick={handleSendMessage}
            variant="contained"
            startIcon={<SendIcon />}
            disabled={!messageText.trim()}
          >
            Send Message
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DashboardPage;