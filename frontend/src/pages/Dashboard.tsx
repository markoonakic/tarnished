import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            to="/applications"
            className="bg-secondary rounded-lg p-6 hover:bg-tertiary transition-colors"
          >
            <h2 className="text-lg font-semibold text-primary mb-2">Applications</h2>
            <p className="text-muted text-sm">View and manage your job applications</p>
          </Link>

          <Link
            to="/analytics"
            className="bg-secondary rounded-lg p-6 hover:bg-tertiary transition-colors"
          >
            <h2 className="text-lg font-semibold text-primary mb-2">Analytics</h2>
            <p className="text-muted text-sm">Visualize your job search progress</p>
          </Link>

          <Link
            to="/settings"
            className="bg-secondary rounded-lg p-6 hover:bg-tertiary transition-colors"
          >
            <h2 className="text-lg font-semibold text-primary mb-2">Settings</h2>
            <p className="text-muted text-sm">Customize themes, statuses, and more</p>
          </Link>

          {user?.is_admin && (
            <Link
              to="/admin"
              className="bg-secondary rounded-lg p-6 hover:bg-tertiary transition-colors"
            >
              <h2 className="text-lg font-semibold text-accent-purple mb-2">Admin Panel</h2>
              <p className="text-muted text-sm">Manage users and view system statistics</p>
            </Link>
          )}
        </div>
      </div>
    </Layout>
  );
}
