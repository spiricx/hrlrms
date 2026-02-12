import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Beneficiaries from "./pages/Beneficiaries";
import BeneficiaryDetail from "./pages/BeneficiaryDetail";
import AddBeneficiary from "./pages/AddBeneficiary";
import Reports from "./pages/Reports";
import LoanRepayment from "./pages/LoanRepayment";
import NplStatus from "./pages/NplStatus";
import BatchRepayment from "./pages/BatchRepayment";
import BioData from "./pages/BioData";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/beneficiaries" element={<Beneficiaries />} />
                      <Route path="/beneficiary/:id" element={<BeneficiaryDetail />} />
                      <Route path="/add-beneficiary" element={<AddBeneficiary />} />
                      <Route path="/bio-data" element={<BioData />} />
                      <Route path="/loan-repayment" element={<LoanRepayment />} />
                      <Route path="/batch-repayment" element={<BatchRepayment />} />
                      <Route path="/npl-status" element={<NplStatus />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
