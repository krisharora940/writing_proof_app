"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Autocomplete,
  Alert,
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Slider,
  Select,
  TextField,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Toolbar,
  Typography
} from "@mui/material";
import {
  AccessTime,
  AccountCircle,
  Add,
  ArrowBack,
  Assignment,
  AttachFile,
  Badge as BadgeIcon,
  Cancel,
  CheckCircle,
  Comment,
  ContentCopy,
  Delete,
  Edit,
  Email,
  ExpandLess,
  ExpandMore,
  Flag,
  FormatAlignCenter,
  FormatAlignLeft,
  FormatAlignRight,
  FormatBold,
  FormatItalic,
  FormatListBulleted,
  FormatListNumbered,
  FormatUnderlined,
  LibraryBooks,
  MenuBook,
  Pause,
  Person,
  PersonAdd,
  PlayArrow,
  Quiz as QuizIcon,
  Save,
  School,
  TrendingDown,
  TrendingUp,
  Upload,
  Visibility,
  VisibilityOff,
  Warning
} from "@mui/icons-material";
import { addDays, format, isSameDay } from "date-fns";
import { countWordDelta, countWords, getDiff, type Snapshot, type WritingEvent } from "@/lib/writing-events";
import type {
  AcceptClassInvitationResponse,
  AppendWritingEventBody,
  AssignmentRosterResponse,
  AssignmentSubmissionListResponse,
  ClassInvitationLookupResponse,
  CreateProfessorAssignmentResponse,
  CreateProfessorClassResponse,
  EnrollAssignmentStudentBody,
  InviteClassStudentsBody,
  InviteClassStudentsResponse,
  JoinClassByCodeBody,
  JoinClassByCodeResponse,
  LockSubmissionBody,
  PasswordResetConfirmBody,
  PasswordResetRequestBody,
  ProfessorAssignmentListResponse,
  ProfessorClassListResponse,
  ProfessorReportResponse,
  RemoveAssignmentStudentBody,
  SaveProfessorGradeBody,
  SaveProfessorGradeResponse,
  StudentAssignmentListResponse,
  StudentSessionResponse,
  TimedSummaryBody
} from "@/lib/server-boundaries";
import {
  DEFAULT_COMPREHENSION_QUESTIONS,
  DEFAULT_COMPREHENSION_TIME_LIMIT_MINUTES,
  MAX_COMPREHENSION_TIME_LIMIT_MINUTES,
  type ComprehensionCheckSettings
} from "@/lib/comprehension-check";
import type { AuthUser, UserRole } from "@/lib/persistence";

const ReactQuill = dynamic(async () => {
  const mod = await import("react-quill-new");
  const quill = mod.Quill as {
    import: (path: string) => { whitelist?: string[] };
    register: (target: unknown, overwrite?: boolean) => void;
  };
  const SizeStyle = quill.import("attributors/style/size");
  SizeStyle.whitelist = ["12px", "14px", "16px", "18px", "24px", "36px"];
  quill.register(SizeStyle, true);
  const FontClass = quill.import("formats/font");
  FontClass.whitelist = ["arial", "times-new-roman", "verdana", "georgia", "courier-new", "sans-serif"];
  quill.register(FontClass, true);
  return mod.default;
}, { ssr: false }) as any;

type PageKind = "landing" | "login" | "signup" | "forgot-password" | "reset-password" | "student" | "assignment" | "quiz" | "instructor" | "class" | "review" | "templates" | "invite";
type AccessState = "loading" | "authenticated" | "unauthenticated" | "forbidden" | "error";
type StudentAssignment = StudentAssignmentListResponse["assignments"][number];
type StudentClass = {
  id: string;
  name: string;
  assignmentCount: number;
  submittedCount: number;
};
type ProfessorAssignment = ProfessorAssignmentListResponse["assignments"][number];
type ProfessorClass = ProfessorClassListResponse["classes"][number];
type ProfessorSubmission = AssignmentSubmissionListResponse["submissions"][number];
type RosterStudent = AssignmentRosterResponse["students"][number];

type AuthorCheckAppProps = {
  page: PageKind;
  role?: UserRole;
  assignmentId?: string;
  sessionId?: string;
  invitationToken?: string;
  resetToken?: string;
  comprehensionTimeLimitMinutes?: number;
  comprehensionQuestions?: string[];
};

const studentBlue = "#1976d2";
const instructorGreen = "#2e7d32";

export function AuthorCheckApp({ page, role, assignmentId, sessionId, invitationToken, resetToken, comprehensionTimeLimitMinutes, comprehensionQuestions }: AuthorCheckAppProps) {
  if (page === "landing") return <LandingPage />;
  if (page === "login") return <LoginPage role={role ?? "student"} />;
  if (page === "signup") return <SignupPage />;
  if (page === "forgot-password") return <ForgotPasswordPage />;
  if (page === "reset-password") return <ResetPasswordPage token={resetToken} />;
  if (page === "invite") return <InvitationPage token={invitationToken} />;

  return (
    <RequireRole role={role ?? (page === "student" || page === "assignment" || page === "quiz" ? "student" : "professor")}>
      {(user) => {
        if (page === "student") return <StudentDashboard user={user} />;
        if (page === "assignment") return <AssignmentSubmission assignmentId={assignmentId} />;
        if (page === "quiz") return <ComprehensionQuiz sessionId={sessionId} timeLimitMinutes={comprehensionTimeLimitMinutes} questions={comprehensionQuestions} />;
        if (page === "class") return <ClassManagement assignmentId={assignmentId} />;
        if (page === "review") return <InstructorReview sessionId={sessionId} />;
        if (page === "templates") return <AssignmentTemplates />;
        return <InstructorDashboard user={user} />;
      }}
    </RequireRole>
  );
}

