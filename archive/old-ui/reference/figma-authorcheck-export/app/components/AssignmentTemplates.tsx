import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Box,
  Container,
  Typography,
  Paper,
  AppBar,
  Toolbar,
  IconButton,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  ArrowBack,
  Science,
  Functions,
  Description,
  Code,
  Create,
  ContentCopy,
} from '@mui/icons-material';

interface Template {
  id: string;
  title: string;
  subject: string;
  type: string;
  description: string;
  instructions: string;
  maxPoints: number;
  estimatedTime: string;
  icon: React.ReactNode;
  color: string;
}

export default function AssignmentTemplates() {
  const navigate = useNavigate();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [selectedClass, setSelectedClass] = useState('');

  const templates: Template[] = [
    {
      id: '1',
      title: 'Problem Set Template',
      subject: 'Mathematics',
      type: 'Problem Set',
      description: 'Standard mathematics problem set with multiple questions',
      instructions: 'Complete all problems showing your work. Explain your reasoning for each solution.',
      maxPoints: 100,
      estimatedTime: '2-3 hours',
      icon: <Functions sx={{ fontSize: 40 }} />,
      color: '#1976d2',
    },
    {
      id: '2',
      title: 'Lab Report Template',
      subject: 'Science',
      type: 'Lab Report',
      description: 'Structured scientific lab report with sections for hypothesis, methods, results',
      instructions: 'Follow the scientific method. Include hypothesis, materials, procedure, data, analysis, and conclusion.',
      maxPoints: 100,
      estimatedTime: '3-4 hours',
      icon: <Science sx={{ fontSize: 40 }} />,
      color: '#2e7d32',
    },
    {
      id: '3',
      title: 'Essay Template',
      subject: 'English',
      type: 'Essay',
      description: 'Academic essay with introduction, body paragraphs, and conclusion',
      instructions: 'Write a well-structured essay with clear thesis statement. Include evidence and citations.',
      maxPoints: 100,
      estimatedTime: '4-5 hours',
      icon: <Description sx={{ fontSize: 40 }} />,
      color: '#d32f2f',
    },
    {
      id: '4',
      title: 'Programming Project',
      subject: 'Computer Science',
      type: 'Coding',
      description: 'Software development project with code submission and documentation',
      instructions: 'Implement the required functionality. Include code comments and README documentation.',
      maxPoints: 100,
      estimatedTime: '5-6 hours',
      icon: <Code sx={{ fontSize: 40 }} />,
      color: '#f57c00',
    },
    {
      id: '5',
      title: 'Research Paper',
      subject: 'General',
      type: 'Research',
      description: 'In-depth research paper with literature review and citations',
      instructions: 'Conduct thorough research. Include abstract, introduction, literature review, methodology, findings, and references.',
      maxPoints: 100,
      estimatedTime: '8-10 hours',
      icon: <Description sx={{ fontSize: 40 }} />,
      color: '#9c27b0',
    },
    {
      id: '6',
      title: 'Creative Writing',
      subject: 'English',
      type: 'Creative',
      description: 'Creative writing assignment with flexible format',
      instructions: 'Express your creativity while demonstrating writing skills. Focus on narrative, character development, and style.',
      maxPoints: 100,
      estimatedTime: '3-4 hours',
      icon: <Create sx={{ fontSize: 40 }} />,
      color: '#00796b',
    },
  ];

  const handleUseTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setAssignmentTitle(template.title);
    setShowCreateDialog(true);
  };

  const handleCreateAssignment = () => {
    console.log('Creating assignment:', {
      template: selectedTemplate,
      title: assignmentTitle,
      classId: selectedClass,
    });
    setShowCreateDialog(false);
    navigate('/instructor');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" elevation={0} color="success">
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate('/instructor')}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ ml: 2 }}>
            Assignment Template Library
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5" sx={{ mb: 1 }}>
            Quick Assignment Creation
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Select a template to quickly create assignments with pre-defined structure and rubrics
          </Typography>
        </Paper>

        <Grid container spacing={3}>
          {templates.map((template) => (
            <Grid item xs={12} sm={6} md={4} key={template.id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 80,
                      height: 80,
                      borderRadius: 2,
                      bgcolor: template.color,
                      color: 'white',
                      mb: 2,
                      mx: 'auto',
                    }}
                  >
                    {template.icon}
                  </Box>

                  <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
                    {template.title}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 2 }}>
                    <Chip label={template.subject} size="small" color="primary" />
                    <Chip label={template.type} size="small" variant="outlined" />
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                    {template.description}
                  </Typography>

                  <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 1, mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Instructions Preview:
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {template.instructions.substring(0, 100)}...
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Max Points
                      </Typography>
                      <Typography variant="body2">{template.maxPoints}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Est. Time
                      </Typography>
                      <Typography variant="body2">{template.estimatedTime}</Typography>
                    </Box>
                  </Box>
                </CardContent>

                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={<ContentCopy />}
                    onClick={() => handleUseTemplate(template)}
                    sx={{ bgcolor: template.color, '&:hover': { bgcolor: template.color, opacity: 0.9 } }}
                  >
                    Use Template
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Template Benefits
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Box sx={{ p: 2, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Save Time
                </Typography>
                <Typography variant="body2">
                  Pre-defined structures and instructions reduce assignment creation time by 70%
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ p: 2, bgcolor: '#e8f5e9', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Consistency
                </Typography>
                <Typography variant="body2">
                  Maintain consistent grading criteria and expectations across all assignments
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ p: 2, bgcolor: '#fff3e0', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Best Practices
                </Typography>
                <Typography variant="body2">
                  Templates include proven educational frameworks and rubric structures
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Container>

      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create Assignment from Template</DialogTitle>
        <DialogContent>
          {selectedTemplate && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Template: {selectedTemplate.title}
              </Typography>

              <TextField
                fullWidth
                label="Assignment Title"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                sx={{ mb: 3 }}
              />

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Select Class</InputLabel>
                <Select
                  value={selectedClass}
                  label="Select Class"
                  onChange={(e) => setSelectedClass(e.target.value)}
                >
                  <MenuItem value="1">Advanced Mathematics</MenuItem>
                  <MenuItem value="2">Computer Science 101</MenuItem>
                  <MenuItem value="3">English Literature</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                multiline
                rows={4}
                label="Instructions"
                defaultValue={selectedTemplate.instructions}
                sx={{ mb: 3 }}
              />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Max Points"
                    defaultValue={selectedTemplate.maxPoints}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Due Date"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateAssignment}
            disabled={!assignmentTitle || !selectedClass}
          >
            Create Assignment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
