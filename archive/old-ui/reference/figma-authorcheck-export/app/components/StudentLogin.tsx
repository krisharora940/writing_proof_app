import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Link,
  Divider,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Person, Visibility, VisibilityOff, School } from '@mui/icons-material';

export default function StudentLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    console.log('Student login:', { email, password });
    navigate('/student');
  };

  const handleDemoLogin = () => {
    setEmail('student@university.edu');
    setPassword('demo123');
    setTimeout(() => navigate('/student'), 500);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ p: 4, borderRadius: 3 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                bgcolor: '#1976d2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <Person sx={{ fontSize: 50, color: 'white' }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              Student Login
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Access your courses and assignments
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="Student Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@university.edu"
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <School color="action" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <input type="checkbox" id="remember" />
                <label htmlFor="remember" style={{ marginLeft: 8, fontSize: '0.875rem' }}>
                  Remember me
                </label>
              </Box>
              <Link href="#" variant="body2" sx={{ textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </Box>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              sx={{
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)',
                mb: 2,
              }}
            >
              Sign In
            </Button>

            <Button
              variant="outlined"
              fullWidth
              size="large"
              onClick={handleDemoLogin}
              sx={{ py: 1.5, mb: 2 }}
            >
              Demo Login
            </Button>
          </form>

          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              OR
            </Typography>
          </Divider>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Don't have an account?{' '}
              <Link href="#" sx={{ textDecoration: 'none', fontWeight: 600 }}>
                Sign up
              </Link>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Are you an instructor?{' '}
              <Link
                onClick={() => navigate('/login/instructor')}
                sx={{ textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Login here
              </Link>
            </Typography>
          </Box>

          <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid #e0e0e0', textAlign: 'center' }}>
            <Link
              onClick={() => navigate('/')}
              sx={{ textDecoration: 'none', color: 'text.secondary', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              ← Back to Home
            </Link>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