function LandingPage() {
  const router = useRouter();

  return (
    <Container maxWidth="md" sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Box sx={{ textAlign: "center", width: "100%" }}>
        <Typography variant="h2" sx={{ mb: 2, fontWeight: 700, color: studentBlue }}>
          DraftProof
        </Typography>
        <Typography variant="h5" sx={{ mb: 6, color: "#666" }}>
          Educational writing review with process evidence and comprehension checks
        </Typography>

        <Box sx={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
          <PortalCard
            icon={<Person sx={{ fontSize: 80, color: studentBlue, mb: 2 }} />}
            title="Student Portal"
            detail="Access assignments, submit work, and track your progress"
            button="Login as Student"
            color="primary"
            onClick={() => router.push("/login/student")}
          />
          <PortalCard
            icon={<School sx={{ fontSize: 80, color: instructorGreen, mb: 2 }} />}
            title="Instructor Portal"
            detail="Manage classes, review submissions, and open DraftProof reports"
            button="Login as Instructor"
            color="success"
            onClick={() => router.push("/login/instructor")}
          />
        </Box>
      </Box>
    </Container>
  );
}

function PortalCard(props: {
  icon: ReactNode;
  title: string;
  detail: string;
  button: string;
  color: "primary" | "success";
  onClick: () => void;
}) {
  return (
    <Card sx={{ width: 300, cursor: "pointer", transition: "transform 0.2s", "&:hover": { transform: "translateY(-4px)" } }} onClick={props.onClick}>
      <CardContent sx={{ textAlign: "center", py: 4 }}>
        {props.icon}
        <Typography variant="h5" sx={{ mb: 1 }}>{props.title}</Typography>
        <Typography variant="body2" color="text.secondary">{props.detail}</Typography>
        <Button variant="contained" color={props.color} sx={{ mt: 3 }} fullWidth>
          {props.button}
        </Button>
      </CardContent>
    </Card>
  );
}

function LoginPage({ role }: { role: UserRole }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isStudent = role === "student";
  const redirect = searchParams.get("redirect");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitLogin({ email, username: email, password });
  }

  async function submitLogin(credentials: { email?: string; username?: string; password: string }) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials)
      });
      const data = await response.json().catch(() => null) as { user?: AuthUser; error?: string } | null;
      if (!response.ok || !data?.user) throw new Error(data?.error || "Sign in failed.");
      if (data.user.role !== role) {
        await fetch("/api/auth/logout", { method: "POST" });
        throw new Error(`This is the ${formatRole(role).toLowerCase()} portal. Use a ${formatRole(role).toLowerCase()} account to continue.`);
      }
      router.push(redirect || (isStudent ? "/student" : "/professor"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", background: isStudent ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" }}>
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ p: 4, borderRadius: 3 }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Box sx={{ width: 80, height: 80, borderRadius: "50%", bgcolor: isStudent ? studentBlue : instructorGreen, display: "flex", alignItems: "center", justifyContent: "center", mx: "auto", mb: 2 }}>
              {isStudent ? <Person sx={{ fontSize: 50, color: "white" }} /> : <School sx={{ fontSize: 50, color: "white" }} />}
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              {isStudent ? "Student Login" : "Instructor Login"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isStudent ? "Access your courses and assignments" : "Manage classes, review submissions, and track progress"}
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>{error}</Alert>}

          <form onSubmit={handleLogin}>
            <TextField
              fullWidth
              label={isStudent ? "Student Email" : "Faculty Email"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={isStudent ? "student@university.edu" : "professor@university.edu"}
              sx={{ mb: 3 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{isStudent ? <School color="action" /> : <Email color="action" />}</InputAdornment> } }}
            />
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                  )
                }
              }}
            />
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
              <Box>
                <input type="checkbox" id="remember" />
                <label htmlFor="remember" style={{ marginLeft: 8, fontSize: "0.875rem" }}>Remember me</label>
              </Box>
              <Button
                variant="text"
                onClick={() => router.push("/forgot-password")}
                sx={{ minWidth: 0, p: 0, textTransform: "none", fontWeight: 600 }}
              >
                Forgot password?
              </Button>
            </Box>
            <Button type="submit" variant="contained" color={isStudent ? "primary" : "success"} fullWidth size="large" disabled={loading || !email || !password} sx={{ py: 1.5, fontWeight: 600, mb: 2 }}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <Divider sx={{ my: 3 }}><Typography variant="body2" color="text.secondary">OR</Typography></Divider>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {isStudent ? "Are you an instructor? " : "Are you a student? "}
              <Button variant="text" onClick={() => router.push(isStudent ? "/login/instructor" : "/login/student")} sx={{ textTransform: "none", fontWeight: 600 }}>
                Login here
              </Button>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Need a new account?{" "}
              <Button
                variant="text"
                onClick={() => router.push(`/signup?role=${role}${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""}`)}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Sign up
              </Button>
            </Typography>
            <Button variant="text" onClick={() => router.push("/")} sx={{ mt: 2, textTransform: "none", color: "text.secondary" }}>
              Back to Home
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const requestedRole = searchParams.get("role");
  const [role, setRole] = useState<UserRole>(requestedRole === "professor" ? "professor" : "student");
  const [form, setForm] = useState({
    displayName: "",
    email: searchParams.get("email") || "",
    password: "",
    inviteCode: ""
  });
  const [verificationCode, setVerificationCode] = useState("");
  const [step, setStep] = useState<"details" | "verify">("details");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const isStudent = role === "student";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(step === "details" ? "/api/auth/signup" : "/api/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(step === "details" ? {
          displayName: form.displayName,
          email: form.email,
          password: form.password,
          role,
          inviteCode: form.inviteCode || undefined
        } : {
          email: form.email,
          code: verificationCode
        })
      });
      const data = await response.json().catch(() => null) as {
        user?: AuthUser;
        error?: string;
        delivery?: "email" | "development";
        expiresInMinutes?: number;
        code?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error || "Sign up failed.");

      if (step === "details") {
        setStep("verify");
        setNotice(
          data?.delivery === "development" && data.code
            ? `Development code: ${data.code}`
            : `A verification code was sent to ${form.email}. It expires in ${data?.expiresInMinutes || 10} minutes.`
        );
        return;
      }

      if (!data?.user) throw new Error("Sign up failed.");
      router.push(redirect || (data.user.role === "student" ? "/student" : "/professor"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Sign up failed.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/signup/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email })
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        delivery?: "email" | "development";
        expiresInMinutes?: number;
        code?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error || "Unable to resend verification code.");
      setNotice(
        data?.delivery === "development" && data.code
          ? `Development code: ${data.code}`
          : `A new verification code was sent to ${form.email}. It expires in ${data?.expiresInMinutes || 10} minutes.`
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to resend verification code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", background: isStudent ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" }}>
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ p: 4, borderRadius: 3 }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Box sx={{ width: 80, height: 80, borderRadius: "50%", bgcolor: isStudent ? studentBlue : instructorGreen, display: "flex", alignItems: "center", justifyContent: "center", mx: "auto", mb: 2 }}>
              {isStudent ? <Person sx={{ fontSize: 50, color: "white" }} /> : <School sx={{ fontSize: 50, color: "white" }} />}
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              {step === "verify" ? "Verify Your Email" : isStudent ? "Student Sign Up" : "Instructor Sign Up"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {step === "verify"
                ? "Enter the 6-digit code sent from DraftProof <no-reply@draftproof.org>."
                : isStudent
                  ? "Create your DraftProof account to access assignments and writing sessions."
                  : "Create your DraftProof account to manage classes, reports, and review workflows."}
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>{error}</Alert>}
          {notice && <Alert severity="info" sx={{ mb: 3 }} onClose={() => setNotice("")}>{notice}</Alert>}

          <form onSubmit={submit}>
            <FormControl sx={{ width: "100%", mb: 3 }}>
              <FormLabel sx={{ mb: 1 }}>Account Type</FormLabel>
              <RadioGroup row value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                <FormControlLabel value="student" control={<Radio />} label="Student" disabled={step === "verify"} />
                <FormControlLabel value="professor" control={<Radio />} label="Instructor" disabled={step === "verify"} />
              </RadioGroup>
            </FormControl>

            {step === "details" ? (
              <>
                <TextField
                  fullWidth
                  label={isStudent ? "Student Name" : "Instructor Name"}
                  value={form.displayName}
                  onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                  sx={{ mb: 3 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><Person color="action" /></InputAdornment> } }}
                />
                <TextField
                  fullWidth
                  type="email"
                  label="Email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder={isStudent ? "student@university.edu" : "professor@university.edu"}
                  sx={{ mb: 3 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><Email color="action" /></InputAdornment> } }}
                />
                {isStudent && (
                  <TextField
                    fullWidth
                    label="Invite Code"
                    value={form.inviteCode}
                    onChange={(event) => setForm({ ...form, inviteCode: event.target.value })}
                    placeholder="Optional unless your school uses invite-only access"
                    sx={{ mb: 3 }}
                  />
                )}
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  helperText="At least 8 characters with 1 uppercase letter, 1 lowercase letter, and 1 number."
                  sx={{ mb: 2 }}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      )
                    }
                  }}
                />
              </>
            ) : (
              <>
                <TextField
                  fullWidth
                  type="email"
                  label="Email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  sx={{ mb: 3 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><Email color="action" /></InputAdornment> } }}
                />
                <TextField
                  fullWidth
                  label="Verification Code"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  sx={{ mb: 3 }}
                />
                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={form.password}
                  disabled
                  sx={{ mb: 2 }}
                />
              </>
            )}

            <Button
              type="submit"
              variant="contained"
              color={isStudent ? "primary" : "success"}
              fullWidth
              size="large"
              disabled={loading || (step === "details"
                ? !form.displayName.trim() || !form.email.trim() || !form.password.trim()
                : verificationCode.length !== 6)}
              sx={{ py: 1.5, fontWeight: 600, mb: 2 }}
            >
              {loading ? "Working..." : step === "verify" ? "Verify Email" : "Send Verification Code"}
            </Button>

            {step === "verify" && (
              <Button variant="outlined" color={isStudent ? "primary" : "success"} fullWidth size="large" onClick={() => void resendCode()} disabled={loading} sx={{ py: 1.5, mb: 2 }}>
                Resend Code
              </Button>
            )}
          </form>

          <Divider sx={{ my: 3 }}><Typography variant="body2" color="text.secondary">OR</Typography></Divider>
          <Box sx={{ textAlign: "center" }}>
            {step === "verify" ? (
              <Button
                variant="text"
                onClick={() => {
                  setStep("details");
                  setVerificationCode("");
                  setError("");
                  setNotice("");
                }}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Edit account details
              </Button>
            ) : null}
            <Typography variant="body2" color="text.secondary" sx={{ mt: step === "verify" ? 2 : 0 }}>
              Already have an account?{" "}
              <Button variant="text" onClick={() => router.push(`/login/${isStudent ? "student" : "instructor"}`)} sx={{ textTransform: "none", fontWeight: 600 }}>
                Sign in
              </Button>
            </Typography>
            <Button variant="text" onClick={() => router.push("/")} sx={{ mt: 2, textTransform: "none", color: "text.secondary" }}>
              Back to Home
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email } satisfies PasswordResetRequestBody)
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        delivery?: "email" | "development";
        expiresInMinutes?: number;
        token?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error || "Unable to request password reset.");
      setNotice(
        data?.delivery === "development" && data.token
          ? `Development reset token: ${data.token}`
          : "If that email has an account, a reset link has been sent."
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to request password reset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ p: 4, borderRadius: 3 }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Box sx={{ width: 80, height: 80, borderRadius: "50%", bgcolor: studentBlue, display: "flex", alignItems: "center", justifyContent: "center", mx: "auto", mb: 2 }}>
              <Email sx={{ fontSize: 44, color: "white" }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>Reset Password</Typography>
            <Typography variant="body2" color="text.secondary">
              Enter your account email and we&apos;ll send you a reset link.
            </Typography>
          </Box>
          {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>{error}</Alert>}
          {notice && <Alert severity="info" sx={{ mb: 3 }} onClose={() => setNotice("")}>{notice}</Alert>}
          <form onSubmit={submit}>
            <TextField
              fullWidth
              type="email"
              label="Account Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@school.edu"
              sx={{ mb: 3 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Email color="action" /></InputAdornment> } }}
            />
            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading || !email.trim()} sx={{ py: 1.5, fontWeight: 600, mb: 2 }}>
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
          <Box sx={{ textAlign: "center" }}>
            <Button variant="text" onClick={() => router.push("/login/student")} sx={{ textTransform: "none", fontWeight: 600 }}>
              Back to Sign In
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

