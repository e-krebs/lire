import { createFileRoute, redirect } from "@tanstack/react-router";

// The top bar carries the collections on every tier, so "/" is the all-entries stream.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/stream/$streamKey", params: { streamKey: "all" } });
  },
});
