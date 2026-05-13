import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Box,
  Container,
  Typography,
  Paper,
  AppBar,
  Toolbar,
  IconButton,
  Button,
  TextField,
  Divider,
  Chip,
  LinearProgress,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Alert,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ArrowBack,
  Comment,
  Warning,
  CheckCircle,
  ContentCopy,
  TrendingUp,
  Flag,
  Save,
} from '@mui/icons-material';

interface Comment {
  id: string;
  lineNumber: number;
  text: string;
  timestamp: Date;
}

interface PlagiarismSource {
  url: string;
  similarity: number;
  matchedText: string;
}

export default function InstructorReview() {
  const navigate = useNavigate();
  const { submissionId } = useParams();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [grade, setGrade] = useState('');
  const [rubricScores, setRubricScores] = useState({
    accuracy: 0,
    explanation: 0,
    methodology: 0,
    presentation: 0,
  });
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  const submissionData = {
    id: submissionId,
    studentName: 'Alex Johnson',
    assignmentTitle: 'Calculus Problem Set 5',
    className: 'Advanced Mathematics',
    submittedDate: new Date(),
    content: `Problem 1: Find the derivative of f(x) = 3x² + 2x - 5

Solution:
Using the power rule, we can differentiate each term:
f'(x) = d/dx(3x²) + d/dx(2x) - d/dx(5)
f'(x) = 6x + 2 - 0
f'(x) = 6x + 2

Problem 2: Evaluate the integral ∫(4x³ + 3x) dx

Solution:
Using the power rule for integration:
∫(4x³ + 3x) dx = x⁴ + (3/2)x² + C

Where C is the constant of integration.

Problem 3: Find the critical points of g(x) = x³ - 3x² + 2

Solution:
First, find the derivative:
g'(x) = 3x² - 6x

Set g'(x) = 0:
3x² - 6x = 0
3x(x - 2) = 0
x = 0 or x = 2

Therefore, the critical points are at x = 0 and x = 2.`,
    quizScore: 45,
    flagStatus: 'red' as const,
  };

  const plagiarismReport = {
    overallScore: 78,
    flagStatus: 'red' as const,
    sources: [
      {
        url: 'https://mathsolutions.com/calculus-derivatives',
        similarity: 92,
        matchedText: 'Using the power rule, we can differentiate each term...',
      },
      {
        url: 'https://calculushelp.org/integration-basics',
        similarity: 87,
        matchedText: 'Using the power rule for integration: ∫(4x³ + 3x) dx...',
      },
      {
        url: 'https://studymath.edu/critical-points',
        similarity: 65,
        matchedText: 'Set g\'(x) = 0: 3x² - 6x = 0...',
      },
    ],
    writingPatternAnalysis: {
      consistencyScore: 34,
      styleShifts: 3,
      vocabularyLevel: 'Mixed (6th grade to College)',
      suspiciousPatterns: [
        'Sudden change in mathematical notation style',
        'Inconsistent explanation depth across problems',
        'Variable formatting inconsistencies',
      ],
    },
  };

  const handleAddComment = () => {
    if (newComment.trim() && selectedLine !== null) {
      const comment: Comment = {
        id: Date.now().toString(),
        lineNumber: selectedLine,
        text: newComment,
        timestamp: new Date(),
      };
      setComments([...comments, comment]);
      setNewComment('');
      setSelectedLine(null);
    }
  };

  const handleLineClick = (lineNumber: number) => {
    setSelectedLine(lineNumber);
  };

  const contentLines = submissionData.content.split('\n');

  const calculateTotalGrade = () => {
    const total = Object.values(rubricScores).reduce((sum, score) => sum + score, 0);
    return Math.round(total / 4);
  };

  const handleSubmitGrade = () => {
    console.log('Submitting grade:', {
      grade: calculateTotalGrade(),
      rubricScores,
      comments,
    });
    setShowSubmitDialog(false);
    navigate('/instructor');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" elevation={0} color="success">
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate('/instructor')}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1, ml: 2 }}>
            <Typography variant="h6">{submissionData.studentName}</Typography>
            <Typography variant="caption">
              {submissionData.assignmentTitle} - {submissionData.className}
            </Typography>
          </Box>
          <Chip
            icon={<Flag />}
            label={`${submissionData.flagStatus.toUpperCase()} FLAG`}
            sx={{
              bgcolor: submissionData.flagStatus === 'red' ? '#d32f2f' : '#f57c00',
              color: 'white',
              mr: 2,
            }}
          />
          <Button variant="contained" color="primary" onClick={() => setShowSubmitDialog(true)}>
            Submit Grade
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '70vh', overflow: 'auto' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Student Submission</Typography>
                <Chip label={`Quiz Score: ${submissionData.quizScore}%`} color="error" />
              </Box>

              <Alert severity="warning" sx={{ mb: 2 }}>
                Low quiz score ({submissionData.quizScore}%) indicates potential comprehension issues
              </Alert>

              <Box sx={{ fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: 1.8 }}>
                {contentLines.map((line, index) => {
                  const lineComments = comments.filter((c) => c.lineNumber === index);
                  const isSelected = selectedLine === index;

                  return (
                    <Box key={index}>
                      <Box
                        sx={{
                          display: 'flex',
                          py: 0.5,
                          px: 1,
                          cursor: 'pointer',
                          bgcolor: isSelected ? '#e3f2fd' : lineComments.length > 0 ? '#fff3e0' : 'transparent',
                          '&:hover': { bgcolor: '#f5f5f5' },
                          borderLeft: lineComments.length > 0 ? '3px solid #ff9800' : 'none',
                        }}
                        onClick={() => handleLineClick(index)}
                      >
                        <Typography
                          variant="caption"
                          sx={{ width: 40, color: 'text.secondary', userSelect: 'none' }}
                        >
                          {index + 1}
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', flexGrow: 1 }}>
                          {line || ' '}
                        </Typography>
                        {lineComments.length > 0 && (
                          <Comment fontSize="small" sx={{ color: '#ff9800', ml: 1 }} />
                        )}
                      </Box>
                      {lineComments.map((comment) => (
                        <Box
                          key={comment.id}
                          sx={{ ml: 5, my: 1, p: 1, bgcolor: '#fff3e0', borderRadius: 1, borderLeft: '3px solid #ff9800' }}
                        >
                          <Typography variant="body2">{comment.text}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {comment.timestamp.toLocaleTimeString()}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  );
                })}
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Add Inline Comment
                </Typography>
                {selectedLine !== null && (
                  <Alert severity="info" sx={{ mb: 1 }}>
                    Commenting on line {selectedLine + 1}
                  </Alert>
                )}
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Click a line number to add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  disabled={selectedLine === null}
                  sx={{ mb: 1 }}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || selectedLine === null}
                >
                  Add Comment
                </Button>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, mb: 2, height: '70vh', overflow: 'auto' }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                AuthorCheck Plagiarism Report
              </Typography>

              <Alert
                severity="error"
                icon={<Warning />}
                sx={{ mb: 3 }}
              >
                <Typography variant="subtitle2">High Plagiarism Risk Detected</Typography>
                <Typography variant="body2">
                  Overall Similarity: {plagiarismReport.overallScore}%
                </Typography>
              </Alert>

              <Card sx={{ mb: 3, border: '2px solid #d32f2f' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Flag sx={{ color: '#d32f2f' }} />
                    <Typography variant="h6" color="error">
                      RED FLAG - Immediate Review Required
                    </Typography>
                  </Box>
                  <Typography variant="body2">
                    This submission has been flagged for high plagiarism risk based on:
                  </Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText primary={`Similarity Score: ${plagiarismReport.overallScore}% (threshold: 60%)`} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary={`Quiz Score: ${submissionData.quizScore}% (threshold: 50%)`} />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>

              <Typography variant="subtitle1" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ContentCopy /> Matched Sources
              </Typography>

              {plagiarismReport.sources.map((source, index) => (
                <Card key={index} sx={{ mb: 2, border: '1px solid #ff9800' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">Source {index + 1}</Typography>
                      <Chip
                        label={`${source.similarity}% Match`}
                        size="small"
                        sx={{
                          bgcolor: source.similarity > 80 ? '#d32f2f' : '#f57c00',
                          color: 'white',
                        }}
                      />
                    </Box>
                    <Typography variant="caption" color="primary" sx={{ wordBreak: 'break-all' }}>
                      {source.url}
                    </Typography>
                    <Box sx={{ mt: 1, p: 1, bgcolor: '#fff3e0', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                        "{source.matchedText}"
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUp /> Writing Pattern Analysis
              </Typography>

              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Style Consistency Score
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <LinearProgress
                        variant="determinate"
                        value={plagiarismReport.writingPatternAnalysis.consistencyScore}
                        sx={{
                          flexGrow: 1,
                          height: 8,
                          borderRadius: 4,
                          bgcolor: '#e0e0e0',
                          '& .MuiLinearProgress-bar': { bgcolor: '#d32f2f' },
                        }}
                      />
                      <Typography variant="h6">
                        {plagiarismReport.writingPatternAnalysis.consistencyScore}%
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Style Shifts Detected: {plagiarismReport.writingPatternAnalysis.styleShifts}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Vocabulary Level: {plagiarismReport.writingPatternAnalysis.vocabularyLevel}
                  </Typography>

                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Suspicious Patterns:
                  </Typography>
                  <List dense>
                    {plagiarismReport.writingPatternAnalysis.suspiciousPatterns.map((pattern, index) => (
                      <ListItem key={index}>
                        <Warning color="warning" fontSize="small" sx={{ mr: 1 }} />
                        <ListItemText primary={pattern} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ mb: 2 }}>
                    Comprehension Quiz Summary
                  </Typography>
                  <Alert severity="error">
                    Student scored {submissionData.quizScore}% on the post-submission comprehension quiz,
                    indicating they may not fully understand the material they submitted.
                  </Alert>
                </CardContent>
              </Card>
            </Paper>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3, mt: 2 }}>
          <Typography variant="h6" sx={{ mb: 3 }}>
            Grading Rubric
          </Typography>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Criterion</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell width={200}>Score (0-100)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Accuracy</TableCell>
                  <TableCell>Correctness of mathematical solutions</TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={rubricScores.accuracy}
                      onChange={(e) =>
                        setRubricScores({ ...rubricScores, accuracy: Number(e.target.value) })
                      }
                      inputProps={{ min: 0, max: 100 }}
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Explanation</TableCell>
                  <TableCell>Clarity and completeness of explanations</TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={rubricScores.explanation}
                      onChange={(e) =>
                        setRubricScores({ ...rubricScores, explanation: Number(e.target.value) })
                      }
                      inputProps={{ min: 0, max: 100 }}
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Methodology</TableCell>
                  <TableCell>Appropriate use of mathematical methods</TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={rubricScores.methodology}
                      onChange={(e) =>
                        setRubricScores({ ...rubricScores, methodology: Number(e.target.value) })
                      }
                      inputProps={{ min: 0, max: 100 }}
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Presentation</TableCell>
                  <TableCell>Organization and formatting</TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={rubricScores.presentation}
                      onChange={(e) =>
                        setRubricScores({ ...rubricScores, presentation: Number(e.target.value) })
                      }
                      inputProps={{ min: 0, max: 100 }}
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
            <Typography variant="h5">Total Grade:</Typography>
            <Chip label={`${calculateTotalGrade()}%`} color="primary" sx={{ fontSize: '1.2rem', py: 2, px: 1 }} />
          </Box>
        </Paper>
      </Container>

      <Dialog open={showSubmitDialog} onClose={() => setShowSubmitDialog(false)}>
        <DialogTitle>Submit Grade</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This submission has a RED FLAG for plagiarism. Make sure you've thoroughly reviewed
            the AuthorCheck report before submitting a grade.
          </Alert>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Final Grade: {calculateTotalGrade()}%
          </Typography>
          <Typography variant="body2">Comments: {comments.length}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSubmitDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmitGrade}>
            Confirm & Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
