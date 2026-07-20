import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import TouristHome from './pages/TouristHome';
import BoatDetail from './pages/BoatDetail';
import HotelDashboard from './pages/HotelDashboard';
import AdminDashboard from './pages/AdminDashboard';
import OwnerDashboard from './pages/owner/OwnerDashboard';
import BoatFormPage from './pages/owner/BoatFormPage';
import MaintenancePage from './pages/owner/MaintenancePage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

const authRoutes = ['/login', '/signup', '/forgot-password', '/reset-password'];

function App() {
  const location = useLocation();
  const isAuthRoute = authRoutes.includes(location.pathname);

  const routes = (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<TouristHome />} />
        <Route path="/boats/:id" element={<BoatDetail />} />
        <Route
          path="/hotel"
          element={
            <ProtectedRoute allow={['hotel', 'admin']}>
              <HotelDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/owner"
          element={
            <ProtectedRoute allow={['owner', 'admin']}>
              <OwnerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/owner/boats/new"
          element={
            <ProtectedRoute allow={['owner', 'admin']}>
              <BoatFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/owner/boats/:id/edit"
          element={
            <ProtectedRoute allow={['owner', 'admin']}>
              <BoatFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/owner/maintenance"
          element={
            <ProtectedRoute allow={['owner', 'admin']}>
              <MaintenancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allow={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </AnimatePresence>
  );

  if (isAuthRoute) return routes;

  return <Layout>{routes}</Layout>;
}

export default App;