function ResetPasswordPage({ token }: { token?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Password reset link is invalid.");
      setLoading(false);
      return;
    }
    fetch(`/api/auth/password-reset/${token}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) throw new Error(data?.error || "Password reset link is invalid.");
        setNotice("Choose a new password for your account.");
      })
      .catch((nextError) => setError(readError(nextError)))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/auth/password-reset/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password } satisfies PasswordResetConfirmBody)
      });
      const data = await response.json().catch(() => null) as { user?: AuthUser; error?: string } | null;
      if (!response.ok || !data?.user) throw new Error(data?.error || "Unable to reset password.");
      router.push(data.user.role === "student" ? "/student" : "/professor");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to reset password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ p: 4, borderRadius: 3 }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Box sx={{ width: 80, height: 80, borderRadius: "50%", bgcolor: studentBlue, display: "flex", alignItems: "center", justifyContent: "center", mx: "auto", mb: 2 }}>
              <Visibility sx={{ fontSize: 44, color: "white" }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>Choose New Password</Typography>
            <Typography variant="body2" color="text.secondary">
              Use at least 8 characters with 1 uppercase letter, 1 lowercase letter, and 1 number.
            </Typography>
          </Box>
          {loading && <LinearProgress sx={{ mb: 3 }} />}
          {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>{error}</Alert>}
          {!error && notice && <Alert severity="info" sx={{ mb: 3 }}>{notice}</Alert>}
          {!loading && !error && (
            <form onSubmit={submit}>
              <TextField
                fullWidth
                label="New Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                sx={{ mb: 3 }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
              />
              <TextField
                fullWidth
                label="Confirm Password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                sx={{ mb: 3 }}
              />
              <Button type="submit" variant="contained" fullWidth size="large" disabled={saving || !password || !confirmPassword} sx={{ py: 1.5, fontWeight: 600 }}>
                {saving ? "Updating..." : "Update Password"}
              </Button>
            </form>
          )}
        </Paper>
      </Container>
    </Box>
  );
}

function RequireRole({ role, children }: { role: UserRole; children: (user: AuthUser) => ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AccessState>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then(async (response) => {
        const data = await response.json().catch(() => null) as { user?: AuthUser; error?: string } | null;
        if (!alive) return;
        if (!response.ok || !data?.user) {
          setState("unauthenticated");
          setMessage("Sign in is required to continue.");
          return;
        }
        if (data.user.role !== role) {
          setUser(data.user);
          setState("forbidden");
          setMessage(`This is the ${formatRole(role).toLowerCase()} portal. Sign out and use a ${formatRole(role).toLowerCase()} account to continue.`);
          return;
        }
        setUser(data.user);
        setState("authenticated");
      })
      .catch(() => {
        if (!alive) return;
        setState("error");
        setMessage("Unable to verify your session.");
      });
    return () => { alive = false; };
  }, [role]);

  if (state === "loading") return <FullPageMessage title="Loading DraftProof" detail="Checking your secure session." />;
  if (state !== "authenticated" || !user) {
    return (
      <FullPageMessage
        title={state === "forbidden" ? "Wrong Portal" : "Sign In Required"}
        detail={message}
        action={
          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
            <Button variant="contained" onClick={() => router.push(`/login/${role === "professor" ? "instructor" : "student"}`)}>Open {formatRole(role)} Login</Button>
            {state === "forbidden" && <Button variant="outlined" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push(`/login/${role === "professor" ? "instructor" : "student"}`); }}>Sign Out</Button>}
          </Box>
        }
      />
    );
  }
  return children(user);
}

function StudentDashboard({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [classes, setClasses] = useState<StudentAssignmentListResponse["classes"]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const loadAssignments = useCallback(() => {
    setLoading(true);
    return loadJson<StudentAssignmentListResponse>("/api/assignments")
      .then((data) => {
        setAssignments(data.assignments);
        setClasses(data.classes);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAssignments()
      .catch((nextError) => setError(readError(nextError)));
  }, [loadAssignments]);

  async function joinClass() {
    setError("");
    setNotice("");
    try {
      const joined = await postJson<JoinClassByCodeResponse>("/api/student/classes/join", { code: joinCode } satisfies JoinClassByCodeBody);
      setJoinCode("");
      setNotice(`Joined ${joined.class.name}. ${joined.assignmentsAdded ? `${joined.assignmentsAdded} assignment${joined.assignmentsAdded === 1 ? "" : "s"} added.` : "Assignments will appear when your instructor publishes them."}`);
      await loadAssignments();
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  const nextSevenDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(new Date(), index)), []);
  const datedAssignments = assignments.filter((assignment) => assignment.dueAt);
  const assignmentsForDate = (date: Date) => datedAssignments.filter((assignment) => isSameDay(new Date(assignment.dueAt || 0), date));
  const upcoming = [...assignments].sort((a, b) => (a.dueAt || Number.MAX_SAFE_INTEGER) - (b.dueAt || Number.MAX_SAFE_INTEGER)).slice(0, 4);
  return (
    <DashboardShell color="primary" title="DraftProof - Student Dashboard" user={user}>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setNotice("")}>{notice}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 3 }}>
          <Box>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" sx={{ mb: 3, display: "flex", alignItems: "center", gap: 1 }}><Assignment /> Quick Actions</Typography>
              {loading ? <LinearProgress /> : (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                  {upcoming.slice(0, 2).map((assignment) => {
                    return (
                      <Card key={assignment.id} sx={{ cursor: "pointer", "&:hover": { transform: "translateY(-2px)", boxShadow: 3 } }} onClick={() => router.push(`/student/assignment/${assignment.id}`)}>
                        <CardContent>
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                            <Chip label="DraftProof" size="small" color="primary" />
                          </Box>
                          <Typography variant="h6" sx={{ mb: 1 }}>{assignment.title}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <AccessTime fontSize="small" /> {assignment.dueAt ? `Due ${format(new Date(assignment.dueAt), "MMM d, h:mm a")}` : "No due date"}
                          </Typography>
                          <Button variant="contained" size="small" sx={{ mt: 2 }} fullWidth>
                            {assignment.submittedAt ? "View Submission" : "Start Assignment"}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              )}
            </Paper>

            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" sx={{ mb: 3 }}>Calendar - Due Dates</Typography>
              <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 2 }}>
                {nextSevenDays.map((date) => {
                  const count = assignmentsForDate(date).length;
                  const conflict = count > 1;
                  return (
                    <Card key={date.toISOString()} sx={{ minWidth: 120, cursor: "pointer", border: conflict ? "2px solid #ff9800" : isSameDay(date, selectedDate) ? `2px solid ${studentBlue}` : "none", bgcolor: isSameDay(date, selectedDate) ? "#e3f2fd" : "white" }} onClick={() => setSelectedDate(date)}>
                      <CardContent sx={{ textAlign: "center", p: 2 }}>
                        <Typography variant="caption" color="text.secondary">{format(date, "EEE")}</Typography>
                        <Typography variant="h5">{format(date, "d")}</Typography>
                        <Badge badgeContent={count} color={conflict ? "warning" : "primary"} sx={{ mt: 1 }}><Assignment /></Badge>
                        {conflict && <Chip label="Conflict" size="small" color="warning" sx={{ mt: 1 }} />}
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
              <Typography variant="h6" sx={{ my: 2 }}>Assignments on {format(selectedDate, "MMMM d, yyyy")}</Typography>
              <List>
                {assignmentsForDate(selectedDate).map((assignment) => (
                  <ListItem key={assignment.id} sx={{ bgcolor: "white", mb: 1, borderRadius: 1, cursor: "pointer" }} onClick={() => router.push(`/student/assignment/${assignment.id}`)}>
                    <ListItemText primary={assignment.title} secondary={assignment.dueAt ? `Due ${format(new Date(assignment.dueAt), "h:mm a")}` : "No due date"} />
                    <Chip label={statusLabel(assignment.status)} size="small" color={assignment.submittedAt ? "success" : "default"} />
                  </ListItem>
                ))}
                {!assignmentsForDate(selectedDate).length && <Typography variant="body2" color="text.secondary">No assignments due on this date</Typography>}
              </List>
            </Paper>
          </Box>

          <Paper sx={{ p: 3, alignSelf: "start" }}>
            <Typography variant="h5" sx={{ mb: 2 }}>Join a Class</Typography>
            <TextField
              fullWidth
              label="Class Code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Enter your instructor's code"
              sx={{ mb: 2 }}
            />
            <Button variant="contained" fullWidth sx={{ mb: 3 }} onClick={() => void joinClass()} disabled={!joinCode.trim()}>
              Join by Code
            </Button>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="h5" sx={{ mb: 3 }}>My Classes</Typography>
            {classes.map((classroom, index) => (
              <Card key={classroom.id} sx={{ mb: 2, "&:hover": { boxShadow: 3 } }}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Avatar sx={{ bgcolor: classColor(index), width: 32, height: 32 }}>{classroom.name[0]}</Avatar>
                      <Box>
                        <Typography variant="subtitle1">{classroom.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{classroom.assignmentCount} assignment{classroom.assignmentCount === 1 ? "" : "s"}</Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary">Progress</Typography>
                  <LinearProgress variant="determinate" value={classroom.assignmentCount ? Math.round((classroom.submittedCount / classroom.assignmentCount) * 100) : 0} sx={{ height: 8, borderRadius: 4, mt: 1 }} />
                </CardContent>
              </Card>
            ))}
            {!classes.length && <Typography variant="body2" color="text.secondary">You haven&apos;t joined any classes yet.</Typography>}
          </Paper>
        </Box>
      </Container>
    </DashboardShell>
  );
}

function AssignmentSubmission({ assignmentId }: { assignmentId?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<StudentSessionResponse | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [error, setError] = useState("");
  const lastTextRef = useRef("");
  const lastInputAtRef = useRef<number | null>(null);
  const pendingEventsRef = useRef<Array<Omit<WritingEvent, "id">>>([]);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const saveCycleMs = 15_000;
  const plainTextContent = useMemo(() => editorHtmlToPlainText(content), [content]);

  useEffect(() => {
    const query = assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : "";
    loadJson<StudentSessionResponse>(`/api/assignments/current${query}`)
      .then((data) => {
        const initialText = data.paperText || data.submittedText || "";
        setSession(data);
        setContent(plainTextToEditorHtml(initialText));
        setTitle(data.assignment.title);
        lastTextRef.current = initialText;
      })
      .catch((nextError) => setError(readError(nextError)));
  }, [assignmentId]);

  const flushPendingEvents = useCallback(async () => {
    if (!session || session.session.lockedAt || !pendingEventsRef.current.length) return;
    if (flushPromiseRef.current) return flushPromiseRef.current;

    const run = (async () => {
      const events = pendingEventsRef.current.splice(0, pendingEventsRef.current.length);
      if (!events.length) return;
      setAutoSaveStatus("saving");
      try {
        for (const event of events) {
          await postJson("/api/writing-events", { sessionId: session.session.id, event } satisfies AppendWritingEventBody);
        }
        setAutoSaveStatus(pendingEventsRef.current.length ? "unsaved" : "saved");
      } catch {
        pendingEventsRef.current.unshift(...events);
        setAutoSaveStatus("unsaved");
      }
    })();

    flushPromiseRef.current = run.finally(() => {
      flushPromiseRef.current = null;
    });
    return flushPromiseRef.current;
  }, [session]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void flushPendingEvents();
    }, saveCycleMs);
    return () => {
      window.clearInterval(interval);
      void flushPendingEvents();
    };
  }, [flushPendingEvents]);

  async function recordChange(nextContent: string, inputType: string) {
    if (!session || session.session.lockedAt) return;
    const previous = lastTextRef.current;
    const diff = getDiff(previous, nextContent);
    if (!diff.added && !diff.removed) return;
    const wordDelta = countWordDelta(previous, nextContent);
    const now = Date.now();
    const eventType: WritingEvent["type"] = inputType === "insertFromPaste" || countWords(diff.added) >= 40 ? "paste" : diff.removed.length > diff.added.length ? "delete" : "insert";
    const event: Omit<WritingEvent, "id"> = {
      type: eventType,
      at: now,
      inputType,
      start: diff.start,
      added: diff.added,
      removed: diff.removed,
      addedWords: wordDelta.addedWords,
      removedWords: wordDelta.removedWords,
      pasteWords: eventType === "paste" ? wordDelta.addedWords : undefined,
      deletionEvent: !!diff.removed,
      removedCharacters: diff.removed.length,
      words: countWords(nextContent),
      durationSincePreviousMs: lastInputAtRef.current ? now - lastInputAtRef.current : 0
    };
    lastInputAtRef.current = now;
    lastTextRef.current = nextContent;
    pendingEventsRef.current.push(event);
    setAutoSaveStatus("unsaved");
  }

  async function confirmSubmission() {
    if (!session) return;
    const at = Date.now();
    const snapshot: Snapshot = { at, text: plainTextContent };
    const comprehensionCheck = session.assignment.comprehensionCheck;
    setError("");
    try {
      await flushPendingEvents();
      await postJson("/api/submissions/lock", { sessionId: session.session.id, submittedText: plainTextContent, snapshot } satisfies LockSubmissionBody);
      setShowReviewDialog(false);
      setShowConfirmDialog(true);
      if (comprehensionCheck.enabled) {
        const params = new URLSearchParams();
        params.set("minutes", String(comprehensionCheck.timeLimitMinutes));
        comprehensionCheck.questions.forEach((question) => params.append("question", question));
        setTimeout(() => router.push(`/student/quiz/${session.session.id}?${params.toString()}`), 1200);
      } else {
        setTimeout(() => router.push("/student"), 1200);
      }
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  if (!session && !error) return <FullPageMessage title="Loading Assignment" detail="Preparing the DraftProof editor." />;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => router.push("/student")}><ArrowBack /></IconButton>
          <Box sx={{ flexGrow: 1, ml: 2 }}>
            <Typography variant="h6">{session?.assignment.title || "Assignment"}</Typography>
            <Typography variant="caption">DraftProof writing workspace</Typography>
          </Box>
          <Chip icon={autoSaveStatus === "saved" ? <CheckCircle /> : <Save />} label={autoSaveStatus === "saved" ? "Saved" : autoSaveStatus === "saving" ? "Saving..." : "Unsaved"} color={autoSaveStatus === "saved" ? "success" : "default"} sx={{ mr: 2 }} />
          <Typography variant="body2">{countWords(plainTextContent)} words | {plainTextContent.length} characters</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Assignment Instructions</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Due: {session?.assignment ? "See course calendar" : "Loading"} | Final submission locks editing
          </Alert>
          <Typography variant="body1">{session?.assignment.prompt}</Typography>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ mb: 3 }}>Your Submission</Typography>
          <TextField fullWidth label="Submission Title" value={title} onChange={(event) => setTitle(event.target.value)} sx={{ mb: 3 }} />
          <WritingRichTextEditor
            value={content}
            disabled={!!session?.session.lockedAt}
            onChange={(nextHtml, nextPlainText, inputType) => {
              setContent(nextHtml);
              if (inputType === "sync") return;
              setAutoSaveStatus("unsaved");
              void recordChange(nextPlainText, inputType);
            }}
          />
          <Box sx={{ mt: 2, mb: 3 }}>
            <Button component="label" startIcon={<Upload />} size="small" variant="outlined">
              Attach Files
              <input type="file" hidden multiple onChange={(event) => setAttachments([...attachments, ...Array.from(event.target.files || [])])} />
            </Button>
          </Box>
          {attachments.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>Attachments ({attachments.length})</Typography>
              <List dense>{attachments.map((file, index) => (
                <ListItem key={`${file.name}-${index}`} secondaryAction={<IconButton edge="end" onClick={() => setAttachments(attachments.filter((_, itemIndex) => itemIndex !== index))}><Delete /></IconButton>}>
                  <ListItemIcon><AttachFile /></ListItemIcon>
                  <ListItemText primary={file.name} secondary={`${(file.size / 1024).toFixed(2)} KB`} />
                </ListItem>
              ))}</List>
            </Paper>
          )}
          <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
            <Button variant="outlined" onClick={() => router.push("/student")}>Save Draft</Button>
            <Button variant="contained" onClick={() => setShowReviewDialog(true)} disabled={!plainTextContent.trim() || !!session?.session.lockedAt}>Submit Assignment</Button>
          </Box>
        </Paper>
      </Container>

      <Dialog open={showReviewDialog} onClose={() => setShowReviewDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Review Your Submission</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 3 }}>Please review your submission carefully. Once submitted, you cannot make changes.</Alert>
          <Typography variant="h6" sx={{ mb: 1 }}>Title</Typography>
          <Typography sx={{ mb: 3, p: 2, bgcolor: "#f5f5f5", borderRadius: 1 }}>{title}</Typography>
          <Typography variant="h6" sx={{ mb: 1 }}>Content</Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 3, maxHeight: 300, overflow: "auto" }}>
            <Box dangerouslySetInnerHTML={{ __html: content }} />
          </Paper>
          <Typography variant="body2">Words: {countWords(plainTextContent)}</Typography>
          <Typography variant="body2">Characters: {plainTextContent.length}</Typography>
          <Typography variant="body2">Attachments: {attachments.length}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowReviewDialog(false)}>Go Back</Button>
          <Button variant="contained" onClick={confirmSubmission}>Confirm Submission</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showConfirmDialog}>
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <CheckCircle sx={{ fontSize: 80, color: "#4caf50", mb: 2 }} />
          <Typography variant="h5" sx={{ mb: 2 }}>Submission Successful</Typography>
          <Typography color="text.secondary">
            {session?.assignment.comprehensionCheck.enabled
              ? "Your assignment was submitted. The comprehension check opens next."
              : "Your assignment was submitted successfully."}
          </Typography>
          <LinearProgress sx={{ mt: 3 }} />
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function ComprehensionQuiz({
  sessionId,
  timeLimitMinutes = DEFAULT_COMPREHENSION_TIME_LIMIT_MINUTES,
  questions = [...DEFAULT_COMPREHENSION_QUESTIONS]
}: {
  sessionId?: string;
  timeLimitMinutes?: number;
  questions?: string[];
}) {
  const router = useRouter();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(timeLimitMinutes * 60);
  const finishedRef = useRef(false);
  const startedAtRef = useRef(Date.now());
  const activeQuestions = useMemo(() => questions.slice(0, 3), [questions]);

  async function finishQuiz() {
    if (!sessionId || finishedRef.current) return;
    finishedRef.current = true;
    const responses = activeQuestions.map((question, index) => ({
      question,
      answer: answers[index]?.trim() || ""
    }));
    const summaryText = responses.map((response) => response.answer).filter(Boolean).join("\n\n");
    try {
      await postJson("/api/timed-summaries", {
        sessionId,
        startedAt: startedAtRef.current,
        completedAt: Date.now(),
        summaryText,
        responses
      } satisfies TimedSummaryBody);
      setShowResults(true);
    } catch (nextError) {
      setError(readError(nextError));
      setShowResults(true);
    }
  }

  useEffect(() => {
    if (showResults) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          void finishQuiz();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeQuestions, answers, sessionId, showResults]);

  if (showResults) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
        <AppBar position="static" elevation={0}><Toolbar><QuizIcon sx={{ mr: 2 }} /><Typography variant="h6">Comprehension Check Results</Typography></Toolbar></AppBar>
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Paper sx={{ p: 4, textAlign: "center" }}>
            <CheckCircle sx={{ fontSize: 100, color: "#4caf50", mb: 3 }} />
            <Typography variant="h4" sx={{ mb: 2 }}>Responses Submitted</Typography>
            {error ? <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert> : <Alert severity="success" sx={{ mb: 3 }}>Your comprehension responses were stored for instructor review.</Alert>}
            <Button variant="contained" size="large" onClick={() => router.push("/student")}>Return to Dashboard</Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <AppBar position="static" elevation={0}><Toolbar><QuizIcon sx={{ mr: 2 }} /><Box sx={{ flexGrow: 1 }}><Typography variant="h6">Comprehension Check</Typography><Typography variant="caption">Question {currentQuestion + 1} of {activeQuestions.length} · {timeLimitMinutes} minute limit</Typography></Box><Chip label={`${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`} color={remainingSeconds <= 60 ? "warning" : "default"} /></Toolbar></AppBar>
      <LinearProgress variant="determinate" value={((currentQuestion + 1) / activeQuestions.length) * 100} />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="info" sx={{ mb: 3 }}>Answer from memory based on the work you just submitted.</Alert>
        <Paper sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ mb: 3 }}>Question {currentQuestion + 1}</Typography>
          <TextField fullWidth multiline minRows={6} label={activeQuestions[currentQuestion]} value={answers[currentQuestion] || ""} onChange={(event) => setAnswers({ ...answers, [currentQuestion]: event.target.value })} />
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
            <Button variant="outlined" onClick={() => setCurrentQuestion(currentQuestion - 1)} disabled={currentQuestion === 0}>Previous</Button>
            <Button variant="contained" onClick={() => currentQuestion === activeQuestions.length - 1 ? void finishQuiz() : setCurrentQuestion(currentQuestion + 1)} disabled={!answers[currentQuestion]?.trim()}>
              {currentQuestion === activeQuestions.length - 1 ? "Finish Check" : "Next Question"}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

function InstructorDashboard({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState(0);
  const [assignments, setAssignments] = useState<ProfessorAssignment[]>([]);
  const [classes, setClasses] = useState<ProfessorClass[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [submissions, setSubmissions] = useState<ProfessorSubmission[]>([]);
  const [reports, setReports] = useState<Record<string, ProfessorReportResponse>>({});
  const [createClassOpen, setCreateClassOpen] = useState(false);
  const [createClassLoading, setCreateClassLoading] = useState(false);
  const [classForm, setClassForm] = useState({ name: "" });
  const [error, setError] = useState("");

  const loadAssignments = useCallback(() => {
    return loadJson<ProfessorAssignmentListResponse>("/api/professor/assignments")
      .then((data) => {
        setAssignments(data.assignments);
        return data.assignments;
      });
  }, []);

  const loadClasses = useCallback(() => {
    return loadJson<ProfessorClassListResponse>("/api/professor/classes")
      .then((data) => {
        setClasses(data.classes);
        setSelectedClassId((current) => current || data.classes[0]?.id || "");
        return data.classes;
      });
  }, []);

  useEffect(() => {
    Promise.all([loadAssignments(), loadClasses()])
      .catch((nextError) => setError(readError(nextError)));
  }, [loadAssignments, loadClasses]);

  useEffect(() => {
    if (!selectedAssignmentId) {
      setSubmissions([]);
      setReports({});
      return;
    }
    loadJson<AssignmentSubmissionListResponse>(`/api/assignments/${selectedAssignmentId}/submissions`)
      .then((data) => {
        setSubmissions(data.submissions);
        return Promise.all(data.submissions.filter((submission) => submission.sessionId).map(async (submission) => {
          const report = await loadJson<ProfessorReportResponse>(`/api/reports/${submission.sessionId}`);
          return [submission.sessionId, report] as const;
        }));
      })
      .then((items) => setReports(Object.fromEntries(items)))
      .catch((nextError) => setError(readError(nextError)));
  }, [selectedAssignmentId]);

  const selectedClassAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.classId === selectedClassId),
    [assignments, selectedClassId]
  );
  const selectedClass = classes.find((classroom) => classroom.id === selectedClassId);
  const selectedAssignment = assignments.find((assignment) => assignment.id === selectedAssignmentId);
  const visibleSubmissions = selectedTab === 0
    ? submissions.filter((submission) => submission.submittedAt && !submission.gradedAt)
    : selectedTab === 2
      ? submissions.filter((submission) => submission.sessionId && reports[submission.sessionId]?.authorCheck.assessmentLabel === "Review Recommended")
      : submissions;

  useEffect(() => {
    if (!selectedClassId) {
      setSelectedAssignmentId("");
      return;
    }
    if (selectedClassAssignments.some((assignment) => assignment.id === selectedAssignmentId)) return;
    setSelectedAssignmentId(selectedClassAssignments[0]?.id || "");
  }, [selectedAssignmentId, selectedClassAssignments, selectedClassId]);

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const className = classForm.name.trim();
    if (!className) return;

    setCreateClassLoading(true);
    setError("");
    try {
      const created = await postJson<CreateProfessorClassResponse>("/api/professor/classes", {
        name: className
      });
      setClassForm({ name: "" });
      setCreateClassOpen(false);
      const nextClasses = await loadClasses();
      setSelectedClassId(created.class.id || nextClasses[0]?.id || "");
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setCreateClassLoading(false);
    }
  }

  return (
    <DashboardShell color="success" title="DraftProof - Instructor Dashboard" user={user}>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 3 }}>
          <Paper>
            <Tabs value={selectedTab} onChange={(_, value) => setSelectedTab(value)} sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Tab icon={<Flag />} label="Pending Reviews" iconPosition="start" />
              <Tab icon={<CheckCircle />} label="All Submissions" iconPosition="start" />
              <Tab icon={<Warning />} label="Review Recommended" iconPosition="start" />
            </Tabs>
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, gap: 2, flexWrap: "wrap" }}>
                <Box>
                  <Typography variant="h5">{selectedClass?.name || "Submissions Requiring Review"}</Typography>
                </Box>
                <Chip label={`${visibleSubmissions.length} shown`} color="primary" />
              </Box>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Assignments</Typography>
                {selectedClassAssignments.length ? (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {selectedClassAssignments.map((assignment) => (
                      <Button
                        key={assignment.id}
                        variant={assignment.id === selectedAssignmentId ? "contained" : "outlined"}
                        color="success"
                        size="small"
                        onClick={() => setSelectedAssignmentId(assignment.id)}
                      >
                        {assignment.title}
                      </Button>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">No assignments have been created for this class.</Typography>
                )}
                {selectedAssignment && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.75 }}>{selectedAssignment.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{selectedAssignment.prompt}</Typography>
                  </Box>
                )}
              </Box>
              <TableContainer>
                <Table>
                  <TableHead><TableRow><TableCell>Student</TableCell><TableCell>Status</TableCell><TableCell>Submitted</TableCell><TableCell>Assessment</TableCell><TableCell>Support</TableCell><TableCell>Atypicality</TableCell><TableCell>Action</TableCell></TableRow></TableHead>
                  <TableBody>
                    {visibleSubmissions.map((submission) => {
                      const report = submission.sessionId ? reports[submission.sessionId] : null;
                      return (
                        <TableRow key={submission.studentId} sx={{ bgcolor: report?.authorCheck.assessmentLabel === "Review Recommended" ? "#fff7ed" : "white" }}>
                          <TableCell><Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Avatar sx={{ width: 32, height: 32 }}>{submission.studentName[0]}</Avatar>{submission.studentName}</Box></TableCell>
                          <TableCell>{statusLabel(submission.status)}</TableCell>
                          <TableCell>{submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "Not submitted"}</TableCell>
                          <TableCell>{report ? <AssessmentChip label={report.authorCheck.assessmentLabel} /> : <Chip label="Pending" size="small" />}</TableCell>
                          <TableCell>{report ? <ProcessIndicatorBar value={report.authorCheck.processSupportScore} tone="support" /> : "..."}</TableCell>
                          <TableCell>{report ? <ProcessIndicatorBar value={report.authorCheck.processAtypicalityScore} tone="atypicality" /> : "..."}</TableCell>
                          <TableCell>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                              {submission.gradedAt && <Chip label={`Graded ${submission.gradePercent}%`} color="success" size="small" />}
                              <Button variant="contained" size="small" disabled={!submission.sessionId} onClick={() => router.push(`/professor/submissions/${submission.sessionId}?assignmentId=${selectedAssignmentId}`)}>Review</Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>

          <Box>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" sx={{ mb: 3 }}>My Classes</Typography>
              {classes.map((classroom, index) => (
                <Card key={classroom.id} sx={{ mb: 2, cursor: "pointer", border: classroom.id === selectedClassId ? `2px solid ${instructorGreen}` : "none" }} onClick={() => setSelectedClassId(classroom.id)}>
                  <CardContent>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                      <Avatar sx={{ bgcolor: classColor(index), width: 32, height: 32 }}>{classroom.name[0]}</Avatar>
                      <Box>
                        <Typography variant="subtitle1">{classroom.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{classroom.studentCount} student{classroom.studentCount === 1 ? "" : "s"} | Code {classroom.joinCode}</Typography>
                      </Box>
                    </Box>
                    <Button size="small" startIcon={<PersonAdd />} onClick={(event) => { event.stopPropagation(); router.push(`/professor/class/${classroom.id}`); }}>Manage Class</Button>
                  </CardContent>
                </Card>
              ))}
              {!classes.length && <Typography variant="body2" color="text.secondary">Create a class to generate a join code and invite students.</Typography>}
            </Paper>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2 }}>Quick Actions</Typography>
              <Button variant="contained" color="success" startIcon={<Add />} fullWidth sx={{ mb: 2 }} onClick={() => router.push(selectedClassId ? `/professor/templates?classId=${encodeURIComponent(selectedClassId)}` : "/professor/templates")}>Assignment</Button>
              <Button variant="outlined" color="success" startIcon={<School />} fullWidth sx={{ mb: 2 }} onClick={() => setCreateClassOpen(true)}>Create Class</Button>
              <Button variant="outlined" color="success" startIcon={<LibraryBooks />} fullWidth onClick={() => selectedClassId && router.push(`/professor/class/${selectedClassId}`)}>Class Management</Button>
            </Paper>
          </Box>
        </Box>
      </Container>
      <Dialog open={createClassOpen} onClose={() => !createClassLoading && setCreateClassOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={createClass}>
          <DialogTitle>Create Class</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Class name"
              value={classForm.name}
              onChange={(event) => setClassForm({ ...classForm, name: event.target.value })}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateClassOpen(false)} disabled={createClassLoading}>Cancel</Button>
            <Button type="submit" variant="contained" color="success" disabled={!classForm.name.trim() || createClassLoading}>Create Class</Button>
          </DialogActions>
        </form>
      </Dialog>
    </DashboardShell>
  );
}

function InstructorReview({ sessionId }: { sessionId?: string }) {
  const router = useRouter();
  const [report, setReport] = useState<ProfessorReportResponse | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [comments, setComments] = useState<Array<{ lineNumber: number; text: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [gradePercent, setGradePercent] = useState(0);
  const [savedGrade, setSavedGrade] = useState<number | null>(null);
  const [gradeSaving, setGradeSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);
  const [showPlayback, setShowPlayback] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    loadJson<ProfessorReportResponse>(`/api/reports/${sessionId}`)
      .then(setReport)
      .catch((nextError) => setError(readError(nextError)));
  }, [sessionId]);

  useEffect(() => {
    setCurrentFrameIndex(0);
    setIsReplayPlaying(false);
  }, [report?.frames.length]);

  useEffect(() => {
    if (!report?.frames.length || !isReplayPlaying) return;
    if (currentFrameIndex >= report.frames.length - 1) {
      setIsReplayPlaying(false);
      return;
    }
    const currentFrame = report.frames[currentFrameIndex];
    const nextFrame = report.frames[currentFrameIndex + 1];
    const actualDelayMs = Math.max(0, nextFrame.at - currentFrame.at);
    const timer = window.setTimeout(() => {
      setCurrentFrameIndex((current) => Math.min(current + 1, report.frames.length - 1));
    }, replayDelayMs(actualDelayMs, replaySpeed));
    return () => window.clearTimeout(timer);
  }, [currentFrameIndex, isReplayPlaying, replaySpeed, report?.frames.length]);

  const lines = (report?.submittedText || "").split("\n");
  const gradeChanged = savedGrade !== null && savedGrade !== gradePercent;
  const replayFrame = report?.frames[currentFrameIndex] || null;

  async function saveGrade() {
    if (!sessionId) return;
    setGradeSaving(true);
    setError("");
    try {
      const body: SaveProfessorGradeBody = {
        gradePercent,
        comments
      };
      const saved = await postJson<SaveProfessorGradeResponse>(`/api/reports/${sessionId}/grade`, body);
      setSavedGrade(saved.gradePercent);
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setGradeSaving(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <AppBar position="static" elevation={0} color="success">
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => router.push("/professor")}><ArrowBack /></IconButton>
          <Box sx={{ flexGrow: 1, ml: 2 }}>
            <Typography variant="h6">Submission Review</Typography>
            <Typography variant="caption">DraftProof report and grading workspace</Typography>
          </Box>
          {report && <AssessmentChip label={report.authorCheck.assessmentLabel} />}
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {!report ? <LinearProgress /> : (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Paper sx={{ p: 3, height: "70vh", overflow: "auto" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Typography variant="h6">Student Submission</Typography>
                  <Chip label={`${countWords(report.submittedText)} words`} />
                </Box>
                <Alert severity={report.summaryText ? "info" : "warning"} sx={{ mb: 2 }}>
                  {report.summaryText ? "Timed comprehension response is available in the right panel." : "Timed comprehension response has not been submitted."}
                </Alert>
                <Card sx={{ mb: 3, bgcolor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
                      <Typography variant="subtitle1">Writing Playback</Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Chip
                          size="small"
                          label={replayFrame ? `${currentFrameIndex + 1} / ${report.frames.length} · ${replayFrame.label}` : "No replay data"}
                        />
                        <Button
                          size="small"
                          variant="text"
                          endIcon={showPlayback ? <ExpandLess /> : <ExpandMore />}
                          onClick={() => setShowPlayback((current) => !current)}
                        >
                          {showPlayback ? "Hide" : "Show"}
                        </Button>
                      </Box>
                    </Box>
                    <Collapse in={showPlayback}>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 2, flexWrap: "wrap" }}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={isReplayPlaying ? <Pause /> : <PlayArrow />}
                          onClick={() => setIsReplayPlaying((current) => !current)}
                          disabled={!report.frames.length}
                        >
                          {isReplayPlaying ? "Pause" : "Play"}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setIsReplayPlaying(false);
                            setCurrentFrameIndex(0);
                          }}
                          disabled={!report.frames.length}
                        >
                          Restart
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setReplaySpeed((current) => current === 1 ? 2 : current === 2 ? 4 : 1)}
                          disabled={!report.frames.length}
                        >
                          {replaySpeed}x
                        </Button>
                        <Typography variant="caption" color="text.secondary">
                          {replayFrame ? formatReplayFrameTime(replayFrame.at) : ""}
                        </Typography>
                      </Box>
                      <Slider
                        value={Math.min(currentFrameIndex, Math.max(0, report.frames.length - 1))}
                        min={0}
                        max={Math.max(0, report.frames.length - 1)}
                        step={1}
                        onChange={(_, value) => {
                          setIsReplayPlaying(false);
                          setCurrentFrameIndex(Array.isArray(value) ? value[0] : value);
                        }}
                        sx={{ mb: 2 }}
                      />
                      <Paper variant="outlined" sx={{ p: 2, minHeight: 180, maxHeight: 280, overflow: "auto", bgcolor: "#fff" }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                          {replayFrame?.label || "Draft started"}
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.7 }}>
                          {replayFrame?.text || ""}
                        </Typography>
                      </Paper>
                    </Collapse>
                  </CardContent>
                </Card>
                <Box sx={{ fontFamily: "monospace", fontSize: "0.9rem", lineHeight: 1.8 }}>
                  {lines.map((line, index) => {
                    const lineComments = comments.filter((comment) => comment.lineNumber === index);
                    return (
                      <Box key={index}>
                        <Box onClick={() => setSelectedLine(index)} sx={{ display: "flex", py: 0.5, px: 1, cursor: "pointer", bgcolor: selectedLine === index ? "#e3f2fd" : lineComments.length ? "#fff3e0" : "transparent", borderLeft: lineComments.length ? "3px solid #ff9800" : "none" }}>
                          <Typography variant="caption" sx={{ width: 40, color: "text.secondary", userSelect: "none" }}>{index + 1}</Typography>
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", flexGrow: 1 }}>{line || " "}</Typography>
                          {lineComments.length > 0 && <Comment fontSize="small" sx={{ color: "#ff9800", ml: 1 }} />}
                        </Box>
                        {lineComments.map((comment, commentIndex) => <Box key={commentIndex} sx={{ ml: 5, my: 1, p: 1, bgcolor: "#fff3e0", borderRadius: 1, borderLeft: "3px solid #ff9800" }}><Typography variant="body2">{comment.text}</Typography></Box>)}
                      </Box>
                    );
                  })}
                </Box>
              </Paper>

              <Paper sx={{ p: 3, height: "70vh", overflow: "auto" }}>
                <Typography variant="h6" sx={{ mb: 3 }}>DraftProof System Report</Typography>
                <Card sx={{ mb: 3, bgcolor: assessmentBackground(report.authorCheck.assessmentLabel) }}>
                  <CardContent>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                      <Typography variant="h6">{report.authorCheck.assessmentLabel}</Typography>
                      <Chip label={`${report.authorCheck.confidence} confidence · ${report.authorCheck.confidenceScore}% data quality`} size="small" />
                    </Box>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 2 }}>
                      <ScoreCard label="Process Support" value={report.authorCheck.processSupportScore} color="#2e7d32" />
                      <ScoreCard label="Process Atypicality" value={report.authorCheck.processAtypicalityScore} color="#d97706" />
                    </Box>
                    <Typography variant="body2">{report.authorCheck.assessmentDetail}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                      {report.authorCheck.confidenceReasons.join(" ")}
                    </Typography>
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2 }}>Score Dimension Breakdown</Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 3 }}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Process Support</Typography>
                        {supportDimensionDefinitions.map((dimension) => (
                          <DimensionScoreRow
                            key={dimension.key}
                            label={dimension.label}
                            value={report.authorCheck.supportScores[dimension.key]}
                            max={dimension.max}
                            color="#2e7d32"
                          />
                        ))}
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Process Atypicality</Typography>
                        {atypicalityDimensionDefinitions.map((dimension) => (
                          <DimensionScoreRow
                            key={dimension.key}
                            label={dimension.label}
                            value={report.authorCheck.atypicalityScores[dimension.key]}
                            max={dimension.max}
                            color="#d97706"
                          />
                        ))}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2 }}>Assessment Reasons</Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box sx={{ display: "grid", gap: 1 }}>
                      {report.authorCheck.reasons.map((reason) => (
                        <Alert
                          key={reason.id}
                          severity={reason.disposition === "review" ? "warning" : reason.disposition === "supportive" ? "success" : "info"}
                        >
                          <strong>{reason.label}:</strong> {reason.detail}
                        </Alert>
                      ))}
                    </Box>
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}><TrendingUp /> Draft Build Curve</Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 1, alignItems: "end", minHeight: 150 }}>
                      {report.processFeatures.draftBuildCurve.map((point) => {
                        const height = report.processFeatures.finalWords
                          ? Math.max(6, Math.round((point.words / report.processFeatures.finalWords) * 100))
                          : 6;
                        return (
                          <Box key={point.elapsedPercent} sx={{ textAlign: "center" }}>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>{point.words}</Typography>
                            <Box sx={{ height: 100, display: "flex", alignItems: "flex-end", my: 0.5 }}>
                              <Box sx={{ width: "100%", height: `${height}%`, minHeight: 6, bgcolor: "#1976d2", borderRadius: "4px 4px 0 0" }} />
                            </Box>
                            <Typography variant="caption" color="text.secondary">{point.elapsedPercent}%</Typography>
                          </Box>
                        );
                      })}
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>
                      <Metric label="Total duration" value={formatMetricDuration(report.processFeatures.totalDurationMs)} />
                      <Metric label="Active writing" value={formatMetricDuration(report.processFeatures.activeDurationMs)} />
                      <Metric label="Largest insertion" value={`${report.processFeatures.largestInsertionWords} words`} />
                      <Metric label="Overall pace" value={`${report.processFeatures.overallWpm} WPM`} />
                      <Metric label="Active typed pace" value={`${report.processFeatures.activeWpm} WPM`} />
                      <Metric label="15-second burst pace" value={`${report.processFeatures.burstWpm} WPM`} />
                      <Metric label="1-minute rolling pace" value={`${report.processFeatures.maxRollingOneMinuteWpm} WPM`} />
                      <Metric label="2-minute rolling pace" value={`${report.processFeatures.maxRollingTwoMinuteWpm} WPM`} />
                      <Metric label="Insertion to submit" value={formatMetricDuration(report.processFeatures.timeFromLargestInsertionToSubmitMs)} />
                      <Metric label="Draft complete to submit" value={formatMetricDuration(report.processFeatures.timeFromCompleteDraftToSubmitMs)} />
                      <Metric label="Immediate submit after complete draft" value={report.processFeatures.immediateSubmissionAfterCompleteDraft ? "Observed" : "Not observed"} />
                    </Box>
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2 }}>Pause and Session Structure</Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
                      <Metric label="Pauses over 30s" value={String(report.processFeatures.pauseCountOver30Seconds)} />
                      <Metric label="Pauses over 2m" value={String(report.processFeatures.pauseCountOverTwoMinutes)} />
                      <Metric label="Median pause" value={formatMetricDuration(report.processFeatures.medianPauseMs)} />
                      <Metric label="Longest pause" value={formatMetricDuration(report.processFeatures.longestIdleGapMs)} />
                      <Metric label="Before largest insertion" value={formatMetricDuration(report.processFeatures.pauseBeforeLargestInsertionMs)} />
                      <Metric label="After largest insertion" value={formatMetricDuration(report.processFeatures.pauseAfterLargestInsertionMs)} />
                      <Metric label="Meaningful sessions" value={String(report.processFeatures.meaningfulSessionCount)} />
                      <Metric label="Later-session revisions" value={String(report.processFeatures.laterSessionRevisionCount)} />
                    </Box>
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2 }}>Final Contribution</Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Estimates use recorded event offsets and text overlap. Typed and pasted estimates partition final words; revised and unrevised estimates partition retained pasted words. Deleted estimates identify the recorded origin of removed words.
                    </Alert>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
                      <Metric label="Typed final estimate" value={`${report.processFeatures.typedFinalWordsEstimate} words`} />
                      <Metric label="Pasted final estimate" value={`${report.processFeatures.pastedFinalWordsEstimate} words`} />
                      <Metric label="Revised pasted estimate" value={`${report.processFeatures.revisedPastedFinalWordsEstimate} words`} />
                      <Metric label="Unrevised pasted estimate" value={`${report.processFeatures.unrevisedPastedFinalWordsEstimate} words`} />
                      <Metric label="Deleted typed estimate" value={`${report.processFeatures.deletedTypedWordsEstimate} words`} />
                      <Metric label="Deleted pasted estimate" value={`${report.processFeatures.deletedPastedWordsEstimate} words`} />
                      <Metric label="Typed final share" value={`${Math.round(report.processFeatures.typedFinalRatio * 100)}%`} />
                      <Metric label="Pasted final share" value={`${Math.round(report.processFeatures.pastedFinalRatio * 100)}%`} />
                    </Box>
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2 }}>Source and Planning Process</Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
                      <Metric label="Citation additions" value={String(report.planningSourceFeatures.citationInsertionCount)} />
                      <Metric label="Citation removals" value={String(report.planningSourceFeatures.citationRemovalCount)} />
                      <Metric label="Citation replacements" value={String(report.planningSourceFeatures.citationReplacementCount)} />
                      <Metric label="First citation timing" value={report.planningSourceFeatures.firstCitationElapsedPercent === null ? "Not observed" : `${report.planningSourceFeatures.firstCitationElapsedPercent}% elapsed`} />
                      <Metric label="Citation-only pastes" value={String(report.planningSourceFeatures.citationOnlyPasteCount)} />
                      <Metric label="Pastes containing citations" value={String(report.planningSourceFeatures.citationPasteCount)} />
                      <Metric label="Prose pastes" value={String(report.planningSourceFeatures.prosePasteCount)} />
                      <Metric label="Revisions after citation" value={String(report.planningSourceFeatures.sourceRevisionAfterCitationCount)} />
                      <Metric label="Source integration" value={report.planningSourceFeatures.sourceIntegrationObserved ? "Observed" : "Not established"} />
                      <Metric label="Early outline" value={report.planningSourceFeatures.outlinePhaseDetected ? "Observed" : "Not observed"} />
                      <Metric label="Outline expansions" value={String(report.planningSourceFeatures.outlineExpansionCount)} />
                      <Metric label="Heading-first pattern" value={report.planningSourceFeatures.headingFirstDetected ? "Observed" : "Not observed"} />
                      <Metric label="Heading evolution" value={String(report.planningSourceFeatures.headingEvolutionCount)} />
                      <Metric label="Thesis revisions" value={String(report.planningSourceFeatures.thesisRevisionCount)} />
                      <Metric label="Draft expansion" value={report.planningSourceFeatures.draftExpansionPattern ? "Observed" : "Not observed"} />
                      <Metric label="Prompt uptake in final" value={`${Math.round(report.planningSourceFeatures.promptTermUptakeRatio * 100)}%`} />
                      <Metric label="Early prompt uptake" value={`${Math.round(report.planningSourceFeatures.earlyPromptTermUptakeRatio * 100)}%`} />
                    </Box>
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}><Edit /> Revision Depth</Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
                      <Typography variant="subtitle2">Revision depth score</Typography>
                      <Typography variant="h5" color="primary">{report.processFeatures.revisionDepthScore}/20</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={report.processFeatures.revisionDepthScore * 5} sx={{ height: 8, borderRadius: 4, mb: 2 }} />
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
                      <Metric label="Surface edits" value={String(report.processFeatures.surfaceRevisionCount)} />
                      <Metric label="Local revisions" value={String(report.processFeatures.localRevisionCount)} />
                      <Metric label="Structural revisions" value={String(report.processFeatures.structuralRevisionCount)} />
                      <Metric label="Revised words" value={String(report.processFeatures.revisedWordsEstimate)} />
                      <Metric label="Replacements" value={String(report.processFeatures.replacementEventCount)} />
                      <Metric label="Sentence-level" value={String(report.processFeatures.sentenceLevelRevisionCount)} />
                      <Metric label="Large deletions" value={String(report.processFeatures.largeDeletionCount)} />
                      <Metric label="Revision density" value={`${Math.round(report.processFeatures.revisionDensity * 100)}%`} />
                      <Metric label="Paragraph reorders" value={String(report.processFeatures.paragraphReorderCount)} />
                      <Metric label="Revised regions" value={String(report.processFeatures.revisedRegionCount)} />
                    </Box>
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}><QuizIcon /> Comprehension Alignment</Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
                      <Metric label="Claim coverage" value={report.comprehensionFeatures.claimAssessmentAvailable ? `${Math.round(report.comprehensionFeatures.claimCoverageRatio * 100)}%` : "Not assessed"} />
                      <Metric label="Specificity" value={`${report.comprehensionFeatures.specificityScore}%`} />
                      <Metric label="Genericness" value={`${report.comprehensionFeatures.genericnessScore}%`} />
                      <Metric label="Essay overlap" value={`${Math.round(report.comprehensionFeatures.overlapWithEssay * 100)}%`} />
                      <Metric label="Summary length" value={`${report.comprehensionFeatures.summaryLength} words`} />
                      <Metric label="Response time" value={formatMetricDuration(report.comprehensionFeatures.summaryLatencyMs)} />
                      <Metric label="Prompts answered" value={report.comprehensionFeatures.responseCount ? `${report.comprehensionFeatures.answeredResponseCount}/${report.comprehensionFeatures.responseCount}` : "Legacy response"} />
                      <Metric label="Average answer" value={report.comprehensionFeatures.responseCount ? `${report.comprehensionFeatures.averageAnswerWords} words` : "Not available"} />
                      <Metric label="Missing claims" value={String(report.comprehensionFeatures.majorClaimMissingCount)} />
                      <Metric label="Independent wording" value={report.comprehensionFeatures.independentWordingObserved ? "Observed" : "Not established"} />
                    </Box>
                    {!report.comprehensionFeatures.summarySubmitted && (
                      <Alert severity="info" sx={{ mt: 2 }}>No timed response is available; no negative inference is drawn.</Alert>
                    )}
                    {report.comprehensionFeatures.summarySubmitted && !report.comprehensionFeatures.claimAssessmentAvailable && (
                      <Alert severity="info" sx={{ mt: 2 }}>Keyword fallback was used. It is not treated as claim-level coverage or omission evidence.</Alert>
                    )}
                  </CardContent>
                </Card>

                <Typography variant="subtitle1" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}><ContentCopy /> Paste Event Highlights</Typography>
                {report.authorCheck.sourceHighlights.length ? report.authorCheck.sourceHighlights.map((source) => (
                  <Card key={source.id} sx={{ mb: 2 }}>
                    <CardContent>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 1 }}>
                        <Typography variant="subtitle2">{source.label}</Typography>
                        <Box sx={{ display: "flex", gap: 0.75 }}>
                          <Chip label={`${source.finalContributionPercent}% of final`} size="small" color="warning" />
                          <Chip label={`${source.retentionPercent}% retained`} size="small" variant="outlined" />
                        </Box>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>{source.excerpt}</Typography>
                      <Typography variant="caption" color="text.secondary">{source.detail}</Typography>
                    </CardContent>
                  </Card>
                )) : <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>No source highlights were generated.</Typography>}

                <Typography variant="subtitle1" sx={{ mt: 3, mb: 2, display: "flex", alignItems: "center", gap: 1 }}><TrendingUp /> Writing Pattern Analysis</Typography>
                {[...report.authorCheck.writingPatternChecks, ...report.authorCheck.styleConsistencyChecks].map((check) => (
                  <Alert key={`${check.label}-${check.detail}`} severity={check.status === "review" ? "warning" : check.status === "monitor" ? "info" : "success"} sx={{ mb: 1 }}>
                    <strong>{check.label}:</strong> {check.detail}
                  </Alert>
                ))}

                <Typography variant="subtitle1" sx={{ mt: 3, mb: 2 }}>Evidence Classification</Typography>
                <Box sx={{ display: "grid", gap: 1 }}>
                  {report.tags.map((tag) => (
                    <Alert
                      key={tag.id}
                      severity={tag.disposition === "review" ? "warning" : tag.disposition === "supportive" ? "success" : "info"}
                    >
                      <strong>{tag.category} · {tag.disposition}:</strong> {tag.label}. {tag.detail}
                    </Alert>
                  ))}
                </Box>

                <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Comprehension Summary</Typography>
                {report.comprehensionResponses.length ? (
                  <Box sx={{ display: "grid", gap: 2 }}>
                    {report.comprehensionResponses.map((response, index) => (
                      <Box key={`${index}-${response.question}`} sx={{ display: "grid", gap: 1 }}>
                        <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                          Q. {response.question}
                        </Typography>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            bgcolor: "#fff",
                            borderColor: "divider",
                            borderRadius: 1.5,
                            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)"
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.7,
                              color: "text.primary"
                            }}
                          >
                            {response.answer || "No response recorded before the timed check ended."}
                          </Typography>
                        </Paper>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Paper variant="outlined" sx={{ p: 2, whiteSpace: "pre-wrap" }}>{report.summaryText || "No timed response stored."}</Paper>
                )}
              </Paper>
            </Box>

            <Paper sx={{ p: 3, mt: 2 }}>
              {savedGrade !== null && (
                <Alert severity={gradeChanged ? "info" : "success"} sx={{ mb: 2 }}>
                  {gradeChanged ? "Grade changed. Save again to update it." : `Grade saved at ${savedGrade}%.`}
                </Alert>
              )}
              <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h6" sx={{ whiteSpace: "nowrap", mr: 1 }}>Final Grade</Typography>
                <TextField
                  label="Grade"
                  type="number"
                  value={gradePercent}
                  onChange={(event) => setGradePercent(Math.max(0, Math.min(100, Number(event.target.value))))}
                  slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  sx={{ width: 140 }}
                />
                <TextField label={selectedLine === null ? "Select a line to comment" : `Comment on line ${selectedLine + 1}`} value={newComment} onChange={(event) => setNewComment(event.target.value)} sx={{ flex: "1 1 320px" }} disabled={selectedLine === null} />
                <Button variant="outlined" disabled={selectedLine === null || !newComment.trim()} onClick={() => { if (selectedLine !== null) setComments([...comments, { lineNumber: selectedLine, text: newComment }]); setNewComment(""); }}>Add Comment</Button>
                <Button variant="contained" color="success" disabled={gradeSaving} onClick={saveGrade}>{savedGrade === gradePercent ? "Saved" : "Save Grade"}: {Number.isNaN(gradePercent) ? 0 : gradePercent}%</Button>
              </Box>
            </Paper>
          </>
        )}
      </Container>
    </Box>
  );
}

function ClassManagement({ assignmentId }: { assignmentId?: string }) {
  const router = useRouter();
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<AssignmentRosterResponse["pendingInvitations"]>([]);
  const [currentClass, setCurrentClass] = useState<ProfessorClass | null>(null);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const loadRoster = useCallback(() => {
    if (!assignmentId) return;
    loadJson<AssignmentRosterResponse>(`/api/professor/classes/${assignmentId}/students`)
      .then((data) => {
        setStudents(data.students);
        setPendingInvitations(data.pendingInvitations);
      })
      .catch((nextError) => setError(readError(nextError)));
  }, [assignmentId]);

  useEffect(() => {
    loadRoster();
    if (!assignmentId) return;
    loadJson<ProfessorClassListResponse>("/api/professor/classes")
      .then((data) => setCurrentClass(data.classes.find((classroom) => classroom.id === assignmentId) || null))
      .catch((nextError) => setError(readError(nextError)));
  }, [assignmentId, loadRoster]);

  async function inviteStudents(event: FormEvent<HTMLFormElement>) {
    if (!assignmentId) return;
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await postJson<InviteClassStudentsResponse>(
        `/api/professor/classes/${assignmentId}/invitations`,
        { emails: inviteEmails } satisfies InviteClassStudentsBody
      );
      setInviteEmails([]);
      setInviteInput("");
      setNotice(`Sent ${result.invitations.length} class invitation email${result.invitations.length === 1 ? "" : "s"}.`);
      loadRoster();
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function removeStudent(studentId: string) {
    if (!assignmentId) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await fetch(`/api/professor/classes/${assignmentId}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId } satisfies RemoveAssignmentStudentBody)
      }).then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(data?.error || "Unable to remove student.");
        }
      });
      setNotice("Student removed from the class.");
      loadRoster();
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <AppBar position="static" elevation={0} color="success"><Toolbar><IconButton edge="start" color="inherit" onClick={() => router.push("/professor")}><ArrowBack /></IconButton><Typography variant="h6" sx={{ ml: 2 }}>Class Management</Typography></Toolbar></AppBar>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setNotice("")}>{notice}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 3 }}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Box>
                <Typography variant="h5">Student Roster</Typography>
                {currentClass && <Typography variant="body2" color="text.secondary">Join code: {currentClass.joinCode}</Typography>}
              </Box>
              {currentClass && (
                <Button variant="outlined" startIcon={<ContentCopy />} onClick={() => void navigator.clipboard.writeText(currentClass.joinCode)}>
                  Copy Join Code
                </Button>
              )}
            </Box>
            <TableContainer><Table><TableHead><TableRow><TableCell>Student</TableCell><TableCell>Email</TableCell><TableCell>Engagement</TableCell><TableCell>Trend</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>
              {students.map((student, index) => (
                <TableRow key={student.studentId}>
                  <TableCell><Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Avatar>{student.studentName[0]}</Avatar>{student.studentName}</Box></TableCell>
                  <TableCell>{student.studentEmail}</TableCell>
                  <TableCell><LinearProgress variant="determinate" value={70 + (index % 3) * 8} sx={{ height: 8, borderRadius: 4 }} /></TableCell>
                  <TableCell>{index % 2 ? <TrendingDown color="warning" /> : <TrendingUp color="success" />}</TableCell>
                  <TableCell align="right"><IconButton color="error" onClick={() => void removeStudent(student.studentId)} disabled={loading}><Delete /></IconButton></TableCell>
                </TableRow>
              ))}
              {!students.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No students have joined yet.</Typography></TableCell></TableRow>}
            </TableBody></Table></TableContainer>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>Invite Students</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add one or more student emails. Each student receives an invitation email and confirms by accepting it.
            </Typography>
            <form onSubmit={inviteStudents}>
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={inviteEmails}
                inputValue={inviteInput}
                onInputChange={(_, value) => setInviteInput(value)}
                onChange={(_, value) => setInviteEmails(value.map((item) => item.trim()).filter(Boolean))}
                renderInput={(params) => <TextField {...params} label="Student Emails" placeholder="Type an email and press Enter" sx={{ mb: 2 }} />}
                sx={{ mb: 2 }}
              />
              <Button type="submit" variant="contained" color="success" startIcon={<Email />} fullWidth disabled={!inviteEmails.length || loading}>Send Invite</Button>
            </form>
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Pending Invitations</Typography>
            {pendingInvitations.map((invitation) => (
              <Chip key={invitation.invitationId} label={invitation.email} sx={{ mr: 1, mb: 1 }} />
            ))}
            {!pendingInvitations.length && <Typography variant="body2" color="text.secondary">No pending invitation emails.</Typography>}
          </Paper>
        </Box>
      </Container>
    </Box>
  );
}

