import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Badge,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  LinearProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  MenuBook,
  Notifications,
  AccountCircle,
  Assignment,
  CheckCircle,
  Warning,
  Flag,
  People,
  LibraryBooks,
  Add,
} from '@mui/icons-material';

interface SubmissionData {
  id: string;
  studentName: string;
  assignmentTitle: string;
  classId: string;
  submittedDate: Date;
  status: 'pending' | 'graded';
  flagStatus: 'red' | 'yellow' | 'green';
  plagiarismScore: number;
  quizScore?: number;
  grade?: number;
}

interface ClassData {
  id: string;
  name: string;
  studentCount: number;
  avgGrade: number;
  pendingReviews: number;
  color: string;
}

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);

  const classes: ClassData[] = [
    { id: '1', name: 'Advanced Mathematics', studentCount: 24, avgGrade: 87, pendingReviews: 8, color: '#1976d2' },
    { id: '2', name: 'Computer Science 101', studentCount: 32, avgGrade: 82, pendingReviews: 12, color: '#2e7d32' },
    { id: '3', name: 'English Literature', studentCount: 20, avgGrade: 91, pendingReviews: 3, color: '#d32f2f' },
  ];

  const pendingSubmissions: SubmissionData[] = [
    {
      id: '1',
      studentName: 'Alex Johnson',
      assignmentTitle: 'Calculus Problem Set 5',
      classId: '1',
      submittedDate: new Date(),
      status: 'pending',
      flagStatus: 'red',
      plagiarismScore: 78,
      quizScore: 45,
    },
    {
      id: '2',
      studentName: 'Sarah Williams',
      assignmentTitle: 'Python Data Structures',
      classId: '2',
      submittedDate: new Date(),
      status: 'pending',
      flagStatus: 'yellow',
      plagiarismScore: 42,
      quizScore: 85,
    },
    {
      id: '3',
      studentName: 'Michael Chen',
      assignmentTitle: 'Shakespearean Essay',
      classId: '3',
      submittedDate: new Date(),
      status: 'pending',
      flagStatus: 'green',
      plagiarismScore: 12,
      quizScore: 92,
    },
    {
      id: '4',
      studentName: 'Emily Davis',
      assignmentTitle: 'Calculus Problem Set 5',
      classId: '1',
      submittedDate: new Date(),
      status: 'pending',
      flagStatus: 'yellow',
      plagiarismScore: 38,
      quizScore: 78,
    },
  ];

  const getFlagColor = (flag: 'red' | 'yellow' | 'green') => {
    switch (flag) {
      case 'red':
        return '#d32f2f';
      case 'yellow':
        return '#f57c00';
      case 'green':
        return '#2e7d32';
    }
  };

  const getFlagLabel = (flag: 'red' | 'yellow' | 'green') => {
    switch (flag) {
      case 'red':
        return 'High Risk - Immediate Review';
      case 'yellow':
        return 'Moderate Concern - Secondary Check';
      case 'green':
        return 'Likely Original - Standard Process';
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" elevation={0} color="success">
        <Toolbar>
          <MenuBook sx={{ mr: 2 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            EduPlatform - Instructor Dashboard
          </Typography>
          <IconButton color="inherit">
            <Badge badgeContent={23} color="error">
              <Notifications />
            </Badge>
          </IconButton>
          <IconButton color="inherit">
            <AccountCircle />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ mb: 3 }}>
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={selectedTab} onChange={(_, v) => setSelectedTab(v)}>
                  <Tab icon={<Flag />} label="Pending Reviews" iconPosition="start" />
                  <Tab icon={<CheckCircle />} label="Recently Graded" iconPosition="start" />
                  <Tab icon={<Warning />} label="Flagged Submissions" iconPosition="start" />
                </Tabs>
              </Box>

              <Box sx={{ p: 3 }}>
                {selectedTab === 0 && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                      <Typography variant="h5">Submissions Requiring Review</Typography>
                      <Chip label={`${pendingSubmissions.length} pending`} color="primary" />
                    </Box>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Student</TableCell>
                            <TableCell>Assignment</TableCell>
                            <TableCell>Submitted</TableCell>
                            <TableCell>Flag Status</TableCell>
                            <TableCell>Plagiarism</TableCell>
                            <TableCell>Quiz Score</TableCell>
                            <TableCell>Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingSubmissions.map((submission) => (
                            <TableRow
                              key={submission.id}
                              sx={{
                                bgcolor: submission.flagStatus === 'red' ? '#ffebee' : 'white',
                                '&:hover': { bgcolor: '#f5f5f5', cursor: 'pointer' },
                              }}
                            >
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Avatar sx={{ width: 32, height: 32 }}>
                                    {submission.studentName[0]}
                                  </Avatar>
                                  {submission.studentName}
                                </Box>
                              </TableCell>
                              <TableCell>{submission.assignmentTitle}</TableCell>
                              <TableCell>{submission.submittedDate.toLocaleString()}</TableCell>
                              <TableCell>
                                <Chip
                                  icon={<Flag />}
                                  label={submission.flagStatus.toUpperCase()}
                                  size="small"
                                  sx={{
                                    bgcolor: getFlagColor(submission.flagStatus),
                                    color: 'white',
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Box>
                                  <Typography variant="body2">{submission.plagiarismScore}%</Typography>
                                  <LinearProgress
                                    variant="determinate"
                                    value={submission.plagiarismScore}
                                    sx={{
                                      height: 6,
                                      borderRadius: 3,
                                      bgcolor: '#e0e0e0',
                                      '& .MuiLinearProgress-bar': {
                                        bgcolor:
                                          submission.plagiarismScore > 60
                                            ? '#d32f2f'
                                            : submission.plagiarismScore > 30
                                            ? '#f57c00'
                                            : '#2e7d32',
                                      },
                                    }}
                                  />
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={`${submission.quizScore}%`}
                                  size="small"
                                  color={
                                    submission.quizScore && submission.quizScore >= 70
                                      ? 'success'
                                      : 'warning'
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="contained"
                                  size="small"
                                  onClick={() => navigate(`/instructor/review/${submission.id}`)}
                                >
                                  Review
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}

                {selectedTab === 2 && (
                  <>
                    <Typography variant="h5" sx={{ mb: 3 }}>
                      AuthorCheck Flag Categories
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={4}>
                        <Card sx={{ border: '2px solid #d32f2f' }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                              <Flag sx={{ color: '#d32f2f' }} />
                              <Typography variant="h6" color="#d32f2f">
                                Red Flag
                              </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                              High plagiarism risk requiring immediate review
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Criteria: Similarity {'>'} 60% OR Quiz Score {'<'} 50%
                            </Typography>
                            <Box sx={{ mt: 2 }}>
                              <Chip
                                label={`${pendingSubmissions.filter((s) => s.flagStatus === 'red').length} submissions`}
                                color="error"
                                size="small"
                              />
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>

                      <Grid item xs={12} md={4}>
                        <Card sx={{ border: '2px solid #f57c00' }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                              <Flag sx={{ color: '#f57c00' }} />
                              <Typography variant="h6" color="#f57c00">
                                Yellow Flag
                              </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                              Moderate concerns suggesting secondary check
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Criteria: Similarity 30-60% OR Quiz Score 50-70%
                            </Typography>
                            <Box sx={{ mt: 2 }}>
                              <Chip
                                label={`${pendingSubmissions.filter((s) => s.flagStatus === 'yellow').length} submissions`}
                                sx={{ bgcolor: '#f57c00', color: 'white' }}
                                size="small"
                              />
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>

                      <Grid item xs={12} md={4}>
                        <Card sx={{ border: '2px solid #2e7d32' }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                              <Flag sx={{ color: '#2e7d32' }} />
                              <Typography variant="h6" color="#2e7d32">
                                Green Flag
                              </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                              Likely original - standard grading process
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Criteria: Similarity {'<'} 30% AND Quiz Score {'>'} 70%
                            </Typography>
                            <Box sx={{ mt: 2 }}>
                              <Chip
                                label={`${pendingSubmissions.filter((s) => s.flagStatus === 'green').length} submissions`}
                                color="success"
                                size="small"
                              />
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  </>
                )}
              </Box>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Quick Actions</Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Button
                    variant="outlined"
                    fullWidth
                    sx={{ py: 2 }}
                    onClick={() => navigate('/instructor/templates')}
                  >
                    <Box sx={{ textAlign: 'center' }}>
                      <LibraryBooks sx={{ fontSize: 40, mb: 1 }} />
                      <Typography variant="body2">Assignment Templates</Typography>
                    </Box>
                  </Button>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Button variant="outlined" fullWidth sx={{ py: 2 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Add sx={{ fontSize: 40, mb: 1 }} />
                      <Typography variant="body2">Create Assignment</Typography>
                    </Box>
                  </Button>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" sx={{ mb: 3 }}>My Classes</Typography>
              {classes.map((classItem) => (
                <Card
                  key={classItem.id}
                  sx={{
                    mb: 2,
                    cursor: 'pointer',
                    '&:hover': { boxShadow: 3 },
                  }}
                  onClick={() => navigate(`/instructor/class/${classItem.id}`)}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Avatar sx={{ bgcolor: classItem.color }}>
                        {classItem.name[0]}
                      </Avatar>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="subtitle1">{classItem.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {classItem.studentCount} students
                        </Typography>
                      </Box>
                      {classItem.pendingReviews > 0 && (
                        <Badge badgeContent={classItem.pendingReviews} color="error">
                          <Assignment />
                        </Badge>
                      )}
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Class Average
                      </Typography>
                      <Typography variant="h6">{classItem.avgGrade}%</Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Analytics Overview</Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Total Submissions This Week
                </Typography>
                <Typography variant="h4">47</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Avg. Grading Time
                </Typography>
                <Typography variant="h4">12 min</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Plagiarism Detected
                </Typography>
                <Typography variant="h4" color="error">
                  8 cases
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
