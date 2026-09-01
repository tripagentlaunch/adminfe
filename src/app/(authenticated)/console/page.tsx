import { redirect } from "next/navigation";

// "/console" -> "/console/queue" — mirrors the root "/" -> "/workbench"
// redirect. Route segment stayed "/console" (renaming it would touch every
// link into this section); the page itself is now "Enquiries," and
// "/console/queue" is its "Console" tab — see layout.tsx's docblock.
export default function ConsoleRootPage() {
  redirect("/console/queue");
}
