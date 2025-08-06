import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  FormGroup,
  Divider,
  Alert,
  Tabs,
  Tab,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  Security as SecurityIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useQuery } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';

interface DashboardSettings {
  organizationId: string;
  dashboardRefreshInterval: number;
  autoSubscribeNewConversations: boolean;
  notificationSettings: {
    newConversations: boolean;
    humanTakeovers: boolean;
    conversationEnded: boolean;
  };
  displaySettings: {
    showTranscripts: boolean;
    showAnalytics: boolean;
    compactView: boolean;
  };
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { isConnected, connectionStatus } = useWebSocket();
  const [tabValue, setTabValue] = useState(0);
  const [settings, setSettings] = useState<DashboardSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch dashboard settings
  const { data: settingsData, isLoading, refetch } = useQuery<DashboardSettings>(
    'dashboard-settings',
    async () => {
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/settings`);
      return response.data.data;
    },
    {
      onSuccess: (data) => {
        setSettings(data);
      },
    }
  );

  const handleSettingChange = (path: string, value: any) => {
    if (!settings) return;

    const pathArray = path.split('.');
    const newSettings = { ...settings };
    let current: any = newSettings;

    for (let i = 0; i < pathArray.length - 1; i++) {
      current = current[pathArray[i]];
    }

    current[pathArray[pathArray.length - 1]] = value;
    setSettings(newSettings);
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    try {
      await axios.patch(`${API_BASE_URL}/api/dashboard/settings`, settings);
      toast.success('Settings saved successfully');
      setHasChanges(false);
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const handleResetSettings = () => {
    if (settingsData) {
      setSettings(settingsData);
      setHasChanges(false);
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'success';
      case 'connecting':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Settings
      </Typography>

      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          aria-label="settings tabs"
        >
          <Tab icon={<SettingsIcon />} label="Dashboard" />
          <Tab icon={<NotificationsIcon />} label="Notifications" />
          <Tab icon={<SecurityIcon />} label="System" />
          <Tab icon={<InfoIcon />} label="About" />
        </Tabs>

        {/* Dashboard Settings */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Dashboard Configuration
                  </Typography>
                  
                  {settings && (
                    <Grid container spacing={3}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Refresh Interval (seconds)"
                          type="number"
                          value={settings.dashboardRefreshInterval / 1000}
                          onChange={(e) => 
                            handleSettingChange('dashboardRefreshInterval', parseInt(e.target.value) * 1000)
                          }
                          helperText="How often to refresh dashboard data"
                          inputProps={{ min: 1, max: 300 }}
                        />
                      </Grid>

                      <Grid item xs={12}>
                        <FormGroup>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={settings.autoSubscribeNewConversations}
                                onChange={(e) => 
                                  handleSettingChange('autoSubscribeNewConversations', e.target.checked)
                                }
                              />
                            }
                            label="Auto-subscribe to new conversations"
                          />
                        </FormGroup>
                      </Grid>

                      <Grid item xs={12}>
                        <Typography variant="subtitle1" gutterBottom>
                          Display Options
                        </Typography>
                        <FormGroup>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={settings.displaySettings.showTranscripts}
                                onChange={(e) => 
                                  handleSettingChange('displaySettings.showTranscripts', e.target.checked)
                                }
                              />
                            }
                            label="Show conversation transcripts"
                          />
                          <FormControlLabel
                            control={
                              <Switch
                                checked={settings.displaySettings.showAnalytics}
                                onChange={(e) => 
                                  handleSettingChange('displaySettings.showAnalytics', e.target.checked)
                                }
                              />
                            }
                            label="Show analytics data"
                          />
                          <FormControlLabel
                            control={
                              <Switch
                                checked={settings.displaySettings.compactView}
                                onChange={(e) => 
                                  handleSettingChange('displaySettings.compactView', e.target.checked)
                                }
                              />
                            }
                            label="Compact view"
                          />
                        </FormGroup>
                      </Grid>
                    </Grid>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Notification Settings */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Notification Preferences
                  </Typography>
                  
                  {settings && (
                    <FormGroup>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.notificationSettings.newConversations}
                            onChange={(e) => 
                              handleSettingChange('notificationSettings.newConversations', e.target.checked)
                            }
                          />
                        }
                        label="New conversations started"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.notificationSettings.humanTakeovers}
                            onChange={(e) => 
                              handleSettingChange('notificationSettings.humanTakeovers', e.target.checked)
                            }
                          />
                        }
                        label="Human takeover requests"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.notificationSettings.conversationEnded}
                            onChange={(e) => 
                              handleSettingChange('notificationSettings.conversationEnded', e.target.checked)
                            }
                          />
                        }
                        label="Conversations ended"
                      />
                    </FormGroup>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* System Information */}
        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Connection Status
                  </Typography>
                  
                  <List>
                    <ListItem>
                      <ListItemText
                        primary="WebSocket Connection"
                        secondary="Real-time dashboard connection"
                      />
                      <ListItemSecondaryAction>
                        <Chip
                          label={connectionStatus}
                          color={getConnectionStatusColor()}
                          size="small"
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Organization"
                        secondary={user?.organizationId}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="User Role"
                        secondary={user?.role}
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    System Actions
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Button
                      variant="outlined"
                      startIcon={<RefreshIcon />}
                      onClick={() => window.location.reload()}
                    >
                      Refresh Dashboard
                    </Button>
                    
                    <Alert severity="info">
                      If you're experiencing connection issues, try refreshing the dashboard.
                    </Alert>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* About */}
        <TabPanel value={tabValue} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    BICI WebSocket Dashboard
                  </Typography>
                  
                  <Typography variant="body1" paragraph>
                    Real-time monitoring and management system for AI voice conversations powered by ElevenLabs.
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Version
                      </Typography>
                      <Typography variant="body2">
                        1.0.0
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Build Date
                      </Typography>
                      <Typography variant="body2">
                        {new Date().toLocaleDateString()}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Features
                      </Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText primary="Real-time conversation monitoring" />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Human-in-the-loop intervention" />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Multi-tenant organization support" />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Analytics and reporting" />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="ElevenLabs WebSocket integration" />
                        </ListItem>
                      </List>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Save Actions */}
        <Box sx={{ p: 3, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              onClick={handleResetSettings}
              disabled={!hasChanges}
            >
              Reset Changes
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveSettings}
              disabled={!hasChanges || isLoading}
            >
              Save Settings
            </Button>
          </Box>
          
          {hasChanges && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              You have unsaved changes. Don't forget to save your settings.
            </Alert>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default SettingsPage;