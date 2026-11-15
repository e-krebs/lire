import { useEffect, useRef, useState } from "react";

interface FocusRequest {
  id: string;
}

export const useFocusHandoff = ({ frame }: { frame: HTMLElement | null }) => {
  const [request, setRequest] = useState<FocusRequest>();
  // A `frame` change re-runs the effect, so the last handled request is kept to never replay it.
  const handled = useRef<FocusRequest>(undefined);

  useEffect(() => {
    if (request === undefined || request === handled.current) return;
    handled.current = request;
    frame
      ?.querySelector(`[data-entry-id="${CSS.escape(request.id)}"]`)
      ?.querySelector<HTMLElement>("a")
      ?.focus();
  }, [frame, request]);

  return (id: string): void => {
    setRequest({ id });
  };
};
