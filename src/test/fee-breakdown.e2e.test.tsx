import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import FeeBreakdown from "@/components/FeeBreakdown";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
};

describe("FeeBreakdown E2E — backend estimate is rendered verbatim", () => {
  beforeEach(() => invokeMock.mockReset());

  it("displays exactly what estimate-fee returns for UGX", async () => {
    invokeMock.mockResolvedValue({
      data: {
        fee: 3000, fee_ugx: 3000, net_amount: 497000,
        tier_label: "0.6% min 1500 max 6000", exchange_rate: 1, ugx_equivalent: 500000,
        fee_type: "percentage", fee_value: 0.6,
      }, error: null,
    });

    wrap(<FeeBreakdown amount={500000} currency="UGX" />);

    await waitFor(() => expect(screen.getByText(/Total Debit/i)).toBeInTheDocument());

    // Fee row shows 3,000 UGX exactly as backend reported
    expect(screen.getByText("UGX 3,000")).toBeInTheDocument();
    // Total = amount + fee = 503,000 UGX
    expect(screen.getByText("UGX 503,000")).toBeInTheDocument();
    // Net to recipient = original amount (appears twice: amount row + recipient row)
    expect(screen.getAllByText("UGX 500,000").length).toBeGreaterThanOrEqual(2);
  });

  it("shows USD conversion + UGX equivalent rows", async () => {
    invokeMock.mockResolvedValue({
      data: {
        fee: 0.6, fee_ugx: 2250, net_amount: 99.4,
        tier_label: "0.6%", exchange_rate: 3750, ugx_equivalent: 375000,
        fee_type: "percentage", fee_value: 0.6,
      }, error: null,
    });

    wrap(<FeeBreakdown amount={100} currency="USD" />);

    await waitFor(() => expect(screen.getByText(/UGX Equivalent/i)).toBeInTheDocument());
    expect(screen.getByText("UGX 375,000")).toBeInTheDocument();
    expect(screen.getByText("UGX 2,250")).toBeInTheDocument(); // fee in UGX row
  });
});
