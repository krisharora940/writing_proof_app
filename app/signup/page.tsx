import { Suspense } from "react";
import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

export default function SignupPage() {
  return <Suspense><AuthorCheckApp page="signup" /></Suspense>;
}
