import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Box,
  Container,
  Typography,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Button,
  AppBar,
  Toolbar,
  LinearProgress,
  Card,
  CardContent,
  Alert,
} from '@mui/material';
import { CheckCircle, Cancel, Quiz as QuizIcon } from '@mui/icons-material';

interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
}

export default function ComprehensionQuiz() {
  const navigate = useNavigate();
  const { submissionId } = useParams();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: number }>({});
  const [showResults, setShowResults] = useState(false);

  const questions: Question[] = [
    {
      id: 1,
      question: 'What is the primary concept you demonstrated in your solution to Problem 1?',
      options: [
        'Derivative of a polynomial function',
        'Integration by parts',
        'Limits and continuity',
        'Chain rule application',
      ],
      correctAnswer: 0,
    },
    {
      id: 2,
      question: 'Which mathematical principle did you apply in Problem 5?',
      options: [
        'L\'Hôpital\'s Rule',
        'Mean Value Theorem',
        'Fundamental Theorem of Calculus',
        'Implicit Differentiation',
      ],
      correctAnswer: 3,
    },
    {
      id: 3,
      question: 'What was the main challenge you addressed in your solution approach?',
      options: [
        'Finding critical points',
        'Solving complex equations',
        'Graphing functions',
        'Evaluating definite integrals',
      ],
      correctAnswer: 0,
    },
  ];

  const handleAnswerChange = (questionId: number, answerIndex: number) => {
    setAnswers({ ...answers, [questionId]: answerIndex });
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setShowResults(true);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q) => {
      if (answers[q.id] === q.correctAnswer) {
        correct++;
      }
    });
    return (correct / questions.length) * 100;
  };

  const score = calculateScore();
  const progress = ((currentQuestion + 1) / questions.length) * 100;

  if (showResults) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <QuizIcon sx={{ mr: 2 }} />
            <Typography variant="h6">Comprehension Quiz Results</Typography>
          </Toolbar>
        </AppBar>

        <Container maxWidth="md" sx={{ py: 4 }}>
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <CheckCircle sx={{ fontSize: 100, color: score >= 70 ? '#4caf50' : '#f44336', mb: 3 }} />
            <Typography variant="h3" sx={{ mb: 2 }}>
              {score.toFixed(0)}%
            </Typography>
            <Typography variant="h5" sx={{ mb: 4, color: score >= 70 ? '#4caf50' : '#f44336' }}>
              {score >= 70 ? 'Great Job!' : 'Needs Improvement'}
            </Typography>

            <Alert severity={score >= 70 ? 'success' : 'warning'} sx={{ mb: 3 }}>
              {score >= 70
                ? 'Your comprehension quiz shows a strong understanding of the material you submitted.'
                : 'Consider reviewing the assignment material. Your instructor may reach out for clarification.'}
            </Alert>

            <Typography variant="body1" sx={{ mb: 4 }}>
              You answered {questions.filter((q) => answers[q.id] === q.correctAnswer).length} out of{' '}
              {questions.length} questions correctly.
            </Typography>

            <Card sx={{ mb: 3, textAlign: 'left' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Question Review
                </Typography>
                {questions.map((q, index) => (
                  <Box key={q.id} sx={{ mb: 2, p: 2, bgcolor: '#f9f9f9', borderRadius: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Question {index + 1}: {q.question}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {answers[q.id] === q.correctAnswer ? (
                        <CheckCircle color="success" fontSize="small" />
                      ) : (
                        <Cancel color="error" fontSize="small" />
                      )}
                      <Typography variant="body2">
                        Your answer: {q.options[answers[q.id]] || 'Not answered'}
                      </Typography>
                    </Box>
                    {answers[q.id] !== q.correctAnswer && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Correct answer: {q.options[q.correctAnswer]}
                      </Typography>
                    )}
                  </Box>
                ))}
              </CardContent>
            </Card>

            <Button variant="contained" size="large" onClick={() => navigate('/student')}>
              Return to Dashboard
            </Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  const question = questions[currentQuestion];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <QuizIcon sx={{ mr: 2 }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Comprehension Quiz</Typography>
            <Typography variant="caption">
              Question {currentQuestion + 1} of {questions.length}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <LinearProgress variant="determinate" value={progress} />

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="info" sx={{ mb: 3 }}>
          This quiz helps verify your understanding of the assignment you just submitted. Answer based on
          the work you completed.
        </Alert>

        <Paper sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ mb: 3 }}>
            Question {currentQuestion + 1}
          </Typography>

          <FormControl component="fieldset" fullWidth>
            <FormLabel component="legend" sx={{ mb: 3, fontSize: '1.1rem' }}>
              {question.question}
            </FormLabel>
            <RadioGroup
              value={answers[question.id] !== undefined ? answers[question.id] : ''}
              onChange={(e) => handleAnswerChange(question.id, parseInt(e.target.value))}
            >
              {question.options.map((option, index) => (
                <FormControlLabel
                  key={index}
                  value={index}
                  control={<Radio />}
                  label={option}
                  sx={{
                    mb: 2,
                    p: 2,
                    borderRadius: 1,
                    border: '1px solid #e0e0e0',
                    '&:hover': { bgcolor: '#f5f5f5' },
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
            <Button
              variant="outlined"
              onClick={handlePrevious}
              disabled={currentQuestion === 0}
            >
              Previous
            </Button>
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={answers[question.id] === undefined}
            >
              {currentQuestion === questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
            </Button>
          </Box>
        </Paper>

        <Paper sx={{ p: 2, mt: 3, bgcolor: '#f9f9f9' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Quiz Progress
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {questions.map((q, index) => (
              <Box
                key={q.id}
                sx={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 1,
                  bgcolor:
                    answers[q.id] !== undefined
                      ? '#4caf50'
                      : index === currentQuestion
                      ? '#1976d2'
                      : '#e0e0e0',
                  color: answers[q.id] !== undefined || index === currentQuestion ? 'white' : 'black',
                }}
              >
                {index + 1}
              </Box>
            ))}
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
