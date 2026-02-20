import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import App from "./pages/App";
import CategoriesSettings from "./pages/CategoriesSettings";
import Login from "./pages/Login";
import ProtectedRoute from "./routers/ProtectedRoute";
import { useAuth } from "./hooks/useAuth";

const Dashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleOpenCategoriesSettings = () => {
    navigate("/app/settings/categories");
  };

  return (
    <App
      onLogout={handleLogout}
      onOpenCategoriesSettings={handleOpenCategoriesSettings}
    />
  );
};

const CategoriesSettingsRoute = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleBack = () => {
    navigate("/app");
  };

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return <CategoriesSettings onBack={handleBack} onLogout={handleLogout} />;
};

const RootRedirect = () => {
  const { isAuthenticated } = useAuth();

  return <Navigate to={isAuthenticated ? "/app" : "/"} replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/settings/categories"
        element={
          <ProtectedRoute>
            <CategoriesSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
};

export default AppRoutes;
