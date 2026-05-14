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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Chip,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@mui/material';
import { ArrowBack, Email, PersonAdd, TrendingUp, TrendingDown } from '@mui/icons-material';

interface Student {
  id: string;
  name: string;
  email: string;
  avgGrade: number;
  submissionRate: number;
  engagementScore: number;
  trend: 'up' | 'down' | 'stable';
}

export default function ClassManagement() {
  const navigate = useNavigate();
  const { classId } = useParams();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [emailList, setEmailList] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to Advanced Mathematics! I\'m excited to have you in class.');

  const students: Student[] = [
    { id: '1', name: 'Alex Johnson', email: 'alex.j@university.edu', avgGrade: 85, submissionRate: 90, engagementScore: 78, trend: 'up' },
    { id: '2', name: 'Sarah Williams', email: 'sarah.w@university.edu', avgGrade: 92, submissionRate: 100, engagementScore: 95, trend: 'up' },
    { id: '3', name: 'Michael Chen', email: 'michael.c@university.edu', avgGrade: 78, submissionRate: 85, engagementScore: 65, trend: 'down' },
    { id: '4', name: 'Emily Davis', email: 'emily.d@university.edu', avgGrade: 88, submissionRate: 95, engagementScore: 82, trend: 'stable' },
  ];

  const handleBulkInvite = () => {
    console.log('Sending invites to:', emailList, 'with message:', welcomeMessage);
    setInviteDialogOpen(false);
    setEmailList('');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" elevation={0} color="success">
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate('/instructor')}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ ml: 2 }}>
            <Typography variant="h6">Advanced Mathematics</Typography>
            <Typography variant="caption">{students.length} Students</Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5">Student Roster</Typography>
            <Button
              variant="contained"
              startIcon={<PersonAdd />}
              onClick={() => setInviteDialogOpen(true)}
            >
              Bulk Email Invites
            </Button>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Avg Grade</TableCell>
                  <TableCell>Submission Rate</TableCell>
                  <TableCell>Engagement Score</TableCell>
                  <TableCell>Trend</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id} sx={{ '&:hover': { bgcolor: '#f9f9f9' } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 36, height: 36 }}>{student.name[0]}</Avatar>
                        <Typography variant="body2">{student.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={`${student.avgGrade}%`}
                        size="small"
                        color={student.avgGrade >= 90 ? 'success' : student.avgGrade >= 70 ? 'primary' : 'warning'}
                      />
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>{student.submissionRate}%</Typography>
                        <LinearProgress
                          variant="determinate"
                          value={student.submissionRate}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>{student.engagementScore}%</Typography>
                        <LinearProgress
                          variant="determinate"
                          value={student.engagementScore}
                          sx={{ height: 6, borderRadius: 3 }}
                          color={student.engagementScore >= 80 ? 'success' : 'warning'}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      {student.trend === 'up' && <TrendingUp color="success" />}
                      {student.trend === 'down' && <TrendingDown color="error" />}
                      {student.trend === 'stable' && <Chip label="Stable" size="small" />}
                    </TableCell>
                    <TableCell>
                      <IconButton size="small">
                        <Email />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ mb: 3 }}>Class Analytics</Typography>
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2" color="text.secondary">Class Average</Typography>
              <Typography variant="h3">86%</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Avg Engagement</Typography>
              <Typography variant="h3">80%</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">At Risk Students</Typography>
              <Typography variant="h3" color="error">1</Typography>
            </Box>
          </Box>
        </Paper>
      </Container>

      <Dialog open={inviteDialogOpen} onClose={() => setInviteDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Bulk Email Invites</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter student email addresses (one per line) to send class invitations
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={6}
            label="Email Addresses"
            placeholder="student1@university.edu&#10;student2@university.edu&#10;student3@university.edu"
            value={emailList}
            onChange={(e) => setEmailList(e.target.value)}
            sx={{ mb: 3 }}
          />
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Welcome Message"
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleBulkInvite}>
            Send Invites
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
