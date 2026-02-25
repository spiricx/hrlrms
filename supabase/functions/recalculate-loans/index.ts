import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function getLastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

/**
 * Calculate the TRUE total repayment from the full Actual/365 amortization schedule.
 * Mirrors the frontend calculateLoan() function exactly.
 */
function computeTotalExpected(
  principal: number,
  annualRate: number,
  tenorMonths: number,
  moratoriumMonths: number,
  disbursementDate: Date,
): number {
  const rate = annualRate / 100;

  // === MORATORIUM: INTEREST ACCRUAL & CAPITALIZATION ===
  let balance = principal;
  let periodStart = new Date(disbursementDate);

  for (let m = 0; m < moratoriumMonths; m++) {
    const monthEnd = getLastDayOfMonth(periodStart.getFullYear(), periodStart.getMonth());
    const days = daysBetween(periodStart, monthEnd);
    const interest = round2(balance * rate * (days / 365));
    const capDate = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
    balance = round2(balance + interest);
    periodStart = capDate;
  }

  // === FIXED MONTHLY PAYMENT (PMT on original principal, r/12) ===
  const monthlyRate = rate / 12;
  const fixedPMT = round2(
    principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -tenorMonths))
  );

  const commencementDate = new Date(periodStart);

  // === REPAYMENT SCHEDULE ===
  let totalRepayment = 0;

  for (let i = 1; i <= tenorMonths; i++) {
    const refDate = new Date(commencementDate);
    refDate.setMonth(refDate.getMonth() + (i - 1));
    const payDate = getLastDayOfMonth(refDate.getFullYear(), refDate.getMonth());
    const days = payDate.getDate();
    const interest = round2(balance * rate * days / 365);

    const isLast = i === tenorMonths;
    let payment: number;
    let principalPortion: number;

    if (isLast) {
      principalPortion = round2(balance);
      payment = round2(principalPortion + interest);
    } else {
      payment = fixedPMT;
      principalPortion = round2(payment - interest);
    }

    totalRepayment += payment;
    balance = isLast ? 0 : round2(balance - principalPortion);
  }

  return round2(totalRepayment);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all beneficiaries
    const { data: beneficiaries, error: fetchError } = await supabase
      .from("beneficiaries")
      .select("id, loan_amount, interest_rate, tenor_months, moratorium_months, disbursement_date, monthly_emi, total_paid");

    if (fetchError) throw fetchError;

    const results: { id: string; name?: string; total_expected: number; outstanding_balance: number; status: string }[] = [];

    for (const b of beneficiaries || []) {
      const disbDate = new Date(b.disbursement_date + "T00:00:00");
      const totalExpected = computeTotalExpected(
        Number(b.loan_amount),
        Number(b.interest_rate),
        b.tenor_months,
        b.moratorium_months,
        disbDate,
      );

      const totalPaid = Number(b.total_paid);
      const outstanding = Math.max(0, round2(totalExpected - totalPaid));
      const status = outstanding < 0.01 ? "completed" : "active";

      const { error: updateError } = await supabase
        .from("beneficiaries")
        .update({
          total_expected: totalExpected,
          outstanding_balance: outstanding,
          status: status,
        })
        .eq("id", b.id);

      if (updateError) {
        console.error(`Error updating ${b.id}:`, updateError.message);
      }

      results.push({ id: b.id, total_expected: totalExpected, outstanding_balance: outstanding, status });
    }

    return new Response(JSON.stringify({ success: true, updated: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
