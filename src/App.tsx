import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import TouristHome from './pages/TouristHome';
import BoatDetail from './pages/BoatDetail';
import HotelDashboard from './pages/HotelDashboard';
import OperatorDashboard from './pages/OperatorDashboard';
import AdminDashboard from './pages/AdminDashboard';
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
          path="/operator"
          element={
            <ProtectedRoute allow={['operator', 'admin']}>
              <OperatorDashboard />
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
