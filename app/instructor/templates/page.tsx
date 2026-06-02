import { Suspense } from "react";
import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

export default function InstructorTemplatesPage() {
  return <Suspense><AuthorCheckApp page="templates" role="professor" /></Suspense>;
}
