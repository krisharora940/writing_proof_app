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
  Chip,
} from '@mui/material';
import { School, Visibility, VisibilityOff, Email, Badge } from '@mui/icons-material';

export default function InstructorLogin() {
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

    console.log('Instructor login:', { email, password });
    navigate('/instructor');
  };

  const handleDemoLogin = () => {
    setEmail('professor@university.edu');
    setPassword('demo123');
    setTimeout(() => navigate('/instructor'), 500);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
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
                bgcolor: '#2e7d32',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <School sx={{ fontSize: 50, color: 'white' }} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                Instructor Login
              </Typography>
              <Chip label="Faculty" size="small" color="success" />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Manage classes, grade assignments, and track progress
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
              label="Faculty Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="professor@university.edu"
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Email color="action" />
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
              color="success"
              fullWidth
              size="large"
              sx={{
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(45deg, #2e7d32 30%, #66bb6a 90%)',
                mb: 2,
              }}
            >
              Sign In
            </Button>

            <Button
              variant="outlined"
              color="success"
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
              Need instructor access?{' '}
              <Link href="#" sx={{ textDecoration: 'none', fontWeight: 600 }}>
                Request account
              </Link>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Are you a student?{' '}
              <Link
                onClick={() => navigate('/login/student')}
                sx={{ textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Login here
              </Link>
            </Typography>
          </Box>

          <Alert severity="info" sx={{ mt: 3 }}>
            <Typography variant="caption">
              <Badge sx={{ fontSize: 14, mr: 0.5 }} />
              SSO available for verified faculty members
            </Typography>
          </Alert>

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
