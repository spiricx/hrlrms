import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Pull data from the authoritative view
    const { data: loanData, error: viewError } = await supabase
      .from("v_loan_arrears")
      .select("*");

    if (viewError) throw viewError;

    const loans = loanData || [];
    const totalLoans = loans.length;

    // 2. Identify discrepancies (total_paid vs verified_total_paid from transactions)
    const discrepancies = loans.filter((l: any) => l.has_payment_discrepancy);
    const loansWithDiscrepancies = discrepancies.length;

    // 3. Portfolio aggregates from beneficiaries table (system values)
    const totalPortfolioBalance = loans.reduce(
      (s: number, l: any) => s + Number(l.outstanding_balance),
      0
    );
    const totalPaidSystem = loans.reduce(
      (s: number, l: any) => s + Number(l.total_paid),
      0
    );

    // 4. Verified aggregates from transactions
    const totalPaidTransactions = loans.reduce(
      (s: number, l: any) => s + Number(l.verified_total_paid),
      0
    );

    // 5. Recalculate verified outstanding: loan_amount + interest - verified_paid
    // Using total_expected (EMI * tenor) as total repayment obligation
    const verifiedPortfolioBalance = loans.reduce((s: number, l: any) => {
      const totalExpected = Number(l.total_expected);
      const verifiedPaid = Number(l.verified_total_paid);
      const remaining = Math.max(0, totalExpected - verifiedPaid);
      return s + remaining;
    }, 0);

    // 6. NPL and PAR metrics from the view
    const nplCount = loans.filter((l: any) => l.is_npl).length;
    const activeLoanBalance = loans
      .filter(
        (l: any) =>
          l.status !== "completed" && Number(l.outstanding_balance) > 0
      )
      .reduce((s: number, l: any) => s + Number(l.outstanding_balance), 0);
    const nplBalance = loans
      .filter((l: any) => l.is_npl)
      .reduce((s: number, l: any) => s + Number(l.outstanding_balance), 0);
    const nplRatio =
      activeLoanBalance > 0 ? (nplBalance / activeLoanBalance) * 100 : 0;

    const par30Count = loans.filter(
      (l: any) => Number(l.days_past_due) >= 30
    ).length;
    const par90Count = loans.filter(
      (l: any) => Number(l.days_past_due) >= 90
    ).length;

    // 7. Build discrepancy details (top 50 for storage)
    const discrepancyDetails = discrepancies.slice(0, 50).map((l: any) => ({
      id: l.id,
      name: l.name,
      employee_id: l.employee_id,
      state: l.state,
      system_total_paid: Number(l.total_paid),
      verified_total_paid: Number(l.verified_total_paid),
      variance: Math.round((Number(l.total_paid) - Number(l.verified_total_paid)) * 100) / 100,
      outstanding_balance: Number(l.outstanding_balance),
      days_past_due: Number(l.days_past_due),
      is_npl: l.is_npl,
    }));

    const paymentVariance =
      Math.round((totalPaidSystem - totalPaidTransactions) * 100) / 100;
    const balanceVariance =
      Math.round((totalPortfolioBalance - verifiedPortfolioBalance) * 100) /
      100;

    const status =
      loansWithDiscrepancies > 0 || Math.abs(paymentVariance) > 0.01
        ? "discrepancies_found"
        : "clean";

    // 8. Insert integrity check record
    const { error: insertError } = await supabase
      .from("integrity_checks")
      .insert({
        check_type: "daily_reconciliation",
        total_loans: totalLoans,
        loans_with_discrepancies: loansWithDiscrepancies,
        total_portfolio_balance: Math.round(totalPortfolioBalance * 100) / 100,
        verified_portfolio_balance:
          Math.round(verifiedPortfolioBalance * 100) / 100,
        balance_variance: balanceVariance,
        total_paid_system: Math.round(totalPaidSystem * 100) / 100,
        total_paid_transactions:
          Math.round(totalPaidTransactions * 100) / 100,
        payment_variance: paymentVariance,
        npl_count: nplCount,
        npl_ratio: Math.round(nplRatio * 100) / 100,
        par_30_count: par30Count,
        par_90_count: par90Count,
        discrepancy_details: discrepancyDetails,
        status,
        notes:
          status === "clean"
            ? "All financial records are synchronized."
            : `Found ${loansWithDiscrepancies} loan(s) with payment discrepancies. Total variance: ${paymentVariance}.`,
      });

    if (insertError) throw insertError;

    // 9. Auto-fix: If discrepancies found, update beneficiaries.total_paid
    // to match the verified transaction sum
    if (discrepancies.length > 0) {
      for (const d of discrepancies) {
        const verifiedPaid = Number(d.verified_total_paid);
        const loanAmount = Number(d.loan_amount);
        const totalExpected = Number(d.total_expected);
        const newOutstanding = Math.max(0, totalExpected - verifiedPaid);
        const newStatus = newOutstanding <= 0 ? "completed" : d.status === "completed" ? "active" : d.status;

        await supabase
          .from("beneficiaries")
          .update({
            total_paid: verifiedPaid,
            outstanding_balance: newOutstanding,
            status: newStatus,
          })
          .eq("id", d.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status,
        summary: {
          total_loans: totalLoans,
          discrepancies: loansWithDiscrepancies,
          payment_variance: paymentVariance,
          balance_variance: balanceVariance,
          npl_count: nplCount,
          npl_ratio: Math.round(nplRatio * 100) / 100,
          par_30: par30Count,
          par_90: par90Count,
          auto_fixed: discrepancies.length,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Integrity check failed:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