function InvitationPage({ token }: { token?: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<ClassInvitationLookupResponse["invitation"] | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const redirect = token ? `/invite/${token}` : "/invite";

  useEffect(() => {
    if (!token) {
      setError("Invitation link is invalid.");
      setLoading(false);
      return;
    }

    Promise.all([
      loadJson<ClassInvitationLookupResponse>(`/api/class-invitations/${token}`),
      fetch("/api/auth/me").then(async (response) => response.ok ? response.json() as Promise<{ user: AuthUser | null }> : { user: null })
    ])
      .then(([inviteData, authData]) => {
        setInvitation(inviteData.invitation);
        setUser(authData.user);
      })
      .catch((nextError) => setError(readError(nextError)))
      .finally(() => setLoading(false));
  }, [token]);

  async function acceptInvitation() {
    if (!token) return;
    setAccepting(true);
    setError("");
    setNotice("");
    try {
      const accepted = await postJson<AcceptClassInvitationResponse>("/api/class-invitations/accept", { token });
      setNotice(`Joined ${accepted.class.name}.`);
      setTimeout(() => router.push("/student"), 800);
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ p: 4, borderRadius: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 1, textAlign: "center" }}>DraftProof Class Invitation</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: "center" }}>
            Accept your class invitation to unlock assignments in DraftProof.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          {notice && <Alert severity="success" sx={{ mb: 3 }}>{notice}</Alert>}
          {loading ? (
            <LinearProgress />
          ) : invitation ? (
            <>
              <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6">{invitation.className}</Typography>
                <Typography variant="body2" color="text.secondary">Invited email: {invitation.email}</Typography>
              </Paper>
              {!user ? (
                <Box sx={{ display: "grid", gap: 2 }}>
                  <Button variant="contained" onClick={() => router.push(`/login/student?redirect=${encodeURIComponent(redirect)}`)}>Sign In to Accept</Button>
                  <Button variant="outlined" onClick={() => router.push(`/signup?role=student&email=${encodeURIComponent(invitation.email)}&redirect=${encodeURIComponent(redirect)}`)}>Create Student Account</Button>
                </Box>
              ) : user.role !== "student" ? (
                <Alert severity="warning">Sign in with a student account for {invitation.email} to accept this invitation.</Alert>
              ) : (
                <Box sx={{ display: "grid", gap: 2 }}>
                  <Alert severity="info">Account: {user.name}. Accepting will add you to this class immediately.</Alert>
                  <Button variant="contained" onClick={() => void acceptInvitation()} disabled={accepting}>
                    {accepting ? "Accepting..." : "Accept Invitation"}
                  </Button>
                </Box>
              )}
            </>
          ) : null}
        </Paper>
      </Container>
    </Box>
  );
}

