import { useNavigate } from 'react-router';
import { Button, Card, CardContent, Typography, Container, Box } from '@mui/material';
import { School, Person } from '@mui/icons-material';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="md" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ textAlign: 'center', width: '100%' }}>
        <Typography variant="h2" sx={{ mb: 2, fontWeight: 600, color: '#1976d2' }}>
          EduPlatform
        </Typography>
        <Typography variant="h5" sx={{ mb: 6, color: '#666' }}>
          Comprehensive Learning Management System
        </Typography>

        <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Card sx={{ width: 300, cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)' } }} onClick={() => navigate('/login/student')}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Person sx={{ fontSize: 80, color: '#1976d2', mb: 2 }} />
              <Typography variant="h5" sx={{ mb: 1 }}>Student Portal</Typography>
              <Typography variant="body2" color="text.secondary">
                Access assignments, submit work, and track your progress
              </Typography>
              <Button variant="contained" sx={{ mt: 3 }} fullWidth>
                Login as Student
              </Button>
            </CardContent>
          </Card>

          <Card sx={{ width: 300, cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)' } }} onClick={() => navigate('/login/instructor')}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <School sx={{ fontSize: 80, color: '#2e7d32', mb: 2 }} />
              <Typography variant="h5" sx={{ mb: 1 }}>Instructor Portal</Typography>
              <Typography variant="body2" color="text.secondary">
                Manage classes, grade assignments, and track student progress
              </Typography>
              <Button variant="contained" color="success" sx={{ mt: 3 }} fullWidth>
                Login as Instructor
              </Button>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Container>
  );
}
