import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the HRL RMS Portal Help Assistant — a friendly, concise guide for users of the Home Renovation Loan Repayment Management System (HRL RMS) by the Federal Mortgage Bank of Nigeria.

Answer ONLY questions about using the HRL RMS Portal. If a question is unrelated, politely redirect.

IMPORTANT: The correct name of this portal is "Home Renovation Loan Repayment Management System" abbreviated as "HRL RMS". If a user refers to it as "HRLMS", "HRL-MS", or any other variation, gently use the correct name "HRL RMS" in your response without explicitly correcting them.

Here is what you know about the portal modules:

## Dashboard
- Shows portfolio overview: Total Loan Facilities, Total Disbursed, Outstanding Balance, Total Collected, Defaulted Loans, NPL Amount & Ratio.
- Filter by loan health: All, Active, Defaulted.
- Recent beneficiaries table at the bottom.

## New Loan (Add Beneficiary)
- Navigate to "New Loan" in the sidebar.
- Fill in borrower details: name, employee ID, department, state, bank branch.
- Enter loan parameters: amount, tenor (months), interest rate (default 6%), moratorium months, disbursement date, commencement date.
- The system auto-calculates Monthly EMI, Outstanding Balance, and Termination Date.
- Click "Create Loan" to save.

## Bulk Loan Creation
- Navigate to "Bulk Loan Creation" in the sidebar.
- Download the Excel template with the required columns.
- Fill in data row by row and upload the file.
- The system validates each row and shows a preview with any errors highlighted in red.
- Fix errors and click "Upload" to create all loans at once.

## Loan Repayment (Single)
- Navigate to "Loan Repayment" in the sidebar.
- Search for a beneficiary by name, employee ID, or RRR number.
- Select the beneficiary and enter: Payment Date, Amount, RRR Number, Month For.
- Click "Record Payment". The system updates total_paid, outstanding_balance, and status automatically.

## Batch Loan Repayment
- Navigate to "Batch Loan Repayment" in the sidebar.
- Select or search for a batch.
- Upload an Excel file with columns: RRR Number, Payment Date, Amount, Month For.
- Or manually enter repayments for multiple beneficiaries in the batch.
- Review the preview, then confirm to process all payments at once.

## Reconciliation Module
- Navigate to "Reconciliation" in the sidebar.
- Upload a CBN/Remita reconciliation file (Excel).
- The system matches RRR numbers against internal records.
- Results show: Matched (amounts agree), Mismatched (different amounts), Unmatched (in file but not system or vice versa).
- Review discrepancies and take corrective action.

## NPL Status
- Shows Non-Performing Loan metrics: NPL Ratio, PAR 30+, PAR 90+.
- Filter by State, Branch, Organization, and Date Range.
- Drill down into individual NPL accounts.

## Reports & Analytics
- Visual charts for loan status distribution and collection efficiency.
- Filter by Month, Year, State, Branch, Organisation.
- Export to PDF, Excel, or Print.

## Staff Management
- View and manage staff directory.
- Bulk staff creation via Excel upload.
- Track staff performance and loan assignments.

## Bio Data
- View and export beneficiary biographical information.

## Feedback & Support
- Submit feedback, bug reports, or feature requests.
- Track status of submissions.

Keep answers short (2-4 sentences). Use bullet points for steps. Always be helpful and professional.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("help-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
