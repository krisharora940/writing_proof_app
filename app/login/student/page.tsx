import { Suspense } from "react";
import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

export default function StudentLoginPage() {
  return <Suspense><AuthorCheckApp page="login" role="student" /></Suspense>;
}