function AssignmentTemplates() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ title: "", prompt: "", dueAt: "" });
  const [classes, setClasses] = useState<ProfessorClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(searchParams.get("classId") || "");
  const [comprehensionCheck, setComprehensionCheck] = useState<ComprehensionCheckSettings>({
    enabled: true,
    timeLimitMinutes: DEFAULT_COMPREHENSION_TIME_LIMIT_MINUTES,
    questions: [...DEFAULT_COMPREHENSION_QUESTIONS]
  });
  const [error, setError] = useState("");
  const centeredInputSx = {
    "& .MuiOutlinedInput-root": {
      minHeight: 56
    },
    "& .MuiOutlinedInput-input": {
      boxSizing: "border-box",
      height: "100%",
      paddingTop: "16.5px",
      paddingBottom: "16.5px"
    }
  };
  const templates = [
    ["Research Paper", "Write a sourced research paper with a clear thesis, evidence, and revision notes."],
    ["Lab Report", "Document hypothesis, method, observations, analysis, and conclusion."],
    ["Literary Analysis", "Analyze a passage with direct textual evidence and original interpretation."],
    ["Problem Set", "Show all work and explain the reasoning behind each solution."]
  ];

  useEffect(() => {
    loadJson<ProfessorClassListResponse>("/api/professor/classes")
      .then((data) => {
        setClasses(data.classes);
        setSelectedClassId((current) => current || data.classes[0]?.id || "");
      })
      .catch((nextError) => setError(readError(nextError)));
  }, []);

  async function createAssignment(title: string, prompt: string) {
    if (!selectedClassId) {
      setError("Create or select a class before creating an assignment.");
      return;
    }
    await postJson("/api/professor/assignments", {
      title,
      prompt,
      classId: selectedClassId,
      dueAt: form.dueAt ? new Date(`${form.dueAt}T23:59:00`).getTime() : null,
      comprehensionCheck
    });
    router.push("/professor");
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <AppBar position="static" elevation={0} color="success"><Toolbar><IconButton edge="start" color="inherit" onClick={() => router.push("/professor")}><ArrowBack /></IconButton><Typography variant="h6" sx={{ ml: 2 }}>Assignment Template Library</Typography></Toolbar></AppBar>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Create Custom Assignment</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr 180px auto" }, gap: 2 }}>
            <TextField label="Assignment title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} sx={centeredInputSx} />
            <TextField label="Writing prompt" value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} sx={centeredInputSx} />
            <TextField type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
            <Button variant="contained" color="success" onClick={() => createAssignment(form.title, form.prompt)} disabled={!form.title || !form.prompt || !selectedClassId}>Create Assignment</Button>
          </Box>
        </Paper>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Assign to Class</Typography>
          <FormControl fullWidth>
            <FormLabel sx={{ mb: 1, color: "text.primary", fontWeight: 500 }}>Class</FormLabel>
            <TextField
              select
              fullWidth
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              slotProps={{ select: { native: true } }}
            >
              <option value="">Select a class</option>
              {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
            </TextField>
          </FormControl>
        </Paper>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Post-Submission Comprehension Check</Typography>
          <FormControlLabel
            control={<Switch checked={comprehensionCheck.enabled} onChange={(event) => setComprehensionCheck((current) => ({ ...current, enabled: event.target.checked }))} />}
            label={comprehensionCheck.enabled ? "Enabled" : "Disabled"}
            sx={{ mb: comprehensionCheck.enabled ? 2 : 0 }}
          />
          {comprehensionCheck.enabled && (
            <Box sx={{ display: "grid", gap: 2 }}>
              <TextField
                type="number"
                label="Time limit (minutes)"
                value={comprehensionCheck.timeLimitMinutes}
                onChange={(event) => setComprehensionCheck((current) => ({
                  ...current,
                  timeLimitMinutes: Math.max(1, Math.min(MAX_COMPREHENSION_TIME_LIMIT_MINUTES, Number(event.target.value) || 1))
                }))}
                slotProps={{ htmlInput: { min: 1, max: 10 } }}
                sx={{ maxWidth: 220 }}
              />
              {comprehensionCheck.questions.map((question, index) => (
                <TextField
                  key={`question-${index}`}
                  label={`Question ${index + 1}`}
                  value={question}
                  onChange={(event) => setComprehensionCheck((current) => ({
                    ...current,
                    questions: current.questions.map((item, itemIndex) => itemIndex === index ? event.target.value : item)
                  }))}
                />
              ))}
            </Box>
          )}
        </Paper>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
          {templates.map(([title, prompt]) => (
            <Card key={title}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{prompt}</Typography>
                <Button variant="contained" color="success" disabled={!selectedClassId} onClick={() => createAssignment(title, prompt)}>Use Template</Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

function DashboardShell({ color, title, user, children }: { color: "primary" | "success"; title: string; user: AuthUser; children: ReactNode }) {
  const router = useRouter();
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <AppBar position="static" elevation={0} color={color}>
        <Toolbar>
          <MenuBook sx={{ mr: 2 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{title}</Typography>
          <Chip icon={<AccountCircle />} label={user.name} sx={{ color: "white", borderColor: "rgba(255,255,255,0.5)", ml: 1 }} variant="outlined" />
          <Button color="inherit" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }}>Sign Out</Button>
        </Toolbar>
      </AppBar>
      {children}
    </Box>
  );
}

function FullPageMessage({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <Container maxWidth="sm" sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Paper sx={{ p: 4, textAlign: "center", width: "100%" }}>
        <Typography variant="h4" sx={{ mb: 2 }}>{title}</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>{detail}</Typography>
        {action}
      </Paper>
    </Container>
  );
}

function AssessmentChip({ label }: { label: ProfessorReportResponse["authorCheck"]["assessmentLabel"] }) {
  return <Chip icon={<Flag />} label={label} size="small" sx={{ bgcolor: assessmentColor(label), color: "white" }} />;
}

function ProcessIndicatorBar({ value, tone }: { value: number; tone: "support" | "atypicality" }) {
  const color = tone === "support" ? "#2e7d32" : value >= 70 ? "#d32f2f" : value >= 40 ? "#f57c00" : "#607d8b";
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="body2">{value}%</Typography>
      <LinearProgress variant="determinate" value={value} sx={{ height: 6, borderRadius: 3, "& .MuiLinearProgress-bar": { bgcolor: color } }} />
    </Box>
  );
}

function ScoreCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: "rgba(255,255,255,0.72)" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="h5" sx={{ color }}>{value}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={value} sx={{ height: 8, borderRadius: 4, "& .MuiLinearProgress-bar": { bgcolor: color } }} />
    </Paper>
  );
}

