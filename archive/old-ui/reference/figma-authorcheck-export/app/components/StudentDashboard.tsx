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
  Chip,
  LinearProgress,
  Badge,
  AppBar,
  Toolbar,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  Avatar,
} from '@mui/material';
import {
  Assignment,
  Notifications,
  AccountCircle,
  CheckCircle,
  Warning,
  AccessTime,
  MenuBook,
} from '@mui/icons-material';
import { format, addDays, isSameDay } from 'date-fns';

interface ClassData {
  id: string;
  name: string;
  instructor: string;
  color: string;
  progress: number;
  notifications: number;
}

interface AssignmentData {
  id: string;
  title: string;
  classId: string;
  className: string;
  dueDate: Date;
  status: 'pending' | 'submitted' | 'graded';
  grade?: number;
  hasConflict?: boolean;
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());

  const classes: ClassData[] = [
    { id: '1', name: 'Advanced Mathematics', instructor: 'Dr. Smith', color: '#1976d2', progress: 75, notifications: 3 },
    { id: '2', name: 'Computer Science 101', instructor: 'Prof. Johnson', color: '#2e7d32', progress: 60, notifications: 1 },
    { id: '3', name: 'English Literature', instructor: 'Ms. Williams', color: '#d32f2f', progress: 85, notifications: 0 },
    { id: '4', name: 'Physics', instructor: 'Dr. Brown', color: '#f57c00', progress: 50, notifications: 2 },
  ];

  const upcomingAssignments: AssignmentData[] = [
    { id: '1', title: 'Calculus Problem Set 5', classId: '1', className: 'Advanced Mathematics', dueDate: new Date(), status: 'pending', hasConflict: true },
    { id: '2', title: 'Python Data Structures Project', classId: '2', className: 'Computer Science 101', dueDate: new Date(), status: 'pending' },
    { id: '3', title: 'Essay: Shakespearean Tragedy', classId: '3', className: 'English Literature', dueDate: addDays(new Date(), 2), status: 'pending' },
    { id: '4', title: 'Lab Report: Kinematics', classId: '4', className: 'Physics', dueDate: addDays(new Date(), 3), status: 'submitted' },
  ];

  const recentFeedback = [
    { assignment: 'Calculus Problem Set 4', grade: 92, feedback: 'Excellent work on derivatives!' },
    { assignment: 'Java Assignment 2', grade: 88, feedback: 'Good structure, watch for edge cases.' },
  ];

  const getAssignmentsForDate = (date: Date) => {
    return upcomingAssignments.filter(a => isSameDay(a.dueDate, date));
  };

  const nextSevenDays = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <MenuBook sx={{ mr: 2 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            EduPlatform - Student Dashboard
          </Typography>
          <IconButton color="inherit">
            <Badge badgeContent={6} color="error">
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
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Assignment /> Quick Actions
              </Typography>
              <Grid container spacing={2}>
                {upcomingAssignments.slice(0, 2).map((assignment) => (
                  <Grid item xs={12} sm={6} key={assignment.id}>
                    <Card
                      sx={{
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: assignment.hasConflict ? '2px solid #f44336' : 'none',
                        '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 }
                      }}
                      onClick={() => navigate(`/student/assignment/${assignment.id}`)}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Chip label={assignment.className} size="small" color="primary" />
                          {assignment.hasConflict && <Warning color="error" />}
                        </Box>
                        <Typography variant="h6" sx={{ mb: 1 }}>{assignment.title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AccessTime fontSize="small" />
                          Due {format(assignment.dueDate, 'MMM d, h:mm a')}
                        </Typography>
                        <Button
                          variant="contained"
                          size="small"
                          sx={{ mt: 2 }}
                          fullWidth
                        >
                          {assignment.status === 'submitted' ? 'View Submission' : 'Start Assignment'}
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Paper>

            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" sx={{ mb: 3 }}>
                Calendar - Due Dates
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 2 }}>
                {nextSevenDays.map((date, index) => {
                  const assignmentsOnDate = getAssignmentsForDate(date);
                  const hasConflict = assignmentsOnDate.length > 1;
                  return (
                    <Card
                      key={index}
                      sx={{
                        minWidth: 120,
                        cursor: 'pointer',
                        border: hasConflict ? '2px solid #ff9800' : isSameDay(date, selectedDate) ? '2px solid #1976d2' : 'none',
                        bgcolor: isSameDay(date, selectedDate) ? '#e3f2fd' : 'white',
                      }}
                      onClick={() => setSelectedDate(date)}
                    >
                      <CardContent sx={{ textAlign: 'center', p: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          {format(date, 'EEE')}
                        </Typography>
                        <Typography variant="h5">{format(date, 'd')}</Typography>
                        <Badge badgeContent={assignmentsOnDate.length} color={hasConflict ? 'warning' : 'primary'} sx={{ mt: 1 }}>
                          <Assignment />
                        </Badge>
                        {hasConflict && (
                          <Chip label="Conflict" size="small" color="warning" sx={{ mt: 1 }} />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Assignments on {format(selectedDate, 'MMMM d, yyyy')}
                </Typography>
                {getAssignmentsForDate(selectedDate).length > 0 ? (
                  <List>
                    {getAssignmentsForDate(selectedDate).map((assignment) => (
                      <ListItem
                        key={assignment.id}
                        sx={{
                          bgcolor: 'white',
                          mb: 1,
                          borderRadius: 1,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: '#f5f5f5' },
                        }}
                        onClick={() => navigate(`/student/assignment/${assignment.id}`)}
                      >
                        <ListItemText
                          primary={assignment.title}
                          secondary={`${assignment.className} - Due ${format(assignment.dueDate, 'h:mm a')}`}
                        />
                        <Chip
                          label={assignment.status}
                          size="small"
                          color={assignment.status === 'submitted' ? 'success' : 'default'}
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No assignments due on this date
                  </Typography>
                )}
              </Box>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 3 }}>Recent Feedback</Typography>
              <List>
                {recentFeedback.map((item, index) => (
                  <ListItem key={index} sx={{ bgcolor: '#f9f9f9', mb: 2, borderRadius: 1 }}>
                    <CheckCircle color="success" sx={{ mr: 2 }} />
                    <ListItemText
                      primary={item.assignment}
                      secondary={item.feedback}
                    />
                    <Chip label={`${item.grade}%`} color="success" />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 3 }}>My Classes</Typography>
              {classes.map((classItem) => (
                <Card key={classItem.id} sx={{ mb: 2, cursor: 'pointer', '&:hover': { boxShadow: 3 } }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ bgcolor: classItem.color, width: 32, height: 32 }}>
                          {classItem.name[0]}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle1">{classItem.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {classItem.instructor}
                          </Typography>
                        </Box>
                      </Box>
                      {classItem.notifications > 0 && (
                        <Badge badgeContent={classItem.notifications} color="error">
                          <Notifications />
                        </Badge>
                      )}
                    </Box>
                    <Box sx={{ mb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption">Progress</Typography>
                        <Typography variant="caption">{classItem.progress}%</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={classItem.progress} />
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
