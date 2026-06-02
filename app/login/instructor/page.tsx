import { Suspense } from "react";
import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

export default function InstructorLoginPage() {
  return <Suspense><AuthorCheckApp page="login" role="professor" /></Suspense>;
}
