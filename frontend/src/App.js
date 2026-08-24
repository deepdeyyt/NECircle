import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider } from "@/lib/auth";
import LandingPage from "@/pages/LandingPage";
import PublicTagPage from "@/pages/PublicTagPage";
import AdminPage from "@/pages/AdminPage";
import LegalPage from "@/pages/LegalPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-center" />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/p/:tagId" element={<PublicTagPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/legal/:slug" element={<LegalPage />} />
          <Route path="/login" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
