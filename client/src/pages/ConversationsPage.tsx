import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Tooltip,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  Chat as ChatIcon,
  PlayArrow as TakeoverIcon,
  Stop as ReleaseIcon,
  Phone as PhoneIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useQuery } from 'react-query';
import { format } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useWebSocket } from '../contexts/WebSocketContext';

interface Conversation {
  id: string;
  customerPhone: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  duration?: number;
  isHumanTakeover: boolean;
  humanAgentName?: string;
  summary?: string;
  transcript?: Array<{
    speaker: string;
    text: string;
    timestamp: string;
  }>;
  notes?: string;
}

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

const ConversationsPage: React.FC = () => {
  const { 
    activeConversations,
    subscribeToConversation,
    unsubscribeFromConversation,
    sendMessage,
    takeoverConversation,
    releaseConversation 
  } = useWebSocket();
  
  const [searchFilters, setSearchFilters] = useState({
    phoneNumber: '',
    status: '',
    humanTakeover: '',
    startDate: '',
    endDate: ''
  });
  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [notesText, setNotesText] = useState('');

  // Search conversations
  const { data: searchResults, isLoading, refetch } = useQuery(
    ['conversations', searchFilters, page, rowsPerPage],
    async () => {
      const params = new URLSearchParams({
        limit: rowsPerPage.toString(),
        offset: (page * rowsPerPage).toString(),
        ...Object.fromEntries(
          Object.entries(searchFilters).filter(([_, value]) => value !== '')
        )
      });
      
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/conversations/search?${params}`);
      return response.data;
    },
    {
      keepPreviousData: true,
    }
  );

  const handleSearch = () => {
    setPage(0);
    refetch();
  };

  const handleViewDetails = async (conversationId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/conversations/${conversationId}`);
      setSelectedConversation(response.data.data);
      setNotesText(response.data.data.notes || '');
      setDetailsDialogOpen(true);
    } catch (error) {
      toast.error('Failed to load conversation details');
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedConversation) return;

    try {
      await axios.patch(`${API_BASE_URL}/api/dashboard/conversations/${selectedConversation.id}/notes`, {
        notes: notesText
      });
      toast.success('Notes saved successfully');
      
      // Update local state
      setSelectedConversation({
        ...selectedConversation,
        notes: notesText
      });
    } catch (error) {
      toast.error('Failed to save notes');
    }
  };

  const handleTakeoverConversation = (conversationId: string) => {
    takeoverConversation(conversationId);
    subscribeToConversation(conversationId);
    toast.success('Taking over conversation...');
  };

  const handleReleaseConversation = (conversationId: string) => {
    releaseConversation(conversationId);
    toast.success('Releasing conversation to AI...');
  };

  const handleOpenChat = (conversationId: string) => {
    const conversation = searchResults?.data.find((c: Conversation) => c.id === conversationId);
    if (conversation) {
      setSelectedConversation(conversation);
      setChatDialogOpen(true);
      subscribeToConversation(conversationId);
    }
  };

  const handleCloseChat = () => {
    if (selectedConversation) {
      unsubscribeFromConversation(selectedConversation.id);
    }
    setChatDialogOpen(false);
    setMessageText('');
  };

  const handleSendMessage = () => {
    if (!selectedConversation || !messageText.trim()) return;

    sendMessage(selectedConversation.id, messageText, messageType);
    setMessageText('');
    toast.success('Message sent');
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'completed':
        return 'default';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
  };

  const isActiveConversation = (conversationId: string) => {
    return Array.from(activeConversations.keys()).includes(conversationId);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Conversations
      </Typography>

      {/* Search Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Search & Filter
          </Typography>
          
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                label="Phone Number"
                value={searchFilters.phoneNumber}
                onChange={(e) => setSearchFilters({ ...searchFilters, phoneNumber: e.target.value })}
                size="small"
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={searchFilters.status}
                  label="Status"
                  onChange={(e) => setSearchFilters({ ...searchFilters, status: e.target.value })}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Human Takeover</InputLabel>
                <Select
                  value={searchFilters.humanTakeover}
                  label="Human Takeover"
                  onChange={(e) => setSearchFilters({ ...searchFilters, humanTakeover: e.target.value })}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                label="Start Date"
                type="date"
                value={searchFilters.startDate}
                onChange={(e) => setSearchFilters({ ...searchFilters, startDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                label="End Date"
                type="date"
                value={searchFilters.endDate}
                onChange={(e) => setSearchFilters({ ...searchFilters, endDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={handleSearch}
                disabled={isLoading}
              >
                Search
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Results ({searchResults?.pagination?.total || 0})
          </Typography>
          
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Phone Number</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Human Takeover</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {searchResults?.data?.map((conversation: Conversation) => (
                  <TableRow key={conversation.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <PhoneIcon sx={{ mr: 1, color: 'text.secondary' }} />
                        {conversation.customerPhone}
                        {isActiveConversation(conversation.id) && (
                          <Chip
                            label="LIVE"
                            color="success"
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    
                    <TableCell>
                      <Chip
                        label={conversation.status}
                        color={getStatusColor(conversation.status)}
                        size="small"
                      />
                    </TableCell>
                    
                    <TableCell>
                      {format(new Date(conversation.startedAt), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    
                    <TableCell>
                      {formatDuration(conversation.duration)}
                    </TableCell>
                    
                    <TableCell>
                      {conversation.isHumanTakeover ? (
                        <Chip
                          label={conversation.humanAgentName || 'Yes'}
                          color="warning"
                          size="small"
                        />
                      ) : (
                        <Chip
                          label="No"
                          color="default"
                          size="small"
                        />
                      )}
                    </TableCell>
                    
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            onClick={() => handleViewDetails(conversation.id)}
                          >
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        
                        {isActiveConversation(conversation.id) && (
                          <>
                            <Tooltip title="Chat">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleOpenChat(conversation.id)}
                              >
                                <ChatIcon />
                              </IconButton>
                            </Tooltip>
                            
                            {conversation.isHumanTakeover ? (
                              <Tooltip title="Release to AI">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() => handleReleaseConversation(conversation.id)}
                                >
                                  <ReleaseIcon />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip title="Take Over">
                                <IconButton
                                  size="small"
                                  color="warning"
                                  onClick={() => handleTakeoverConversation(conversation.id)}
                                >
                                  <TakeoverIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <TablePagination
            rowsPerPageOptions={[10, 25, 50, 100]}
            component="div"
            count={searchResults?.pagination?.total || 0}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
          />
        </CardContent>
      </Card>

      {/* Conversation Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Conversation Details
          {selectedConversation && (
            <Typography variant="subtitle2" color="text.secondary">
              {selectedConversation.customerPhone} • {selectedConversation.id}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedConversation && (
            <Grid container spacing={3}>
              {/* Basic Info */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Call Information
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Status:</Typography>
                        <Chip label={selectedConversation.status} color={getStatusColor(selectedConversation.status)} size="small" />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Started:</Typography>
                        <Typography variant="body2">{format(new Date(selectedConversation.startedAt), 'MMM dd, yyyy HH:mm:ss')}</Typography>
                      </Box>
                      {selectedConversation.endedAt && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Ended:</Typography>
                          <Typography variant="body2">{format(new Date(selectedConversation.endedAt), 'MMM dd, yyyy HH:mm:ss')}</Typography>
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Duration:</Typography>
                        <Typography variant="body2">{formatDuration(selectedConversation.duration)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Human Takeover:</Typography>
                        <Typography variant="body2">{selectedConversation.isHumanTakeover ? 'Yes' : 'No'}</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Notes */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Notes
                    </Typography>
                    <TextField
                      fullWidth
                      multiline
                      rows={6}
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Add notes about this conversation..."
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveNotes}
                      sx={{ mt: 1 }}
                    >
                      Save Notes
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              {/* Transcript */}
              {selectedConversation.transcript && (
                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Transcript
                      </Typography>
                      <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                        {selectedConversation.transcript.map((entry, index) => (
                          <React.Fragment key={index}>
                            <ListItem alignItems="flex-start">
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip
                                      label={entry.speaker}
                                      color={entry.speaker === 'user' ? 'primary' : 'secondary'}
                                      size="small"
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                      {format(new Date(entry.timestamp), 'HH:mm:ss')}
                                    </Typography>
                                  </Box>
                                }
                                secondary={entry.text}
                              />
                            </ListItem>
                            {index < selectedConversation.transcript.length - 1 && <Divider />}
                          </React.Fragment>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

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
              {selectedConversation.customerPhone}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseChat}>Close</Button>
          <Button
            onClick={handleSendMessage}
            variant="contained"
            disabled={!messageText.trim()}
          >
            Send Message
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ConversationsPage;