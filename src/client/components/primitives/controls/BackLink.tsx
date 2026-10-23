import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { backButtonClassName } from "client/components/primitives/controls/backButtonClassName";
import { Icon } from "client/components/primitives/icons/icons";

interface BackLinkProps {
  children: ReactNode;
}

export const BackLink = ({ children }: BackLinkProps) => (
  <Link to="/" className={backButtonClassName}>
    <Icon name="back" className="size-5 flex-none" />
    <span className="truncate">{children}</span>
  </Link>
);
