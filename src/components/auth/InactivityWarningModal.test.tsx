import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { InactivityWarningModal } from "./InactivityWarningModal";

describe("InactivityWarningModal countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("decrements the displayed remaining time each second", async () => {
    render(
      <InactivityWarningModal
        open={true}
        remainingMs={120_000}
        onStay={() => {}}
        onSignOut={() => {}}
      />
    );

    const timeSpan = screen.getByText(/Time remaining:/).querySelector("span.font-mono");
    expect(timeSpan).toHaveTextContent("02:00");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    await waitFor(() => expect(timeSpan).toHaveTextContent("01:59"));

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    await waitFor(() => expect(timeSpan).toHaveTextContent("01:57"));
  });

  it("resets the countdown when reopened", async () => {
    const { rerender } = render(
      <InactivityWarningModal
        open={true}
        remainingMs={120_000}
        onStay={() => {}}
        onSignOut={() => {}}
      />
    );

    const timeSpan = screen.getByText(/Time remaining:/).querySelector("span.font-mono");
    expect(timeSpan).toHaveTextContent("02:00");

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    await waitFor(() => expect(timeSpan).toHaveTextContent("01:57"));

    rerender(
      <InactivityWarningModal
        open={false}
        remainingMs={120_000}
        onStay={() => {}}
        onSignOut={() => {}}
      />
    );

    rerender(
      <InactivityWarningModal
        open={true}
        remainingMs={120_000}
        onStay={() => {}}
        onSignOut={() => {}}
      />
    );

    await waitFor(() => expect(timeSpan).toHaveTextContent("02:00"));
  });
});
