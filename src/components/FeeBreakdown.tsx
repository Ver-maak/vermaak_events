import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FeeBreakdownProps {
  amount: number;
  currency: string;
  organizationId?: string;
}

const formatCurrency = (amount: number, currency = "UGX") => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

const FeeBreakdown = ({ amount, currency, organizationId }: FeeBreakdownProps) => {
  const { data: fee, isLoading, error } = useQuery({
    queryKey: ["fee-estimate", amount, currency, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("estimate-fee", {
        body: { amount, currency, organization_id: organizationId },
      });
      if (error) throw error;
      return data as {
        fee: number;
        fee_ugx: number;
        net_amount: number;
        tier_label: string;
        exchange_rate: number;
        ugx_equivalent: number;
        fee_type: string;
        fee_value: number;
      };
    },
    enabled: amount > 0,
    staleTime: 30000,
  });

  if (!amount || amount <= 0) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
        <Loader2 className="h-3 w-3 animate-spin" />
        Calculating fee...
      </div>
    );
  }

  if (error || !fee) {
    return (
      <div className="text-sm text-destructive p-3 rounded-lg bg-destructive/10">
        Unable to calculate fee
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border text-sm">
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">Amount</span>
        <span className="font-medium">{formatCurrency(amount, currency)}</span>
      </div>

      {currency !== "UGX" && (
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            UGX Equivalent
            <Tooltip>
              <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
              <TooltipContent>Rate: 1 {currency} = {fee.exchange_rate} UGX</TooltipContent>
            </Tooltip>
          </span>
          <span>{formatCurrency(fee.ugx_equivalent, "UGX")}</span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="text-muted-foreground flex items-center gap-1">
          Transaction Fee
          <Tooltip>
            <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">{fee.tier_label}</TooltipContent>
          </Tooltip>
        </span>
        <span className="text-warning font-medium">{formatCurrency(fee.fee, currency)}</span>
      </div>

      {currency !== "UGX" && (
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>Fee in UGX</span>
          <span>{formatCurrency(fee.fee_ugx, "UGX")}</span>
        </div>
      )}

      <div className="border-t border-border pt-2 flex justify-between items-center">
        <span className="text-muted-foreground font-medium">Total Debit</span>
        <span className="font-bold text-foreground">{formatCurrency(amount + fee.fee, currency)}</span>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">Recipient Gets</span>
        <span className="text-success font-medium">{formatCurrency(amount, currency)}</span>
      </div>
    </div>
  );
};

export default FeeBreakdown;
