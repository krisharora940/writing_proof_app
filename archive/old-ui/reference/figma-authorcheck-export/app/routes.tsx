import { createBrowserRouter } from "react-router";
import StudentDashboard from "./components/StudentDashboard";
import InstructorDashboard from "./components/InstructorDashboard";
import AssignmentSubmission from "./components/AssignmentSubmission";
import ComprehensionQuiz from "./components/ComprehensionQuiz";
import InstructorReview from "./components/InstructorReview";
import ClassManagement from "./components/ClassManagement";
import AssignmentTemplates from "./components/AssignmentTemplates";
import LandingPage from "./components/LandingPage";
import StudentLogin from "./components/StudentLogin";
import InstructorLogin from "./components/InstructorLogin";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/login/student",
    Component: StudentLogin,
  },
  {
    path: "/login/instructor",
    Component: InstructorLogin,
  },
  {
    path: "/student",
    children: [
      { index: true, Component: StudentDashboard },
      { path: "assignment/:assignmentId", Component: AssignmentSubmission },
      { path: "quiz/:submissionId", Component: ComprehensionQuiz },
    ],
  },
  {
    path: "/instructor",
    children: [
      { index: true, Component: InstructorDashboard },
      { path: "class/:classId", Component: ClassManagement },
      { path: "review/:submissionId", Component: InstructorReview },
      { path: "templates", Component: AssignmentTemplates },
    ],
  },
  {
    path: "*",
    Component: () => <div>404 - Page Not Found</div>,
  },
]);
