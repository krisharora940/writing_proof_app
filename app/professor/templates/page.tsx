import { Suspense } from "react";
import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

export default function ProfessorTemplatesPage() {
  return <Suspense><AuthorCheckApp page="templates" role="professor" /></Suspense>;
}
