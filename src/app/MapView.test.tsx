// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { DetailEntry } from "@/domains/coverage/coverage-service";
import { replayStepMs } from "@/domains/coverage/replay";
import MapView from "./MapView";

vi.mock("./Choropleth", () => ({
  default: () => <div data-testid="map" />,
}));

vi.mock("./CountryPanel", () => ({
  default: () => null,
}));

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const entries: DetailEntry[] = [
  {
    bookId: "b1",
    iso3: "USA",
    dateRead: d("2024-03-01"),
    title: "One",
    author: "Ann",
  },
  {
    bookId: "b2",
    iso3: "GBR",
    dateRead: d("2024-06-01"),
    title: "Two",
    author: "Bob",
  },
  {
    bookId: "b3",
    iso3: "FRA",
    dateRead: d("2024-09-01"),
    title: "Three",
    author: "Cam",
  },
];

const stepMs = replayStepMs(3);

describe("MapView replay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    const w = window as Window & { __bookmapReplayTick?: number };
    if (w.__bookmapReplayTick != null) {
      window.clearInterval(w.__bookmapReplayTick);
      w.__bookmapReplayTick = undefined;
    }
    vi.useRealTimers();
  });

  it("starts on the first dated month, pauses without skipping, and resumes", () => {
    render(<MapView entries={entries} needsReviewCount={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByText(/as of March 2024/)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(stepMs);
    });
    expect(screen.getByText(/as of June 2024/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Pause map replay/i }));
    act(() => {
      vi.advanceTimersByTime(stepMs * 3);
    });
    expect(screen.getByText(/as of June 2024/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Play map replay/i }));
    act(() => {
      vi.advanceTimersByTime(stepMs);
    });
    expect(screen.getByText(/as of September 2024/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Play map replay/i }),
    ).toBeTruthy();
  });
});