const supportDimensionDefinitions = [
  { key: "compositionPlausibility", label: "Composition plausibility", max: 20 },
  { key: "revisionDepth", label: "Revision depth", max: 20 },
  { key: "pasteIntegration", label: "Paste integration", max: 20 },
  { key: "sessionDevelopment", label: "Session development", max: 15 },
  { key: "comprehensionAlignment", label: "Comprehension alignment", max: 20 },
  { key: "sourceProcess", label: "Source process", max: 5 }
] as const;

const atypicalityDimensionDefinitions = [
  { key: "highVelocityInsertion", label: "High-velocity insertion", max: 25 },
  { key: "unrevisedPasteDependence", label: "Unrevised paste dependence", max: 30 },
  { key: "minimalRevisionPattern", label: "Minimal revision pattern", max: 15 },
  { key: "shortCompletionPattern", label: "Short completion pattern", max: 15 },
  { key: "weakComprehensionSignal", label: "Weak comprehension signal", max: 15 }
] as const;

function DimensionScoreRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}/{max}</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={max ? Math.min(100, (value / max) * 100) : 0}
        sx={{ height: 6, borderRadius: 3, "& .MuiLinearProgress-bar": { bgcolor: color } }}
      />
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

function formatMetricDuration(value: number | null) {
  if (value === null) return "Not available";
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatReplayFrameTime(at: number) {
  return new Date(at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function replayDelayMs(actualDelayMs: number, speed: 1 | 2 | 4) {
  const scaled = actualDelayMs / speed;
  return Math.max(120, Math.min(12_000, scaled || 120));
}

function WritingRichTextEditor({
  value,
  disabled,
  onChange
}: {
  value: string;
  disabled: boolean;
  onChange: (nextHtml: string, nextPlainText: string, inputType: string) => void;
}) {
  const quillRef = useRef<any>(null);
  const [fontValue, setFontValue] = useState("arial");
  const [sizeValue, setSizeValue] = useState("16px");

  const toolbarControlSx = {
    minWidth: 132,
    "& .MuiOutlinedInput-root": {
      bgcolor: "#fff",
      borderRadius: 1.5,
      height: 40
    },
    "& .MuiSelect-select": {
      alignItems: "center",
      display: "flex",
      fontSize: 14,
      py: 1.1
    }
  };

  const modules = useMemo(() => ({
    toolbar: false,
    history: {
      delay: 400,
      maxStack: 100,
      userOnly: true
    }
  }), []);

  const formats = useMemo(() => [
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "list",
    "align"
  ], []);

  const syncToolbarState = useCallback(() => {
    const editor = quillRef.current?.getEditor?.();
    if (!editor) return;
    const current = editor.getFormat();
    setFontValue(typeof current.font === "string" ? current.font : "arial");
    setSizeValue(typeof current.size === "string" ? current.size : "16px");
  }, []);

  useEffect(() => {
    const editor = quillRef.current?.getEditor?.();
    if (!editor) return;
    syncToolbarState();
    editor.on("selection-change", syncToolbarState);
    editor.on("text-change", syncToolbarState);
    return () => {
      editor.off("selection-change", syncToolbarState);
      editor.off("text-change", syncToolbarState);
    };
  }, [syncToolbarState, value]);

  function withEditor(action: (editor: any) => void) {
    const editor = quillRef.current?.getEditor?.();
    if (!editor || disabled) return;
    action(editor);
    syncToolbarState();
  }

  function toggleInline(formatName: "bold" | "italic" | "underline") {
    withEditor((editor) => {
      const current = editor.getFormat();
      editor.format(formatName, !current[formatName]);
    });
  }

  function toggleList(type: "bullet" | "ordered") {
    withEditor((editor) => {
      const current = editor.getFormat();
      editor.format("list", current.list === type ? false : type);
    });
  }

  function setAlignment(alignment: "" | "center" | "right") {
    withEditor((editor) => {
      editor.format("align", alignment || false);
    });
  }

  return (
    <Box sx={{ border: "1px solid #d0d7de", borderRadius: 2, overflow: "hidden", mb: 3, bgcolor: "white" }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", p: 1.5, bgcolor: "#f7f9fc", borderBottom: "1px solid #e5e7eb" }}>
        <FormControl size="small" sx={toolbarControlSx}>
          <Select
            value={fontValue}
            disabled={disabled}
            displayEmpty
            onChange={(event) => {
              const nextValue = event.target.value;
              setFontValue(nextValue);
              withEditor((editor) => editor.format("font", nextValue));
            }}
          >
            <MenuItem value="arial">Arial</MenuItem>
            <MenuItem value="times-new-roman">Times New Roman</MenuItem>
            <MenuItem value="verdana">Verdana</MenuItem>
            <MenuItem value="georgia">Georgia</MenuItem>
            <MenuItem value="courier-new">Courier New</MenuItem>
            <MenuItem value="sans-serif">Sans Serif</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ ...toolbarControlSx, minWidth: 92 }}>
          <Select
            value={sizeValue}
            disabled={disabled}
            displayEmpty
            onChange={(event) => {
              const nextValue = event.target.value;
              setSizeValue(nextValue);
              withEditor((editor) => editor.format("size", nextValue));
            }}
          >
            <MenuItem value="12px">12</MenuItem>
            <MenuItem value="14px">14</MenuItem>
            <MenuItem value="16px">16</MenuItem>
            <MenuItem value="18px">18</MenuItem>
            <MenuItem value="24px">24</MenuItem>
            <MenuItem value="36px">36</MenuItem>
          </Select>
        </FormControl>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <IconButton size="small" onClick={() => toggleInline("bold")} title="Bold" disabled={disabled}><FormatBold /></IconButton>
        <IconButton size="small" onClick={() => toggleInline("italic")} title="Italic" disabled={disabled}><FormatItalic /></IconButton>
        <IconButton size="small" onClick={() => toggleInline("underline")} title="Underline" disabled={disabled}><FormatUnderlined /></IconButton>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <IconButton size="small" onClick={() => toggleList("bullet")} title="Bullet List" disabled={disabled}><FormatListBulleted /></IconButton>
        <IconButton size="small" onClick={() => toggleList("ordered")} title="Numbered List" disabled={disabled}><FormatListNumbered /></IconButton>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <IconButton size="small" onClick={() => setAlignment("")} title="Align Left" disabled={disabled}><FormatAlignLeft /></IconButton>
        <IconButton size="small" onClick={() => setAlignment("center")} title="Align Center" disabled={disabled}><FormatAlignCenter /></IconButton>
        <IconButton size="small" onClick={() => setAlignment("right")} title="Align Right" disabled={disabled}><FormatAlignRight /></IconButton>
      </Box>
      <Box className="draftproof-editor">
        <ReactQuill
          ref={quillRef}
          theme="snow"
          modules={modules}
          formats={formats}
          value={value}
          readOnly={disabled}
          onChange={(nextHtml: string, delta: { ops?: Array<{ insert?: unknown; delete?: number }> }, source: string, editor: { getText(): string }) => {
            const plainText = normalizeQuillText(editor.getText());
            const inputType = deriveQuillInputType(delta, source);
            onChange(nextHtml, plainText, inputType);
          }}
        />
      </Box>
    </Box>
  );
}

function deriveQuillInputType(delta: { ops?: Array<{ insert?: unknown; delete?: number }> }, source: string) {
  if (source !== "user") return "sync";
  const ops = delta.ops || [];
  const insertedText = ops
    .filter((op) => typeof op.insert === "string")
    .map((op) => String(op.insert))
    .join("");
  if (countWords(insertedText) >= 20) return "insertFromPaste";
  if (ops.some((op) => typeof op.delete === "number" && op.delete > 0)) return "deleteContentBackward";
  return "insertText";
}

function normalizeQuillText(text: string) {
  return text.replace(/\u00a0/g, " ").replace(/\n$/, "");
}

function plainTextToEditorHtml(text: string) {
  if (!text.trim()) return "<p><br></p>";
  return text
    .split("\n")
    .map((line) => line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>")
    .join("");
}

function editorHtmlToPlainText(html: string) {
  if (!html) return "";
  if (typeof window === "undefined") {
    return html
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\u00a0/g, " ")
      .trim();
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  return normalizeQuillText(container.innerText);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error || "Request failed.");
  return data as T;
}

async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error || "Request failed.");
  return data as T;
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function formatRole(role: UserRole) {
  return role === "professor" ? "Instructor" : "Student";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assessmentColor(label: ProfessorReportResponse["authorCheck"]["assessmentLabel"]) {
  if (label === "Review Recommended") return "#b45309";
  if (label === "Strong Process Evidence") return "#2e7d32";
  if (label === "Mixed Process Evidence") return "#1976d2";
  return "#64748b";
}

function assessmentBackground(label: ProfessorReportResponse["authorCheck"]["assessmentLabel"]) {
  if (label === "Review Recommended") return "#fff7ed";
  if (label === "Strong Process Evidence") return "#e8f5e9";
  if (label === "Mixed Process Evidence") return "#e3f2fd";
  return "#f1f5f9";
}

function classColor(index: number) {
  return ["#1976d2", "#2e7d32", "#d32f2f", "#f57c00", "#7b1fa2"][index % 5];
}
