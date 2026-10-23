import { createFileRoute } from "@tanstack/react-router";
import { Credits } from "client/components/app/credits/Credits";
import { useSignedOut } from "client/hooks/useSignedOut";

export const Route = createFileRoute("/credits")({
  component: CreditsPage,
});

function CreditsPage() {
  const signedOut = useSignedOut();
  return <Credits signedOut={signedOut} />;
}
