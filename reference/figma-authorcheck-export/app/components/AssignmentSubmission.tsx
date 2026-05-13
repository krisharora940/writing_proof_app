import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Box,
  Container,
  Typography,
  Paper,
  TextField,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack,
  Save,
  AttachFile,
  FormatBold,
  FormatItalic,
  FormatUnderlined,
  FormatListBulleted,
  FormatListNumbered,
  Delete,
  Upload,
  CheckCircle,
} from '@mui/icons-material';

export default function AssignmentSubmission() {
  const navigate = useNavigate();
  const { assignmentId } = useParams();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const assignmentDetails = {
    id: assignmentId,
    title: 'Calculus Problem Set 5',
    className: 'Advanced Mathematics',
    dueDate: new Date(),
    instructions: 'Complete problems 1-10 from Chapter 5. Show all work and explain your reasoning for each solution. Upload supporting calculations as needed.',
    maxPoints: 100,
  };

  const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;
  const charCount = content.length;

  useEffect(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    if (content || title) {
      setAutoSaveStatus('unsaved');
      autoSaveTimer.current = setTimeout(() => {
        setAutoSaveStatus('saving');
        setTimeout(() => {
          setAutoSaveStatus('saved');
          console.log('Auto-saved:', { title, content, attachments });
        }, 500);
      }, 2000);
    }

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [content, title, attachments]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      setAttachments([...attachments, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const formatText = (format: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    let formattedText = '';
    switch (format) {
      case 'bold':
        formattedText = `**${selectedText}**`;
        break;
      case 'italic':
        formattedText = `*${selectedText}*`;
        break;
      case 'underline':
        formattedText = `__${selectedText}__`;
        break;
      case 'bullet':
        formattedText = `\n- ${selectedText}`;
        break;
      case 'number':
        formattedText = `\n1. ${selectedText}`;
        break;
    }

    const newContent = content.substring(0, start) + formattedText + content.substring(end);
    setContent(newContent);
  };

  const handleSubmit = () => {
    setShowReviewDialog(true);
  };

  const confirmSubmission = () => {
    setShowReviewDialog(false);
    setShowConfirmDialog(true);
    setTimeout(() => {
      navigate(`/student/quiz/${assignmentId}`);
    }, 2000);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate('/student')}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1, ml: 2 }}>
            <Typography variant="h6">{assignmentDetails.title}</Typography>
            <Typography variant="caption">{assignmentDetails.className}</Typography>
          </Box>
          <Chip
            icon={autoSaveStatus === 'saved' ? <CheckCircle /> : <Save />}
            label={autoSaveStatus === 'saved' ? 'Saved' : autoSaveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
            color={autoSaveStatus === 'saved' ? 'success' : 'default'}
            sx={{ mr: 2 }}
          />
          <Typography variant="body2" sx={{ mr: 2 }}>
            {wordCount} words | {charCount} characters
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Assignment Instructions</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Due: {assignmentDetails.dueDate.toLocaleString()} | Max Points: {assignmentDetails.maxPoints}
          </Alert>
          <Typography variant="body1">{assignmentDetails.instructions}</Typography>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ mb: 3 }}>Your Submission</Typography>

          <TextField
            fullWidth
            label="Submission Title"
            variant="outlined"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            sx={{ mb: 3 }}
          />

          <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', bgcolor: '#f5f5f5', p: 1, borderRadius: 1 }}>
            <IconButton size="small" onClick={() => formatText('bold')} title="Bold">
              <FormatBold />
            </IconButton>
            <IconButton size="small" onClick={() => formatText('italic')} title="Italic">
              <FormatItalic />
            </IconButton>
            <IconButton size="small" onClick={() => formatText('underline')} title="Underline">
              <FormatUnderlined />
            </IconButton>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <IconButton size="small" onClick={() => formatText('bullet')} title="Bullet List">
              <FormatListBulleted />
            </IconButton>
            <IconButton size="small" onClick={() => formatText('number')} title="Numbered List">
              <FormatListNumbered />
            </IconButton>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Button
              component="label"
              startIcon={<Upload />}
              size="small"
              variant="outlined"
            >
              Attach Files
              <input
                type="file"
                hidden
                multiple
                onChange={handleFileUpload}
              />
            </Button>
          </Box>

          <TextField
            fullWidth
            multiline
            rows={15}
            variant="outlined"
            placeholder="Start typing your answer here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            inputRef={textareaRef}
            sx={{ mb: 3, fontFamily: 'monospace' }}
          />

          {attachments.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Attachments ({attachments.length})
              </Typography>
              <List dense>
                {attachments.map((file, index) => (
                  <ListItem
                    key={index}
                    secondaryAction={
                      <IconButton edge="end" onClick={() => removeAttachment(index)}>
                        <Delete />
                      </IconButton>
                    }
                  >
                    <ListItemIcon>
                      <AttachFile />
                    </ListItemIcon>
                    <ListItemText
                      primary={file.name}
                      secondary={`${(file.size / 1024).toFixed(2)} KB`}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => navigate('/student')}>
              Save Draft
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              disabled={!content.trim() || !title.trim()}
            >
              Submit Assignment
            </Button>
          </Box>
        </Paper>
      </Container>

      <Dialog open={showReviewDialog} onClose={() => setShowReviewDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Review Your Submission</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 3 }}>
            Please review your submission carefully. Once submitted, you cannot make changes.
          </Alert>

          <Typography variant="h6" sx={{ mb: 1 }}>Title</Typography>
          <Typography variant="body1" sx={{ mb: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
            {title}
          </Typography>

          <Typography variant="h6" sx={{ mb: 1 }}>Content</Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 3, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {content}
          </Paper>

          <Typography variant="h6" sx={{ mb: 1 }}>Statistics</Typography>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2">Words: {wordCount}</Typography>
            <Typography variant="body2">Characters: {charCount}</Typography>
            <Typography variant="body2">Attachments: {attachments.length}</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowReviewDialog(false)}>Go Back</Button>
          <Button variant="contained" onClick={confirmSubmission}>
            Confirm Submission
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showConfirmDialog}>
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
          <CheckCircle sx={{ fontSize: 80, color: '#4caf50', mb: 2 }} />
          <Typography variant="h5" sx={{ mb: 2 }}>Submission Successful!</Typography>
          <Typography variant="body1" color="text.secondary">
            Your assignment has been submitted. You'll now complete a comprehension quiz.
          </Typography>
          <LinearProgress sx={{ mt: 3 }} />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
