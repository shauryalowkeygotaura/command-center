import { Board } from "@/components/Board";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <Board />
    </ErrorBoundary>
  );
}
