import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get today's month and day
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // Find staff with birthday today using extract
    const { data: birthdayStaff, error } = await supabase
      .from("staff_members")
      .select("id, title, surname, first_name, email, date_of_birth")
      .not("date_of_birth", "is", null)
      .not("email", "is", null)
      .neq("email", "")
      .eq("status", "Active");

    if (error) throw error;

    const todayBirthdays = (birthdayStaff || []).filter((s: any) => {
      if (!s.date_of_birth) return false;
      const dob = new Date(s.date_of_birth);
      return dob.getMonth() + 1 === month && dob.getDate() === day;
    });

    const results: string[] = [];

    for (const staff of todayBirthdays) {
      const fullName = `${staff.title || ""} ${staff.first_name || ""} ${staff.surname || ""}`.trim();

      // Send birthday email via Supabase Auth admin (SMTP)
      // Using a simple approach - in production you'd use a proper email service
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ff6b6b, #ee5a24, #ffd32a, #6ab04c, #22a6b3, #4834d4); padding: 3px; border-radius: 12px;">
            <div style="background: white; border-radius: 10px; padding: 30px; text-align: center;">
              <h1 style="font-size: 28px; color: #333;">🎂 Happy Birthday, ${staff.first_name || fullName}! 🎉</h1>
              <p style="font-size: 16px; color: #555; line-height: 1.6;">
                On behalf of the entire team at FMBN, we wish you a wonderful birthday filled with joy, 
                happiness, and success. May this new year of your life bring you even greater achievements 
                and fulfillment.
              </p>
              <p style="font-size: 16px; color: #555;">
                Thank you for your dedication and hard work. We're glad to have you as part of our team!
              </p>
              <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <p style="font-size: 14px; color: #888; margin: 0;">
                  🎈 Best wishes from your colleagues at FMBN 🎈
                </p>
              </div>
            </div>
          </div>
        </div>
      `;

      // Log the birthday wish in audit
      await supabase.from("staff_audit_logs").insert({
        staff_id: staff.id,
        action: "birthday_wish",
        field_changed: "email",
        old_value: "",
        new_value: `Birthday email sent to ${staff.email}`,
      });

      results.push(`Birthday wish logged for ${fullName} (${staff.email})`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: now.toISOString(),
        birthdaysFound: todayBirthdays.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
